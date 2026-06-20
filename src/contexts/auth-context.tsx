import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import {
  User,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  updateProfile,
  onAuthStateChanged,
} from "firebase/auth";
import { auth, googleProvider, isConfigured, db } from "@/lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
import { useProfile, useHealthResult, useHistory } from "@/lib/health-store";
import { toast } from "sonner";

interface FirebaseError {
  code?: string;
  message?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  syncing: boolean;
  hasCompletedAssessment: boolean | null;
  setHasCompletedAssessment: React.Dispatch<React.SetStateAction<boolean | null>>;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string, name: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUserProfile: (name: string, photoUrl: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [hasCompletedAssessment, setHasCompletedAssessment] = useState<boolean | null>(null);
  const isSyncingRef = useRef(false);

  // Read local stores so we can watch them reactively
  const [profile] = useProfile();
  const [result] = useHealthResult();
  const [history] = useHistory();

  // 1. Listen to Auth changes
  useEffect(() => {
    if (!isConfigured) {
      setLoading(false);
      return;
    }

    // Safeguard timeout: if Firebase takes too long (e.g., 2.5s) to resolve,
    // fallback to guest state by setting loading to false.
    const timer = setTimeout(() => {
      setLoading((prevLoading) => {
        if (prevLoading) {
          console.warn("Firebase Auth timed out, falling back to guest mode.");
          return false;
        }
        return prevLoading;
      });
    }, 2500);

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      clearTimeout(timer);
      setUser(firebaseUser);

      if (firebaseUser && isConfigured) {
        // Fetch/create Firestore user document safely with offline fallback and timeouts
        let hasCompleted = false;
        const isOffline = !navigator.onLine;
        const uid = firebaseUser.uid;
        console.log(`[Firestore Debug] Starting flow for user ${uid}. Offline status: ${isOffline}`);
        try {
          if (isOffline) {
            throw new Error("offline");
          }
          const userDocRef = doc(db, "users", uid);

          console.log(`[Firestore Debug] Fetching user doc: users/${uid}`);
          const startTime = Date.now();
          
          // 2s timeout race to prevent hangs on flaky connections
          const userDocSnap = await Promise.race([
            getDoc(userDocRef),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 2000)),
          ]);
          
          console.log(`[Firestore Debug] Fetch completed in ${Date.now() - startTime}ms. Exists: ${userDocSnap.exists()}`);

          if (!userDocSnap.exists()) {
            const initialDoc = {
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              displayName: firebaseUser.displayName || null,
              hasCompletedAssessment: false,
              createdAt: serverTimestamp(),
              lastLoginAt: serverTimestamp(),
            };
            console.log(`[Firestore Debug] User doc does not exist. Creating via setDoc users/${uid} with payload:`, initialDoc);
            const createStartTime = Date.now();
            await setDoc(userDocRef, initialDoc);
            console.log(`[Firestore Debug] User doc created successfully in ${Date.now() - createStartTime}ms`);
            hasCompleted = false;
          } else {
            const userData = userDocSnap.data();
            console.log(`[Firestore Debug] User data retrieved:`, userData);
            hasCompleted = !!userData?.hasCompletedAssessment;

            // Standalone, non-blocking write for lastLoginAt
            try {
              console.log(`[Firestore Debug] Updating lastLoginAt for users/${uid}`);
              const updateStartTime = Date.now();
              await setDoc(userDocRef, { lastLoginAt: serverTimestamp() }, { merge: true });
              console.log(`[Firestore Debug] lastLoginAt updated successfully in ${Date.now() - updateStartTime}ms`);
            } catch (lastLoginErr) {
              console.error(`[Firestore Debug] Failed to update lastLoginAt:`, lastLoginErr);
            }
          }
          setHasCompletedAssessment(hasCompleted);
        } catch (dbErr: unknown) {
          console.error("[Firestore Debug] Error fetching/creating user doc in auth-context:", dbErr);
          const e = dbErr as { message?: string; code?: string; stack?: string };
          console.error(`[Firestore Debug] Details - Code: ${e?.code || "N/A"}, Message: ${e?.message || "N/A"}, Stack: ${e?.stack || "N/A"}`);
          const errMsg = e?.message || "";
          const isOfflineError =
            isOffline ||
            errMsg.includes("offline") ||
            e?.code === "unavailable" ||
            errMsg.includes("timeout");
          if (isOfflineError) {
            toast.error("Unable to connect. Please check your internet connection.");
            // Fallback to checking localStorage for onboarding status
            try {
              const localProfile = localStorage.getItem("hg.profile.v1");
              setHasCompletedAssessment(!!localProfile);
            } catch {
              setHasCompletedAssessment(false);
            }
          } else {
            setHasCompletedAssessment(false);
          }
        } finally {
          setLoading(false);
        }

        // Logged in: Sync from Express Backend to LocalStorage
        isSyncingRef.current = true;
        setSyncing(true);

        if (!navigator.onLine) {
          console.warn("Offline - skipping Backend sync");
          isSyncingRef.current = false;
          setSyncing(false);
          return;
        }

        try {
          // Sync Google profile photo back to Auth profile if it was overwritten by presets
          const googleInfo = firebaseUser.providerData.find((p) => p.providerId === "google.com");
          if (googleInfo && googleInfo.photoURL && firebaseUser.photoURL !== googleInfo.photoURL) {
            console.log(
              "Restoring Firebase user photoURL to Google profile picture:",
              googleInfo.photoURL,
            );
            try {
              await updateProfile(firebaseUser, { photoURL: googleInfo.photoURL });
            } catch (authErr) {
              console.error("Failed to sync auth profile photoURL:", authErr);
            }
          }

          // Fetch profile, result, and history from Express backend
          const idToken = await firebaseUser.getIdToken();
          const response = await fetch(`${API_URL}/api/profile`, {
            headers: {
              Authorization: `Bearer ${idToken}`,
            },
          });

          if (!response.ok) {
            throw new Error(`Failed to fetch profile: ${response.statusText}`);
          }

          const data = await response.json();

          if (data.profile) {
            // Sync to LocalStorage (writes will trigger custom hg:store event)
            localStorage.setItem("hg.profile.v1", JSON.stringify(data.profile));
            if (data.result) {
              localStorage.setItem("hg.result.v1", JSON.stringify(data.result));
            } else {
              localStorage.removeItem("hg.result.v1");
            }
            if (data.history) {
              localStorage.setItem("hg.history.v1", JSON.stringify(data.history));
            } else {
              localStorage.removeItem("hg.history.v1");
            }
            // Notify hooks
            window.dispatchEvent(new CustomEvent("hg:store"));
          } else {
            // Backend has no profile: sync current localStorage to backend
            const localProfile = localStorage.getItem("hg.profile.v1");
            const localResult = localStorage.getItem("hg.result.v1");
            const localHistory = localStorage.getItem("hg.history.v1");

            if (localProfile) {
              const body = {
                ...JSON.parse(localProfile),
                result: localResult ? JSON.parse(localResult) : null,
                history: localHistory ? JSON.parse(localHistory) : [],
              };

              const postResponse = await fetch(`${API_URL}/api/profile`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify(body),
              });

              if (!postResponse.ok) {
                console.error("Failed to push initial local profile to backend");
              }
            }
          }
        } catch (error: unknown) {
          console.error("Error syncing with backend:", error);
          toast.error("Could not sync assessment data with cloud account.");
        } finally {
          isSyncingRef.current = false;
          setSyncing(false);
        }
      } else {
        setHasCompletedAssessment(null);
        setLoading(false);
      }
    });

    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  // 2. Reactively sync any local changes to backend
  useEffect(() => {
    if (!user || loading || syncing || isSyncingRef.current || !isConfigured) return;

    const syncToBackend = async () => {
      if (!navigator.onLine) {
        console.warn("Offline - skipping backend sync write");
        return;
      }
      try {
        const idToken =
          typeof user.getIdToken === "function"
            ? await user.getIdToken()
            : auth.currentUser
              ? await auth.currentUser.getIdToken()
              : "mock-token";

        // We only write to backend if we have a profile to sync
        if (profile) {
          const body = {
            ...profile,
            result: result || null,
            history: history || [],
          };

          const postResponse = await fetch(`${API_URL}/api/profile`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify(body),
          });

          if (!postResponse.ok) {
            const errBody = await postResponse.json().catch(() => ({}));
            console.error("Failed writing changes to backend:", errBody);
          }
        }
      } catch (error: unknown) {
        console.error("Failed to sync changes with backend:", error);
      }
    };

    // Debounce slightly to prevent double writes on immediate successive calls
    const timer = setTimeout(syncToBackend, 500);
    return () => clearTimeout(timer);
  }, [user, profile, result, history, loading, syncing]);

  // Auth Methods
  const loginWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      toast.success("Successfully signed in with Google");
    } catch (error: unknown) {
      const e = error as FirebaseError;
      console.error(e);
      if (e.code !== "auth/popup-closed-by-user") {
        toast.error(e.message || "Google sign-in failed.");
      }
    }
  };

  const loginWithEmail = async (email: string, pass: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, pass);
      toast.success("Successfully signed in");
    } catch (error: unknown) {
      const e = error as FirebaseError;
      console.error(e);
      if (
        e.code === "auth/invalid-credential" ||
        e.code === "auth/user-not-found" ||
        e.code === "auth/wrong-password"
      ) {
        toast.error("Invalid email or password.");
      } else {
        toast.error(e.message || "Failed to sign in. Check your credentials.");
      }
      throw e;
    }
  };

  const signUpWithEmail = async (email: string, pass: string, name: string) => {
    try {
      const credential = await createUserWithEmailAndPassword(auth, email, pass);
      await updateProfile(credential.user, { displayName: name });

      // Update local state copy of User to trigger displayName
      setUser({ ...credential.user, displayName: name });

      // Create/update Firestore user document immediately to prevent race condition write of displayName as null
      if (isConfigured) {
        const userDocRef = doc(db, "users", credential.user.uid);
        await setDoc(
          userDocRef,
          {
            uid: credential.user.uid,
            email: credential.user.email,
            displayName: name,
            hasCompletedAssessment: false,
            createdAt: serverTimestamp(),
          },
          { merge: true },
        );
        setHasCompletedAssessment(false);
      }

      // Create Initial backend profile if we have one
      if (isConfigured) {
        const idToken = await credential.user.getIdToken();
        const localProfile = localStorage.getItem("hg.profile.v1");
        const localResult = localStorage.getItem("hg.result.v1");
        const localHistory = localStorage.getItem("hg.history.v1");

        if (localProfile) {
          try {
            const body = {
              ...JSON.parse(localProfile),
              result: localResult ? JSON.parse(localResult) : null,
              history: localHistory ? JSON.parse(localHistory) : [],
            };
            await fetch(`${API_URL}/api/profile`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${idToken}`,
              },
              body: JSON.stringify(body),
            });
          } catch (err) {
            console.error("Failed to sync initial profile on sign up:", err);
          }
        }
      }

      toast.success("Account created successfully");
    } catch (error: unknown) {
      const e = error as FirebaseError;
      console.error(e);
      toast.error(e.message || "Sign up failed.");
      throw e;
    }
  };

  const resetPassword = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
      toast.success("Password reset email sent. Please check your inbox.");
    } catch (error: unknown) {
      const e = error as FirebaseError;
      console.error(e);
      toast.error(e.message || "Failed to send password reset email.");
      throw e;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      // Clear local storage and state for clinical assessment privacy
      localStorage.removeItem("hg.profile.v1");
      localStorage.removeItem("hg.result.v1");
      localStorage.removeItem("hg.history.v1");
      window.dispatchEvent(new CustomEvent("hg:store"));
      toast.success("Successfully signed out");
    } catch (error: unknown) {
      const e = error as FirebaseError;
      console.error(e);
      toast.error("Logout failed.");
    }
  };

  const updateUserProfile = async (name: string, photoUrl: string) => {
    if (!user) return;
    try {
      await updateProfile(user, { displayName: name, photoURL: photoUrl });
      setUser({ ...user, displayName: name, photoURL: photoUrl });

      // Note: User profile displayName and photoURL are verified/updated via Firebase Auth ID Token.
      toast.success("Profile updated successfully");
    } catch (error: unknown) {
      const e = error as FirebaseError;
      console.error(e);
      toast.error(e.message || "Failed to update profile.");
      throw e;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        syncing,
        hasCompletedAssessment,
        setHasCompletedAssessment,
        loginWithGoogle,
        loginWithEmail,
        signUpWithEmail,
        resetPassword,
        logout,
        updateUserProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
