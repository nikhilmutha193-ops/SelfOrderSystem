import { Request } from "express";

import Admin from "../models/Admin";
import AuditLog from "../models/AuditLog";
import { describeError, logger } from "./logger";

export async function writeAudit(req: Request, action: string, summary: string): Promise<void> {
  try {
    let actorName = "system";
    const actorId = req.auth?.id;
    if (req.admin?.username) {
      actorName = req.admin.username;
    } else if (actorId) {
      const admin = await Admin.findById(actorId).select("username");
      if (admin) actorName = admin.username;
    }
    await AuditLog.create({ restaurantId: req.restaurantId, actorName, actorId, action, summary });
  } catch (err) {
    logger.error("audit: failed to record", { action, ...describeError(err) });
  }
}
