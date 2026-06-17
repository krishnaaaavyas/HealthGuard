import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  Stethoscope, 
  Send, 
  Loader2, 
  CheckCircle2, 
  Clock, 
  MessageSquare, 
  User, 
  ArrowLeft, 
  HeartPulse, 
  Activity, 
  TrendingUp, 
  AlertTriangle,
  UserPlus
} from "lucide-react";
import { isConfigured, db, auth } from "@/lib/firebase";
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";

export const Route = createFileRoute("/expert-dashboard")({
  component: ExpertDashboardPage,
});

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

// Message Subscription
function subscribeToMessages(requestId: string, onUpdate: (messages: any[]) => void) {
  if (isConfigured) {
    try {
      const q = query(
        collection(db, "expertMessages"),
        where("requestId", "==", requestId),
        orderBy("createdAt", "asc")
      );
      return onSnapshot(q, (snapshot) => {
        const messages = snapshot.docs.map((doc) => {
          const data = doc.data();
          let date = new Date();
          if (data.createdAt) {
            if (data.createdAt.seconds) {
              date = new Date(data.createdAt.seconds * 1000);
            } else {
              date = new Date(data.createdAt);
            }
          }
          return {
            id: doc.id,
            ...data,
            createdAtParsed: date
          };
        });
        onUpdate(messages);
      }, (err) => {
        console.warn("Firestore listener failed, falling back to polling:", err);
        return setupPolling(requestId, onUpdate);
      });
    } catch (e) {
      console.warn("Error setting up Firestore listener, falling back to polling:", e);
      return setupPolling(requestId, onUpdate);
    }
  } else {
    return setupPolling(requestId, onUpdate);
  }
}

function setupPolling(requestId: string, onUpdate: (messages: any[]) => void) {
  let active = true;
  const poll = async () => {
    try {
      let idToken = "mock-uid-guest";
      if (auth.currentUser) {
        idToken = await auth.currentUser.getIdToken();
      }
      const res = await fetch(`${API_URL}/api/expert-review/${requestId}/messages`, {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      if (res.ok && active) {
        const data = await res.json();
        if (data.success) {
          const formatted = data.messages.map((m: any) => ({
            ...m,
            createdAtParsed: new Date(m.createdAt)
          }));
          onUpdate(formatted);
        }
      }
    } catch (err) {
      console.error("Polling messages failed:", err);
    }
  };

  poll();
  const interval = setInterval(poll, 3000);
  return () => {
    active = false;
    clearInterval(interval);
  };
}

async function sendMessage(requestId: string, senderId: string, senderRole: "user" | "expert", message: string) {
  if (isConfigured) {
    try {
      await addDoc(collection(db, "expertMessages"), {
        requestId,
        senderId,
        senderRole,
        message,
        createdAt: serverTimestamp(),
      });
      return;
    } catch (e) {
      console.warn("Firestore addDoc failed, falling back to API:", e);
    }
  }

  // Fallback to API
  let idToken = "mock-uid-guest";
  if (auth.currentUser) {
    idToken = await auth.currentUser.getIdToken();
  }
  const res = await fetch(`${API_URL}/api/expert-review/${requestId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ message, senderRole }),
  });
  if (!res.ok) {
    throw new Error("Failed to send message via API");
  }
}

function ExpertDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [isExpert, setIsExpert] = useState(false);
  const [checkingExpert, setCheckingExpert] = useState(true);

  // Requests States
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [activeReviews, setActiveReviews] = useState<any[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);

  // Detail View State
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  
  // Chat States
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessageText, setNewMessageText] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Action states
  const [accepting, setAccepting] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [devRegistering, setDevRegistering] = useState(false);

  useEffect(() => {
    document.title = "Expert Dashboard — HealthGuard Clinical Portal";
  }, []);

  // 1. Check if verified expert
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    checkExpertStatus();
  }, [user, authLoading]);

  const checkExpertStatus = async () => {
    setCheckingExpert(true);
    try {
      let idToken = "mock-uid-guest";
      if (auth.currentUser) {
        idToken = await auth.currentUser.getIdToken();
      }
      
      // We check by requesting the pending reviews endpoint. If it returns 403, we are not an expert!
      const res = await fetch(`${API_URL}/api/expert-review/pending`, {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      if (res.ok) {
        setIsExpert(true);
        fetchLists();
      } else if (res.status === 403) {
        setIsExpert(false);
      } else {
        // network issue or fallback
        setIsExpert(false);
      }
    } catch (err) {
      console.error("Failed to verify expert role status:", err);
      setIsExpert(false);
    } finally {
      setCheckingExpert(false);
    }
  };

  const fetchLists = async () => {
    setLoadingLists(true);
    try {
      let idToken = "mock-uid-guest";
      if (auth.currentUser) {
        idToken = await auth.currentUser.getIdToken();
      }

      // 1. Fetch Pending
      const resPending = await fetch(`${API_URL}/api/expert-review/pending`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (resPending.ok) {
        const data = await resPending.json();
        setPendingRequests(data.requests);
      }

      // 2. Fetch Active accepted reviews
      const resActive = await fetch(`${API_URL}/api/expert-review/active`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (resActive.ok) {
        const data = await resActive.json();
        setActiveReviews(data.requests);
      }
    } catch (err) {
      console.error("Failed to fetch dashboard request lists:", err);
    } finally {
      setLoadingLists(false);
    }
  };

  // Setup real-time listener for the active request's chat
  useEffect(() => {
    if (!selectedRequest || (selectedRequest.status !== "accepted" && selectedRequest.status !== "completed")) {
      setMessages([]);
      return;
    }

    const unsubscribe = subscribeToMessages(selectedRequest.id, (msgs) => {
      setMessages(msgs);
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [selectedRequest?.id, selectedRequest?.status]);

  // Scroll to bottom of chat
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleDevRegisterExpert = async () => {
    setDevRegistering(true);
    try {
      let idToken = "mock-uid-guest";
      if (auth.currentUser) {
        idToken = await auth.currentUser.getIdToken();
      }
      const res = await fetch(`${API_URL}/api/expert-review/mock-expert-signup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          role: "doctor",
          specialization: "Integrative Cardiology & Metabolic Health"
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Registered successfully! Access granted.");
        setIsExpert(true);
        fetchLists();
      } else {
        toast.error(data.error || "Expert registration failed.");
      }
    } catch (err) {
      console.error("Mock registration failed:", err);
      toast.error("Network error during mock registration.");
    } finally {
      setDevRegistering(false);
    }
  };

  const handleAcceptRequest = async (requestId: string) => {
    setAccepting(true);
    try {
      let idToken = "mock-uid-guest";
      if (auth.currentUser) {
        idToken = await auth.currentUser.getIdToken();
      }
      const res = await fetch(`${API_URL}/api/expert-review/${requestId}/accept`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Request accepted successfully! Chat is now open.");
        fetchLists();
        // Update local detail state immediately
        setSelectedRequest((prev: any) => prev ? { ...prev, status: "accepted", assignedExpertId: user?.uid, assignedExpertName: data.assignedExpertName } : null);
      } else {
        toast.error(data.error || "Failed to accept request.");
      }
    } catch (err) {
      console.error("Error accepting request:", err);
      toast.error("Network error. Please try again.");
    } finally {
      setAccepting(false);
    }
  };

  const handleCompleteReview = async (requestId: string) => {
    setCompleting(true);
    try {
      let idToken = "mock-uid-guest";
      if (auth.currentUser) {
        idToken = await auth.currentUser.getIdToken();
      }
      const res = await fetch(`${API_URL}/api/expert-review/${requestId}/complete`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Review request completed successfully! Chat archived.");
        fetchLists();
        setSelectedRequest(null);
      } else {
        toast.error(data.error || "Failed to complete review.");
      }
    } catch (err) {
      console.error("Error completing review:", err);
      toast.error("Network error. Please try again.");
    } finally {
      setCompleting(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessageText.trim() || !selectedRequest || !user) return;
    setSendingMsg(true);
    try {
      await sendMessage(selectedRequest.id, user.uid, "expert", newMessageText.trim());
      setNewMessageText("");
    } catch (err) {
      console.error("Error sending message:", err);
      toast.error("Failed to send message.");
    } finally {
      setSendingMsg(false);
    }
  };

  if (authLoading || checkingExpert) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-teal" />
          <p className="text-sm font-medium text-muted-foreground">
            Verifying expert credentials...
          </p>
        </div>
      </div>
    );
  }

  if (!isExpert) {
    /* Unauthorized Expert Screen */
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
        <Card className="border-border bg-surface shadow-elevated max-w-md w-full text-center p-8">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 text-red-500 mb-6">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <CardTitle className="font-display text-2xl font-bold">Expert Portal Restricted</CardTitle>
          <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
            Your current account does not have clinical expert permissions. To view pending patient records, you must register your account in our sandbox.
          </p>
          <div className="bg-surface-muted/30 border border-border p-4 rounded-xl mt-6 text-xs text-left leading-relaxed text-muted-foreground space-y-2">
            <p className="font-bold text-foreground">🧪 Sandbox Instructions</p>
            <p>We provide a mock registration path for local validators. Click the button below to mark your Firebase UID as a verified specialist.</p>
          </div>
          <CardFooter className="flex flex-col gap-3 mt-8 p-0">
            <Button
              onClick={handleDevRegisterExpert}
              disabled={devRegistering}
              className="w-full bg-teal text-white hover:bg-teal/95 font-bold gap-2 py-5"
            >
              {devRegistering ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Registering Specialist...
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4" /> Register as Mock Expert
                </>
              )}
            </Button>
            <Button
              asChild
              variant="ghost"
              className="w-full text-xs text-muted-foreground hover:bg-muted"
            >
              <Link to="/dashboard">Return to Patient Dashboard</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Clinician Header */}
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/85 px-6 backdrop-blur">
        <Link to="/dashboard" className="flex items-center gap-2 mr-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-teal text-white">
            <HeartPulse className="h-4.5 w-4.5" strokeWidth={2.4} />
          </div>
          <span className="font-display font-bold text-sm tracking-wide">HealthGuard Expert Portal</span>
        </Link>
        <span className="inline-flex items-center rounded-full bg-teal/10 px-2 py-0.5 text-[10px] font-bold text-teal border border-teal/20 font-mono">
          CLINICAL PORTAL
        </span>

        <div className="ml-auto flex items-center gap-3">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground border border-border hover:bg-muted cursor-pointer"
          >
            <Link to="/dashboard">Back to Patient Dashboard</Link>
          </Button>
          <div className="h-8 w-px bg-border" />
          <div className="flex flex-col text-right leading-none">
            <span className="text-xs font-bold">{user?.displayName || "Medical Advisor"}</span>
            <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-mono mt-0.5">Specialist</span>
          </div>
        </div>
      </header>

      {/* Main clinical dashboard layout */}
      <main className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full grid gap-8 md:grid-cols-3">
        
        {/* Left column: List of pending & active reviews */}
        <div className="space-y-6 md:col-span-1">
          {/* Active Reviews (Reviews Accepted by this expert) */}
          <Card className="border-border bg-surface shadow-card-soft">
            <CardHeader className="pb-3 border-b border-border/50 bg-teal/5 py-3.5">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-teal flex items-center gap-2">
                <MessageSquare className="h-4 w-4" /> Active Reviews ({activeReviews.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3">
              {loadingLists ? (
                <div className="py-6 text-center text-xs text-muted-foreground flex justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-teal" /> Loading reviews...
                </div>
              ) : activeReviews.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground italic">
                  No active reviews. Accept requests below to begin.
                </div>
              ) : (
                <div className="space-y-2">
                  {activeReviews.map((req) => (
                    <button
                      key={req.id}
                      onClick={() => setSelectedRequest(req)}
                      className={`w-full text-left p-3 rounded-lg border transition-all duration-200 cursor-pointer ${
                        selectedRequest?.id === req.id
                          ? "bg-teal/10 border-teal/40 shadow-sm"
                          : "bg-surface-muted/30 border-border hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-foreground">{req.userName}</span>
                        <Badge className="bg-teal/15 text-teal text-[9px] border-teal/10 py-0 font-bold uppercase rounded-full">
                          Chat Active
                        </Badge>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1 flex justify-between">
                        <span>Risk: {req.riskSummary?.overallRisk || "Unknown"}</span>
                        <span>Updated {new Date(req.updatedAt).toLocaleDateString()}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pending Patient Requests */}
          <Card className="border-border bg-surface shadow-card-soft">
            <CardHeader className="pb-3 border-b border-border/50 bg-amber-500/5 py-3.5">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-amber-500 flex items-center gap-2">
                <Clock className="h-4 w-4" /> Pending Requests ({pendingRequests.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3">
              {loadingLists ? (
                <div className="py-6 text-center text-xs text-muted-foreground flex justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-teal" /> Loading pending...
                </div>
              ) : pendingRequests.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground italic">
                  No pending patient requests.
                </div>
              ) : (
                <div className="space-y-2">
                  {pendingRequests.map((req) => (
                    <button
                      key={req.id}
                      onClick={() => setSelectedRequest(req)}
                      className={`w-full text-left p-3 rounded-lg border transition-all duration-200 cursor-pointer ${
                        selectedRequest?.id === req.id
                          ? "bg-amber-500/5 border-amber-500/30 shadow-sm"
                          : "bg-surface-muted/30 border-border hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-foreground">{req.userName}</span>
                        <Badge className="bg-amber-500/10 text-amber-500 text-[9px] border-amber-500/10 py-0 font-bold uppercase rounded-full">
                          Pending
                        </Badge>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1.5 flex justify-between font-mono">
                        <span>Risk score: {Math.round(req.profileSnapshot?.bmi || 0)} BMI</span>
                        <span>{new Date(req.createdAt).toLocaleDateString()}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column (Colspan-2): Request details & chat room */}
        <div className="md:col-span-2">
          {!selectedRequest ? (
            /* Selected request empty state */
            <Card className="border-border border-dashed bg-surface shadow-card-soft h-full flex flex-col justify-center items-center p-12 text-center min-h-[450px]">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-teal/5 text-teal/40 mb-4 border border-teal/10">
                <Stethoscope className="h-7 w-7" />
              </div>
              <h3 className="font-display text-lg font-bold">Select a Patient Record</h3>
              <p className="text-xs text-muted-foreground mt-2 max-w-sm leading-relaxed">
                Click on any active review request or pending patient submission from the sidebar to open the patient snapshot, calculated health risk drivers, scanned foods, and direct communication room.
              </p>
            </Card>
          ) : (
            /* Detail Review View */
            <div className="space-y-6">
              {/* Patient Profile Snapshot Details */}
              <Card className="border-border bg-surface shadow-card-soft overflow-hidden">
                <div className="h-1.5 bg-gradient-to-r from-teal to-primary" />
                <CardHeader className="py-4 px-6 border-b border-border/40 flex flex-row justify-between items-center bg-surface-muted/20">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 border border-border">
                      <AvatarFallback className="bg-primary text-primary-foreground font-bold text-sm">
                        {selectedRequest.userName.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="leading-snug">
                      <CardTitle className="text-base font-bold">{selectedRequest.userName}</CardTitle>
                      <CardDescription className="text-[11px] text-muted-foreground">{selectedRequest.userEmail}</CardDescription>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {selectedRequest.status === "pending" && (
                      <Button
                        onClick={() => handleAcceptRequest(selectedRequest.id)}
                        disabled={accepting}
                        className="bg-teal text-white hover:bg-teal/95 font-bold text-xs h-9"
                      >
                        {accepting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                        )}
                        Accept Request
                      </Button>
                    )}
                    {selectedRequest.status === "accepted" && (
                      <Button
                        onClick={() => handleCompleteReview(selectedRequest.id)}
                        disabled={completing}
                        className="bg-primary text-primary-foreground hover:bg-primary/95 font-bold text-xs h-9"
                      >
                        {completing ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                        )}
                        Mark Completed
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  {/* Grid layout for snapshot & risks */}
                  <div className="grid gap-6 md:grid-cols-2">
                    {/* Demographics & Lifestyle */}
                    <div className="space-y-4">
                      <h4 className="font-display text-xs font-mono uppercase tracking-wider text-muted-foreground">Demographics & Lifestyle</h4>
                      <div className="grid grid-cols-2 gap-3 bg-surface-muted/30 p-3 rounded-lg border border-border/60 text-xs">
                        <div>Age: <span className="font-bold text-foreground">{selectedRequest.profileSnapshot?.age} years</span></div>
                        <div>Gender: <span className="font-bold text-foreground capitalize">{selectedRequest.profileSnapshot?.gender}</span></div>
                        <div>BMI: <span className="font-bold text-foreground font-mono">{selectedRequest.profileSnapshot?.bmi?.toFixed(1)}</span></div>
                        <div>Weight: <span className="font-bold text-foreground">{selectedRequest.profileSnapshot?.weight} kg</span></div>
                        <div>Height: <span className="font-bold text-foreground">{selectedRequest.profileSnapshot?.height} cm</span></div>
                        <div>Smoking: <span className="font-bold text-foreground capitalize">{selectedRequest.profileSnapshot?.lifestyle?.smoking}</span></div>
                        <div className="col-span-2">Exercise: <span className="font-bold text-foreground capitalize">{selectedRequest.profileSnapshot?.lifestyle?.exercise}</span></div>
                      </div>

                      {selectedRequest.profileSnapshot?.symptoms && (
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-mono uppercase text-muted-foreground">Symptoms Logged:</span>
                          <p className="text-xs text-muted-foreground bg-muted/40 p-2.5 rounded-lg border border-border/30 italic">
                            "{selectedRequest.profileSnapshot.symptoms}"
                          </p>
                        </div>
                      )}

                      {selectedRequest.profileSnapshot?.familyHistory && (
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-mono uppercase text-muted-foreground">Family History:</span>
                          <p className="text-xs text-muted-foreground bg-muted/40 p-2.5 rounded-lg border border-border/30">
                            {selectedRequest.profileSnapshot.familyHistory}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Calculated Health Risk Scores */}
                    <div className="space-y-4">
                      <h4 className="font-display text-xs font-mono uppercase tracking-wider text-muted-foreground">Calculated Health Risks</h4>
                      <div className="space-y-3 bg-surface-muted/30 p-4 rounded-lg border border-border/60 text-xs">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold flex items-center gap-1.5"><TrendingUp className="h-4.5 w-4.5 text-teal" /> Overall Risk:</span>
                          <Badge className="bg-teal/15 text-teal hover:bg-teal/15 font-bold uppercase rounded-full">
                            {selectedRequest.riskSummary?.overallRisk || "Unknown"}
                          </Badge>
                        </div>

                        <div className="border-t border-border/40 my-2 pt-2 space-y-2">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Diabetes Risk:</span>
                            <span className="font-bold font-mono">{Math.round(selectedRequest.riskSummary?.diabetesRisk || 0)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Heart Disease Risk:</span>
                            <span className="font-bold font-mono">{Math.round(selectedRequest.riskSummary?.heartRisk || 0)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Hypertension Risk:</span>
                            <span className="font-bold font-mono">{Math.round(selectedRequest.riskSummary?.hypertensionRisk || 0)}%</span>
                          </div>
                        </div>

                        {selectedRequest.riskSummary?.topDrivers && selectedRequest.riskSummary.topDrivers.length > 0 && (
                          <div className="border-t border-border/40 pt-2.5 space-y-1">
                            <span className="text-[10px] font-mono uppercase text-muted-foreground">Key Drivers:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {selectedRequest.riskSummary.topDrivers.map((driver: string, idx: number) => (
                                <Badge key={idx} variant="outline" className="text-[10px] bg-background border-border py-0">
                                  {driver}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Real-time Message Room for Expert */}
              {(selectedRequest.status === "accepted" || selectedRequest.status === "completed") && (
                <Card className="border-border bg-surface shadow-card-soft flex flex-col h-[500px]">
                  <CardHeader className="border-b border-border/50 py-3 px-4 flex flex-row items-center justify-between shrink-0 bg-surface-muted/20">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full animate-ping bg-teal shrink-0" />
                      <div>
                        <CardTitle className="text-xs font-bold uppercase tracking-wider text-teal">
                          Patient Chat Interface
                        </CardTitle>
                        <CardDescription className="text-[10px] text-muted-foreground">
                          Exchange medical suggestions or request clarifications
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>

                  {/* Messages container */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-surface-muted/10">
                    {messages.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center text-xs text-muted-foreground p-6">
                        <MessageSquare className="h-8 w-8 text-teal/40 mb-2" />
                        <p className="font-semibold text-foreground">Initiate Clinical Feedback</p>
                        <p className="max-w-xs mt-1 text-[11px]">Type a note below to send medical analysis or advice to the patient.</p>
                      </div>
                    ) : (
                      messages.map((msg) => {
                        const isMe = msg.senderRole === "expert";
                        return (
                          <div
                            key={msg.id}
                            className={`flex items-end gap-2 max-w-[85%] ${
                              isMe ? "ml-auto flex-row-reverse" : "mr-auto"
                            }`}
                          >
                            <Avatar className="h-6 w-6 border border-border/50 shrink-0">
                              <AvatarFallback className={`text-[9px] font-bold ${isMe ? "bg-teal text-white" : "bg-primary text-primary-foreground"}`}>
                                {isMe ? "EX" : "PT"}
                              </AvatarFallback>
                            </Avatar>
                            <div
                              className={`rounded-2xl px-3 py-2 text-xs leading-normal shadow-sm ${
                                isMe
                                  ? "bg-teal text-white rounded-br-none"
                                  : "bg-surface border border-border rounded-bl-none text-foreground"
                              }`}
                            >
                              <p className="whitespace-pre-wrap">{msg.message}</p>
                              <span className="block text-[8px] opacity-75 mt-1 font-mono text-right">
                                {msg.createdAtParsed
                                  ? msg.createdAtParsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                  : ""}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={chatBottomRef} />
                  </div>

                  {/* Input panel */}
                  <div className="border-t border-border/50 p-3 bg-surface shrink-0">
                    <form onSubmit={handleSendMessage} className="flex gap-2 items-center">
                      <Textarea
                        value={newMessageText}
                        onChange={(e) => setNewMessageText(e.target.value)}
                        placeholder={
                          selectedRequest.status === "completed"
                            ? "This review has been completed."
                            : "Type message or clinical advice..."
                        }
                        disabled={selectedRequest.status === "completed" || sendingMsg}
                        rows={1}
                        className="resize-none min-h-[40px] max-h-[80px] text-xs py-2 px-3 border-border bg-surface-muted/30 focus-visible:ring-teal"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSendMessage(e);
                          }
                        }}
                      />
                      <Button
                        type="submit"
                        disabled={selectedRequest.status === "completed" || sendingMsg || !newMessageText.trim()}
                        className="bg-teal text-white hover:bg-teal/90 h-10 w-10 shrink-0 p-0 rounded-lg shadow-sm"
                      >
                        {sendingMsg ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                    </form>
                  </div>
                </Card>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
