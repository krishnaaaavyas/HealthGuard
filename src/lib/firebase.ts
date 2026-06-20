import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Check if variables are valid and not placeholders
export const isConfigured =
  !!firebaseConfig.apiKey &&
  firebaseConfig.apiKey !== "" &&
  firebaseConfig.apiKey !== "YOUR_FIREBASE_API_KEY" &&
  !firebaseConfig.apiKey.includes("placeholder");

if (!isConfigured) {
  console.warn(
    "Firebase environment variables are missing or use placeholders. HealthGuard will run in Local/Guest mode.",
  );
}

const app =
  getApps().length === 0
    ? initializeApp(
        isConfigured
          ? firebaseConfig
          : {
              apiKey: "dummy-api-key-for-local-development",
              authDomain: "healthguard-ai-guardian.firebaseapp.com",
              projectId: "healthguard-ai-guardian",
              storageBucket: "healthguard-ai-guardian.appspot.com",
              messagingSenderId: "123456789012",
              appId: "1:123456789012:web:a1b2c3d4e5f6g7h8i9j0",
            },
      )
    : getApp();

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
