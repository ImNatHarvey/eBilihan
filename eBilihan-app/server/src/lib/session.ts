import jwt from "jsonwebtoken";
import { config } from "../config.js";

export type SessionPayload = { ownerId: string };

export function issueSessionToken(payload: SessionPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: "30d" });
}

export function verifySessionToken(token: string): SessionPayload {
  return jwt.verify(token, config.jwtSecret) as SessionPayload;
}
