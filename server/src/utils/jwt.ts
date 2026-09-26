import jwt from "jsonwebtoken";

export type Role = "admin" | "chef" | "table";

export interface AuthTokenPayload {
  role: Role;
  restaurantId: string;
  id: string;
  tableId?: string;
  sessionId?: string;
  orderId?: string;
  tv?: number;
  dev?: boolean;
  sst?: number;
}

export interface VerifiedToken extends AuthTokenPayload {
  iat?: number;
  exp?: number;
}

export const DEVICE_TOKEN_EXPIRES_IN = "7d";
export const STAFF_SESSION_MAX_SECONDS = 24 * 60 * 60;
export const DEVICE_SESSION_MAX_SECONDS = 30 * 24 * 60 * 60;

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function signToken(payload: AuthTokenPayload): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  const expiresIn = payload.dev ? DEVICE_TOKEN_EXPIRES_IN : process.env.JWT_EXPIRES_IN || "8h";
  return jwt.sign({ ...payload }, secret, { expiresIn } as jwt.SignOptions);
}

export function verifyToken(token: string): VerifiedToken {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return jwt.verify(token, secret) as VerifiedToken;
}

export function staffSessionMaxSeconds(payload: AuthTokenPayload): number {
  return payload.dev ? DEVICE_SESSION_MAX_SECONDS : STAFF_SESSION_MAX_SECONDS;
}
