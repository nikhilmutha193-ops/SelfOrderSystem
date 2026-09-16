import jwt from "jsonwebtoken";

export type Role = "admin" | "chef" | "table";

export interface AuthTokenPayload {
  role: Role;
  restaurantId: string;
  id: string;
  tableId?: string;
  sessionId?: string;
  orderId?: string;
}

export function signToken(payload: AuthTokenPayload): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  const expiresIn = process.env.JWT_EXPIRES_IN || "8h";
  return jwt.sign(payload, secret, { expiresIn } as jwt.SignOptions);
}

export function verifyToken(token: string): AuthTokenPayload {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return jwt.verify(token, secret) as AuthTokenPayload;
}
