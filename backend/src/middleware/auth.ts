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
  if (token.startsWith("mock-uid-") && process.env.NODE_ENV !== "production") {
    req.user = {
      uid: token.replace("mock-uid-", ""),
      email: `${token}@healthguard-ai.mock`,
      name: "Mock Patient",
    };
    return next();
  }

  // 2. Real Firebase ID Token Authentication
  if (!isConfigured) {
    if (process.env.NODE_ENV !== "production") {
      try {
        const parts = token.split(".");
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
          req.user = {
            uid: payload.user_id || payload.sub,
            email: payload.email,
            name: payload.name,
          };
          return next();
        }
      } catch (err) {
        console.warn("Failed to decode unverified JWT token for local fallback:", err);
      }
      req.user = {
        uid: "fallback-mock-user-id",
        email: "fallback-guest@healthguard-ai.mock",
        name: "Fallback Patient",
      };
      return next();
    }
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
    console.error("Token verification failed:", err);
    return res.status(401).json({ error: "Unauthorized: Invalid Token credentials" });
  }
}
