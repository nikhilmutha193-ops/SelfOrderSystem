import { Request } from "express";

import { IAdmin } from "../models/Admin";
import { HttpError } from "../utils/httpError";
import { AuthTokenPayload } from "../utils/jwt";

export interface RequestContext {
  restaurantId: string;
  auth: AuthTokenPayload;
  admin?: IAdmin;
}

export function getContext(req: Request): RequestContext {
  if (!req.restaurantId || !req.auth) throw new HttpError(401, "Not authenticated");
  return { restaurantId: req.restaurantId, auth: req.auth, admin: req.admin };
}
