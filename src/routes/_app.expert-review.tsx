import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useProfile, useHealthResult } from "@/lib/health-store";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  Stethoscope, 
  Send, 
  Loader2, 
  XCircle, 
  Clock, 
  MessageSquare, 
  CheckCircle2, 
  ShieldAlert, 
  ArrowRight,
  UserCheck,
  Activity
} from "lucide-react";
import { isConfigured, db, auth } from "@/lib/firebase";
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/expert-review")({
  component: ExpertReviewPage,
});

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

// Real-time listener subscription helper
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
          // Ensure we parse date nicely from serverTimestamp or ISO string
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

function ExpertReviewPage() {
  const { user } = useAuth();
  const [profile] = useProfile();
  const [result] = useHealthResult();
  const navigate = useNavigate();

  const [requests, setRequests] = useState<any[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // Chat State
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessageText, setNewMessageText] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Dev mode state
  const [devRegistering, setDevRegistering] = useState(false);

  useEffect(() => {
    document.title = "Expert Clinical Review — HealthGuard";
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    try {
      let idToken = "mock-uid-guest";
      if (auth.currentUser) {
        idToken = await auth.currentUser.getIdToken();
      }
      const res = await fetch(`${API_URL}/api/expert-review/my-requests`, {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setRequests(data.requests);
        }
      }
    } catch (err) {
      console.error("Failed to load expert review requests:", err);
    } finally {
      setLoadingRequests(false);
    }
  };

  const activeRequest = requests.find(
    (r) => r.status === "pending" || r.status === "accepted"
  ) || requests[0]; // default to latest request if none is active

  // Setup real-time listener for the active request's chat
  useEffect(() => {
    if (!activeRequest || (activeRequest.status !== "accepted" && activeRequest.status !== "completed")) {
      setMessages([]);
      return;
    }

    const unsubscribe = subscribeToMessages(activeRequest.id, (msgs) => {
      setMessages(msgs);
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [activeRequest?.id, activeRequest?.status]);

  // Scroll to bottom of chat
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleRequestReview = async () => {
    if (!profile || !result) {
      toast.error("Please complete your assessment questionnaire first.");
      return;
    }
    setSubmitting(true);
    try {
      let idToken = "mock-uid-guest";
      if (auth.currentUser) {
        idToken = await auth.currentUser.getIdToken();
      }
      const res = await fetch(`${API_URL}/api/expert-review/request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Expert review request submitted successfully.");
        fetchRequests();
      } else {
        toast.error(data.error || "Failed to submit request.");
      }
    } catch (err) {
      console.error("Error submitting expert review request:", err);
      toast.error("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelRequest = async (requestId: string) => {
    setCancelling(true);
    try {
      let idToken = "mock-uid-guest";
      if (auth.currentUser) {
        idToken = await auth.currentUser.getIdToken();
      }
      const res = await fetch(`${API_URL}/api/expert-review/${requestId}/cancel`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Review request cancelled successfully.");
        fetchRequests();
      } else {
        toast.error(data.error || "Failed to cancel request.");
      }
    } catch (err) {
      console.error("Error cancelling expert review request:", err);
      toast.error("Network error. Please try again.");
    } finally {
      setCancelling(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessageText.trim() || !activeRequest || !user) return;
    setSendingMsg(true);
    try {
      await sendMessage(activeRequest.id, user.uid, "user", newMessageText.trim());
      setNewMessageText("");
    } catch (err) {
      console.error("Error sending message:", err);
      toast.error("Failed to send message.");
    } finally {
      setSendingMsg(false);
    }
  };

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
          specialization: "Preventive Cardiology & Lifestyle Medicine"
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("🧪 Registered successfully! You are now a verified doctor expert.");
      } else {
        toast.error(data.error || "Mock registration failed.");
      }
    } catch (err) {
      console.error("Expert mock registration error:", err);
      toast.error("Failed mock registration.");
    } finally {
      setDevRegistering(false);
    }
  };

  if (loadingRequests) {
    return (
      <div className="flex h-[75vh] flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-teal" />
        <p className="mt-2 text-sm text-muted-foreground font-semibold">
          Loading Expert Review Center...
        </p>
      </div>
    );
  }

  // Determine state
  const requestCount = requests.length;
  const isPending = activeRequest?.status === "pending";
  const isAccepted = activeRequest?.status === "accepted";
  const isCompleted = activeRequest?.status === "completed";
  const isCancelled = activeRequest?.status === "cancelled";

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 lg:py-14 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Badge
            variant="secondary"
            className="rounded-full bg-teal/10 text-teal border border-teal/20"
          >
            Clinical Review Module
          </Badge>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Human Expert Review
          </h1>
          <p className="mt-2 text-muted-foreground text-sm leading-relaxed max-w-2xl">
            Submit your personalized health risk summary and food scan trends to a human medical specialist for clinical feedback and life-plan suggestions.
          </p>
        </div>

        {/* Developer sandbox shortcuts */}
        <div className="rounded-xl border border-dashed border-teal/30 bg-teal/5 p-4 max-w-xs shrink-0">
          <div className="text-[11px] font-bold text-teal uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <UserCheck className="h-3.5 w-3.5" /> Developer Sandbox
          </div>
          <p className="text-[11px] text-muted-foreground mb-3 leading-snug">
            Toggle this account as an expert to access the Doctor/Nutritionist view at <code className="bg-muted px-1 py-0.5 rounded text-[10px]">/expert-dashboard</code>.
          </p>
          <div className="flex flex-col gap-2">
            <Button
              onClick={handleDevRegisterExpert}
              size="xs"
              variant="outline"
              disabled={devRegistering}
              className="text-[10px] h-7 cursor-pointer border-teal/40 hover:bg-teal/10"
            >
              {devRegistering ? "Registering..." : "Mock Doctor Signup"}
            </Button>
            <Button
              asChild
              size="xs"
              className="text-[10px] h-7 bg-teal hover:bg-teal/95 font-semibold text-white"
            >
              <Link to="/expert-dashboard">Open Expert Dashboard <ArrowRight className="ml-1 h-3 w-3" /></Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Main Container */}
      {!requests.some(r => r.status === "pending" || r.status === "accepted" || r.status === "completed") ? (
        /* Case 1: No Request Exists */
        <Card className="border-border bg-surface shadow-card-soft overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-teal via-primary to-accent" />
          <CardHeader className="text-center pt-8 pb-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-teal/10 text-teal mb-4">
              <Stethoscope className="h-7 w-7" />
            </div>
            <CardTitle className="font-display text-2xl font-bold">Request Professional Review</CardTitle>
            <CardDescription className="max-w-md mx-auto mt-2">
              Share your digital profile, risk assessments, BMI drivers, and scanned foods securely with a clinical expert.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 px-8 py-4">
            <div className="rounded-xl border border-border bg-surface-muted/30 p-5 space-y-4 max-w-2xl mx-auto">
              <h3 className="font-display text-sm font-semibold text-foreground flex items-center gap-2">
                <Activity className="h-4 w-4 text-teal" /> What is shared with the Expert?
              </h3>
              <ul className="text-xs text-muted-foreground space-y-2 pl-6 list-disc">
                <li>Your clinical risk summary (diabetes, heart, hypertension risk results).</li>
                <li>Your profile details (age, height, weight, BMI, and lifestyle activities).</li>
                <li>Your top priority action recommendations computed by the impact engine.</li>
                <li>Your scanned food records and nutrition dashboard insights.</li>
              </ul>
            </div>
            
            {/* Safety Disclaimers */}
            <div className="max-w-2xl mx-auto border-t border-border pt-6">
              <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-4 flex gap-3">
                <ShieldAlert className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs">
                  <p className="font-bold text-foreground">Safety & Trust Disclaimer</p>
                  <p className="text-muted-foreground leading-relaxed">
                    Expert Review is for educational and lifestyle guidance only. It does not replace emergency medical care, diagnostic consulting, or prescription-based medical treatment.
                  </p>
                  <p className="text-amber-500/90 font-semibold leading-relaxed mt-1">
                    Do not share emergency symptoms here. Seek immediate emergency clinical help if you feel unwell.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="justify-center border-t border-border/40 py-6 bg-surface-muted/20">
            <Button
              onClick={handleRequestReview}
              disabled={submitting}
              className="bg-primary text-primary-foreground hover:bg-primary/95 shadow-md px-8 py-5 text-sm font-bold gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Submitting Request...
                </>
              ) : (
                <>
                  <Stethoscope className="h-4 w-4" /> Request Expert Review
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      ) : (
        /* Case 2, 3, 4: Request exists */
        <div className="grid gap-6 md:grid-cols-3">
          {/* Left panel: Status & Profile Details */}
          <div className="space-y-6">
            {/* Status Card */}
            <Card className="border-border bg-surface shadow-card-soft overflow-hidden">
              <CardHeader className="pb-4">
                <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Request Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between border-b border-border/50 pb-3">
                  <span className="text-xs text-muted-foreground">Status</span>
                  {isPending && (
                    <Badge className="bg-amber-500/10 text-amber-500 hover:bg-amber-500/10 border border-amber-500/20 gap-1 rounded-full font-bold">
                      <Clock className="h-3.5 w-3.5" /> Pending Review
                    </Badge>
                  )}
                  {isAccepted && (
                    <Badge className="bg-teal/10 text-teal hover:bg-teal/10 border border-teal/20 gap-1 rounded-full font-bold">
                      <MessageSquare className="h-3.5 w-3.5" /> Active Chat
                    </Badge>
                  )}
                  {isCompleted && (
                    <Badge className="bg-blue-500/10 text-blue-400 hover:bg-blue-500/10 border border-blue-500/20 gap-1 rounded-full font-bold">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Completed
                    </Badge>
                  )}
                </div>

                {activeRequest.assignedExpertName && (
                  <div className="flex items-center gap-3 border-b border-border/50 pb-3">
                    <Avatar className="h-9 w-9 border border-border">
                      <AvatarFallback className="bg-teal text-white font-bold text-xs">EX</AvatarFallback>
                    </Avatar>
                    <div className="leading-snug">
                      <p className="text-xs font-bold text-foreground">{activeRequest.assignedExpertName}</p>
                      <p className="text-[10px] text-muted-foreground">Assigned Expert Counselor</p>
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-1 text-[11px] text-muted-foreground leading-normal">
                  <p><strong>Submitted:</strong> {new Date(activeRequest.createdAt).toLocaleDateString()} {new Date(activeRequest.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  <p><strong>Request ID:</strong> <code className="bg-muted px-1 py-0.5 rounded text-[10px] select-all">{activeRequest.id}</code></p>
                </div>

                {isPending && (
                  <Button
                    onClick={() => handleCancelRequest(activeRequest.id)}
                    disabled={cancelling}
                    variant="outline"
                    className="w-full text-red-500 border-red-500/30 hover:bg-red-500/5 gap-1.5 h-9 text-xs"
                  >
                    {cancelling ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5" />
                    )}
                    Cancel Request
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Profile Snapshot Preview */}
            <Card className="border-border bg-surface shadow-card-soft">
              <CardHeader className="pb-3">
                <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Snapshot Shared</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs leading-normal">
                <div className="grid grid-cols-2 gap-2 bg-surface-muted/30 p-2.5 rounded-lg border border-border/60 font-mono text-[10px]">
                  <div>Age: <span className="font-bold text-foreground">{activeRequest.profileSnapshot?.age}</span></div>
                  <div>Gender: <span className="font-bold text-foreground capitalize">{activeRequest.profileSnapshot?.gender}</span></div>
                  <div>BMI: <span className="font-bold text-foreground">{activeRequest.profileSnapshot?.bmi?.toFixed(1)}</span></div>
                  <div>Weight: <span className="font-bold text-foreground">{activeRequest.profileSnapshot?.weight} kg</span></div>
                </div>

                <div className="space-y-1.5 border-t border-border/40 pt-3">
                  <p className="font-bold text-[10px] uppercase text-muted-foreground tracking-wider">Lifestyle:</p>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline" className="text-[10px] py-0">{activeRequest.profileSnapshot?.lifestyle?.smoking} smoking</Badge>
                    <Badge variant="outline" className="text-[10px] py-0">{activeRequest.profileSnapshot?.lifestyle?.exercise} exercise</Badge>
                  </div>
                </div>

                {activeRequest.profileSnapshot?.symptoms && (
                  <div className="space-y-1 border-t border-border/40 pt-3">
                    <p className="font-bold text-[10px] uppercase text-muted-foreground tracking-wider">Symptoms:</p>
                    <p className="text-muted-foreground italic text-[11px] truncate">{activeRequest.profileSnapshot.symptoms}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right panel: Chat Box or Pending State */}
          <div className="md:col-span-2">
            {isPending && (
              <Card className="border-border bg-surface shadow-card-soft h-full flex flex-col justify-center items-center p-8 text-center min-h-[350px]">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-500 mb-4 animate-pulse">
                  <Clock className="h-6 w-6" />
                </div>
                <h3 className="font-display text-lg font-bold">Review Request Pending</h3>
                <p className="text-xs text-muted-foreground mt-2 max-w-sm leading-relaxed">
                  An expert practitioner will review your clinical risk drivers, action plans, and health charts shortly. Chat will unlock automatically as soon as they accept.
                </p>
                <div className="mt-6 border-t border-border/50 pt-6 max-w-sm text-left">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Note:</p>
                  <p className="text-[10px] text-muted-foreground leading-normal mt-1">
                    Your assessment results are securely locked in the state. Once assigned, you can message the physician or nutritionist directly below.
                  </p>
                </div>
              </Card>
            )}

            {(isAccepted || isCompleted) && (
              <Card className="border-border bg-surface shadow-card-soft flex flex-col h-[550px]">
                <CardHeader className="border-b border-border/50 py-3.5 px-4 flex flex-row items-center justify-between shrink-0 bg-surface-muted/20">
                  <div className="flex items-center gap-2.5">
                    <div className="h-2 w-2 rounded-full animate-ping bg-teal shrink-0" />
                    <div>
                      <CardTitle className="text-sm font-bold flex items-center gap-1.5">
                        Clinical Chat Room
                      </CardTitle>
                      <CardDescription className="text-[10px] text-muted-foreground">
                        {isCompleted ? "Archived (Read-Only)" : "Chat active with medical advisor"}
                      </CardDescription>
                    </div>
                  </div>
                  {isCompleted && (
                    <Badge className="bg-blue-500/15 text-blue-400 border border-blue-500/20 font-bold text-[10px] rounded-full">
                      Archived
                    </Badge>
                  )}
                </CardHeader>

                {/* Messages Box */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-surface-muted/10">
                  {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center text-xs text-muted-foreground p-6">
                      <MessageSquare className="h-8 w-8 text-teal/40 mb-2" />
                      <p className="font-semibold text-foreground">Welcome to the Expert Chat</p>
                      <p className="max-w-xs mt-1 text-[11px]">The expert has accepted your request. Send a message to start receiving guidance.</p>
                    </div>
                  ) : (
                    messages.map((msg) => {
                      const isMe = msg.senderRole === "user";
                      return (
                        <div
                          key={msg.id}
                          className={`flex items-end gap-2 max-w-[85%] ${
                            isMe ? "ml-auto flex-row-reverse" : "mr-auto"
                          }`}
                        >
                          <Avatar className="h-6 w-6 border border-border/50 shrink-0">
                            <AvatarFallback className={`text-[9px] font-bold ${isMe ? "bg-primary text-primary-foreground" : "bg-teal text-white"}`}>
                              {isMe ? "ME" : "EX"}
                            </AvatarFallback>
                          </Avatar>
                          <div
                            className={`rounded-2xl px-3 py-2 text-xs leading-normal shadow-sm ${
                              isMe
                                ? "bg-primary text-primary-foreground rounded-br-none"
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

                {/* Input Panel */}
                <div className="border-t border-border/50 p-3 bg-surface shrink-0">
                  <form onSubmit={handleSendMessage} className="flex gap-2 items-center">
                    <Textarea
                      value={newMessageText}
                      onChange={(e) => setNewMessageText(e.target.value)}
                      placeholder={
                        isCompleted
                          ? "This review has been marked as completed."
                          : "Type clinical note or message to expert..."
                      }
                      disabled={isCompleted || sendingMsg}
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
                      disabled={isCompleted || sendingMsg || !newMessageText.trim()}
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
        </div>
      )}
    </div>
  );
}
