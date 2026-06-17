import express, { Response } from "express";
import { db } from "../firebase-admin.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { requireExpert } from "../middleware/requireExpert.js";

const router = express.Router();

/**
 * 1. Create review request
 * POST /api/expert-review/request
 */
router.post("/request", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) {
    return res.status(400).json({ error: "Bad Request: Missing User UID" });
  }

  try {
    // Check if an active request already exists for this user (pending or accepted)
    const requestsRef = db.collection("expertReviewRequests");
    const querySnap = await requestsRef.where("userId", "==", uid).get();
    
    // In-memory filter to support MockFirestore and real Firestore queries cleanly
    const existingRequests = querySnap.docs.map((doc: any) => doc.data());
    const hasActive = existingRequests.some(
      (r: any) => r.status === "pending" || r.status === "accepted"
    );

    if (hasActive) {
      return res.status(400).json({
        error: "Bad Request: You already have an active expert review request in progress."
      });
    }

    // Fetch user profile & latest assessment result
    const profileDoc = await db.collection("profiles").doc(uid).get();
    if (!profileDoc.exists) {
      return res.status(404).json({
        error: "Not Found: Please complete your health assessment before requesting an expert review."
      });
    }

    const profileData = profileDoc.data();
    if (!profileData || !profileData.result) {
      return res.status(400).json({
        error: "Bad Request: No assessment result found. Please complete the assessment questionnaire first."
      });
    }

    const result = profileData.result;

    // Assemble risk summary
    const riskSummary = {
      overallRisk: result.overallRisk || result.overallRiskLabel || "Unknown",
      diabetesRisk: result.risk?.diabetes ?? 0,
      heartRisk: result.risk?.heartDisease ?? 0,
      hypertensionRisk: result.risk?.hypertension ?? 0,
      topDrivers: result.factors || [],
      topActions: result.actionPriorities || []
    };

    // Assemble profile snapshot
    const profileSnapshot = {
      age: profileData.age || 0,
      gender: profileData.gender || "other",
      height: profileData.height || profileData.heightCm || 0,
      weight: profileData.weight || profileData.weightKg || 0,
      bmi: result.bmi || 0,
      lifestyle: {
        smoking: profileData.smoking || "never",
        exercise: profileData.exercise || profileData.exerciseLevel || "none",
        alcohol: profileData.alcohol || "never"
      },
      symptoms: profileData.symptoms || "",
      familyHistory: profileData.familyHistory || ""
    };

    // Create the review request document
    const newRequest = {
      userId: uid,
      userName: req.user?.name || profileData.name || "Patient",
      userEmail: req.user?.email || profileData.email || "patient@healthguard-ai.mock",
      status: "pending",
      assignedExpertId: null,
      assignedExpertName: null,
      riskSummary,
      profileSnapshot,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const docRef = await requestsRef.add(newRequest);

    return res.json({
      success: true,
      requestId: docRef.id
    });
  } catch (err: any) {
    console.error("Error creating expert review request:", err);
    return res.status(500).json({ error: "Internal Server Error: Failed to request review" });
  }
});

/**
 * 2. Get my review requests
 * GET /api/expert-review/my-requests
 */
router.get("/my-requests", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) {
    return res.status(400).json({ error: "Bad Request: Missing User UID" });
  }

  try {
    const querySnap = await db.collection("expertReviewRequests")
      .where("userId", "==", uid)
      .get();

    const requests = querySnap.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data()
    }));

    // Sort in-memory desc by createdAt
    requests.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return res.json({
      success: true,
      requests
    });
  } catch (err: any) {
    console.error("Error fetching my requests:", err);
    return res.status(500).json({ error: "Internal Server Error: Failed to fetch requests" });
  }
});

/**
 * 3. Cancel request
 * PATCH /api/expert-review/:requestId/cancel
 */
router.patch("/:requestId/cancel", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  const { requestId } = req.params;

  if (!uid || !requestId) {
    return res.status(400).json({ error: "Bad Request: Missing UID or Request ID" });
  }

  try {
    const docRef = db.collection("expertReviewRequests").doc(requestId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({ error: "Not Found: Request not found" });
    }

    const data = docSnap.data();
    if (data.userId !== uid) {
      return res.status(403).json({ error: "Forbidden: You do not own this request" });
    }

    if (data.status !== "pending") {
      return res.status(400).json({
        error: `Bad Request: Cannot cancel request in '${data.status}' status.`
      });
    }

    await docRef.update({
      status: "cancelled",
      updatedAt: new Date().toISOString()
    });

    return res.json({
      success: true,
      message: "Request cancelled successfully"
    });
  } catch (err: any) {
    console.error("Error cancelling request:", err);
    return res.status(500).json({ error: "Internal Server Error: Failed to cancel request" });
  }
});

/**
 * 4. Get pending requests (Expert only)
 * GET /api/expert-review/pending
 */
router.get("/pending", requireAuth, requireExpert, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const querySnap = await db.collection("expertReviewRequests")
      .where("status", "==", "pending")
      .get();

    const requests = querySnap.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data()
    }));

    requests.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return res.json({
      success: true,
      requests
    });
  } catch (err: any) {
    console.error("Error fetching pending requests:", err);
    return res.status(500).json({ error: "Internal Server Error: Failed to fetch pending reviews" });
  }
});

/**
 * Get active requests for expert
 * GET /api/expert-review/active
 */
router.get("/active", requireAuth, requireExpert, async (req: AuthenticatedRequest, res: Response) => {
  const expertUid = req.user?.uid;
  try {
    const querySnap = await db.collection("expertReviewRequests")
      .where("assignedExpertId", "==", expertUid)
      .get();
    
    const requests = querySnap.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data()
    }));

    // Filter to only accepted in-memory
    const active = requests.filter((r: any) => r.status === "accepted");
    active.sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    return res.json({
      success: true,
      requests: active
    });
  } catch (err: any) {
    console.error("Error fetching active expert reviews:", err);
    return res.status(500).json({ error: "Failed to fetch active reviews" });
  }
});


/**
 * 5. Accept request (Expert only)
 * PATCH /api/expert-review/:requestId/accept
 */
router.patch("/:requestId/accept", requireAuth, requireExpert, async (req: AuthenticatedRequest, res: Response) => {
  const { requestId } = req.params;
  const expertUid = req.user?.uid;
  const expertName = (req as any).expert?.name || "Expert Advisor";

  if (!requestId || !expertUid) {
    return res.status(400).json({ error: "Bad Request: Missing parameters" });
  }

  try {
    const docRef = db.collection("expertReviewRequests").doc(requestId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({ error: "Not Found: Request not found" });
    }

    const data = docSnap.data();
    if (data.status !== "pending") {
      return res.status(400).json({
        error: `Bad Request: Cannot accept request in '${data.status}' status.`
      });
    }

    await docRef.update({
      status: "accepted",
      assignedExpertId: expertUid,
      assignedExpertName: expertName,
      updatedAt: new Date().toISOString()
    });

    return res.json({
      success: true,
      message: "Request accepted successfully",
      assignedExpertName: expertName
    });
  } catch (err: any) {
    console.error("Error accepting request:", err);
    return res.status(500).json({ error: "Internal Server Error: Failed to accept request" });
  }
});

/**
 * 6. Complete review (Expert only)
 * PATCH /api/expert-review/:requestId/complete
 */
router.patch("/:requestId/complete", requireAuth, requireExpert, async (req: AuthenticatedRequest, res: Response) => {
  const { requestId } = req.params;
  const expertUid = req.user?.uid;

  if (!requestId || !expertUid) {
    return res.status(400).json({ error: "Bad Request: Missing parameters" });
  }

  try {
    const docRef = db.collection("expertReviewRequests").doc(requestId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({ error: "Not Found: Request not found" });
    }

    const data = docSnap.data();
    if (data.status !== "accepted") {
      return res.status(400).json({
        error: `Bad Request: Cannot complete request in '${data.status}' status.`
      });
    }

    if (data.assignedExpertId !== expertUid) {
      return res.status(403).json({
        error: "Forbidden: You are not the assigned expert for this review."
      });
    }

    await docRef.update({
      status: "completed",
      updatedAt: new Date().toISOString()
    });

    return res.json({
      success: true,
      message: "Review marked as completed successfully"
    });
  } catch (err: any) {
    console.error("Error completing review:", err);
    return res.status(500).json({ error: "Internal Server Error: Failed to complete review" });
  }
});

/**
 * 7. Mock Expert Register/Signup
 * POST /api/expert-review/mock-expert-signup
 */
router.post("/mock-expert-signup", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) {
    return res.status(400).json({ error: "Bad Request: Missing User UID" });
  }

  try {
    const name = req.body.name || req.user?.name || "Mock Specialist";
    const email = req.body.email || req.user?.email || `${uid}@healthguard-ai.mock`;
    const role = req.body.role || "doctor"; // doctor | nutritionist
    const specialization = req.body.specialization || "General Medicine & Health Coaching";

    const expertRef = db.collection("experts").doc(uid);
    await expertRef.set({
      uid,
      name,
      email,
      role,
      specialization,
      verified: true,
      createdAt: new Date().toISOString()
    });

    return res.json({
      success: true,
      message: `Successfully registered as a verified expert (${role})`,
      expert: { uid, name, role, specialization }
    });
  } catch (err: any) {
    console.error("Error registering mock expert:", err);
    return res.status(500).json({ error: "Internal Server Error: Failed to register expert" });
  }
});

/**
 * 8. Get messages for request
 * GET /api/expert-review/:requestId/messages
 */
router.get("/:requestId/messages", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { requestId } = req.params;
  try {
    const querySnap = await db.collection("expertMessages")
      .where("requestId", "==", requestId)
      .get();
    
    const messages = querySnap.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data()
    }));

    // Sort in-memory by createdAt asc
    messages.sort((a: any, b: any) => {
      const ta = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt).getTime();
      const tb = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt).getTime();
      return ta - tb;
    });

    return res.json({
      success: true,
      messages
    });
  } catch (err: any) {
    console.error("Error fetching messages:", err);
    return res.status(500).json({ error: "Internal Server Error: Failed to fetch messages" });
  }
});

/**
 * 9. Send message
 * POST /api/expert-review/:requestId/messages
 */
router.post("/:requestId/messages", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { requestId } = req.params;
  const uid = req.user?.uid;
  const { message, senderRole } = req.body;

  if (!uid || !message || !senderRole) {
    return res.status(400).json({ error: "Bad Request: Missing message or senderRole" });
  }

  try {
    const newMessage = {
      requestId,
      senderId: uid,
      senderRole, // "user" | "expert"
      message,
      createdAt: new Date().toISOString()
    };

    const docRef = await db.collection("expertMessages").add(newMessage);

    return res.json({
      success: true,
      messageId: docRef.id,
      message: { id: docRef.id, ...newMessage }
    });
  } catch (err: any) {
    console.error("Error sending message:", err);
    return res.status(500).json({ error: "Internal Server Error: Failed to send message" });
  }
});

export default router;

