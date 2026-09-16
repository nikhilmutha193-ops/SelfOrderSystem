import { Request, Response, NextFunction } from "express";
import Admin, { IAdmin } from "../models/Admin";
import TableModel from "../models/Table";
import { verifyToken, AuthTokenPayload, Role } from "../utils/jwt";
import { ModuleKey } from "../utils/permissions";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthTokenPayload;
      restaurantId?: string;
      admin?: IAdmin;
    }
  }
}

export function requireAuth(...roles: Role[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Missing or invalid Authorization header" });
    }
    const token = header.slice("Bearer ".length);
    try {
      const payload = verifyToken(token);
      if (roles.length > 0 && !roles.includes(payload.role)) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }

      // A table token stays cryptographically valid after staff release the table,
      // so check the seating is still the one the token was issued for.
      if (payload.role === "table" && payload.tableId) {
        const table = await TableModel.findById(payload.tableId).select("sessionId isGuest");
        if (!table) {
          return res.status(401).json({ message: "This table session has ended" });
        }
        // Guest tables host several walk-ins at once, so there is no single seating
        // to match against; their sessions end with the token or the order.
        if (!table.isGuest && (!table.sessionId || table.sessionId !== payload.sessionId)) {
          return res.status(401).json({ message: "This table session has ended" });
        }
      }

      req.auth = payload;
      next();
    } catch {
      return res.status(401).json({ message: "Invalid or expired token" });
    }
  };
}

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Gates a route on one admin module. Permissions are read from the database per
 * request rather than the token, so revoking access takes effect immediately.
 * Non-admin roles pass through - requireAuth already scoped them.
 */
export function requireModule(module: ModuleKey) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.auth?.role !== "admin") return next();

    try {
      const admin = req.admin ?? (await Admin.findById(req.auth.id));
      if (!admin) return res.status(401).json({ message: "Admin account no longer exists" });
      req.admin = admin;

      if (!admin.isOwner) {
        const level = admin.permissions?.get(module);
        const allowed = READ_METHODS.has(req.method) ? level === "view" || level === "edit" : level === "edit";
        if (!allowed) {
          return res.status(403).json({ message: `You don't have access to ${module}` });
        }
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
