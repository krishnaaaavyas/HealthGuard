import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "./auth.js";
import { db } from "../firebase-admin.js";

export async function requireExpert(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || !req.user.uid) {
    return res.status(401).json({ error: "Unauthorized: Missing user authentication context" });
  }

  try {
    const expertDoc = await db.collection("experts").doc(req.user.uid).get();
    if (!expertDoc.exists) {
      return res.status(403).json({ error: "Forbidden: User is not registered as an expert" });
    }

    const expertData = expertDoc.data();
    if (!expertData || expertData.verified !== true) {
      return res.status(403).json({ error: "Forbidden: Expert account is not verified" });
    }

    // Attach expert data to request
    (req as any).expert = expertData;

    next();
  } catch (err: any) {
    console.error("Error in requireExpert middleware:", err);
    return res.status(500).json({ error: "Internal Server Error in authorization check" });
  }
}
