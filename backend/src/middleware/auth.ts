import { Request, Response, NextFunction } from "express";
import { admin, isConfigured } from "../firebase-admin.js";

export interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email?: string;
    name?: string;
  };
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: Missing Authorization Header" });
  }

  const token = authHeader.split("Bearer ")[1]?.trim();
  if (!token) {
    return res.status(401).json({ error: "Unauthorized: Invalid Token Format" });
  }

  // 1. Mock Authentication Fallback for local testing/dev
  const isMockAllowed =
    process.env.ENABLE_MOCK_AUTH === "true" ||
    (process.env.ENABLE_MOCK_AUTH !== "false" && !isConfigured && process.env.NODE_ENV !== "production");

  if (isMockAllowed && token.startsWith("mock-uid-")) {
    req.user = {
      uid: token.replace("mock-uid-", ""),
      email: `${token}@healthguard-ai.mock`,
      name: "Mock Patient",
    };
    return next();
  }

  // 2. Real Firebase ID Token Authentication
  if (!isConfigured) {
    return res
      .status(500)
      .json({ error: "Security Configuration Error: Firebase Admin SDK is unconfigured" });
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      name: decodedToken.name,
    };
    next();
  } catch (err: any) {
    console.error("Token verification failed:", err.message);
    return res.status(401).json({ error: "Unauthorized: Invalid Token credentials" });
  }
}
