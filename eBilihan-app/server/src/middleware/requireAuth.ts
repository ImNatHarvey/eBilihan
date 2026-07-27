import type { NextFunction, Request, Response } from "express";
import { verifySessionToken } from "../lib/session.js";
import { owners } from "../store/db.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      ownerId?: string;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing bearer token" });
  }
  try {
    const payload = verifySessionToken(header.slice("Bearer ".length));
    // The owner store is in-memory (see store/db.ts) — a backend restart wipes it, so a
    // token that's still cryptographically valid can point at an owner that no longer
    // exists. Reject that explicitly rather than letting downstream routes silently
    // treat the session as real (e.g. returning empty product/order lists).
    if (!owners.has(payload.ownerId)) {
      return res.status(401).json({ error: "Session no longer valid — please log in again" });
    }
    req.ownerId = payload.ownerId;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired session" });
  }
}
