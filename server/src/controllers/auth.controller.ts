import { randomUUID } from "crypto";
import { Request, Response } from "express";
import Admin, { IAdmin } from "../models/Admin";
import Chef from "../models/Chef";
import TableModel from "../models/Table";
import Order from "../models/Order";
import { asyncHandler } from "../middleware/errorHandler";
import { HttpError } from "../utils/httpError";
import { comparePassword, hashPassword } from "../utils/password";
import { signToken } from "../utils/jwt";
import { decryptTableToken } from "../utils/tableToken";
import { cancelUnsentOrdersForTables } from "../utils/tableRelease";

/** Credentials must be plain strings; anything else is a malformed or crafted request. */
function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new HttpError(400, `${field} is required`);
  }
  return value;
}

export const adminLogin = asyncHandler(async (req: Request, res: Response) => {
  const username = requireString(req.body?.username, "username");
  const password = requireString(req.body?.password, "password");

  const admin = await Admin.findOne({ restaurantId: req.restaurantId, username });
  if (!admin || !(await comparePassword(password, admin.passwordHash))) {
    throw new HttpError(401, "Invalid username or password");
  }

  // Restaurants created before per-module permissions have no owner flagged; the
  // earliest account is the original admin, so promote it rather than lock it out.
  if (!admin.isOwner && !(await Admin.exists({ restaurantId: req.restaurantId, isOwner: true }))) {
    const earliest = await Admin.findOne({ restaurantId: req.restaurantId }).sort({ createdAt: 1 });
    if (earliest && earliest._id.equals(admin._id)) {
      admin.isOwner = true;
      await admin.save();
    }
  }

  const token = signToken({ role: "admin", restaurantId: req.restaurantId!, id: admin._id.toString() });
  res.json({ token, admin: adminProfile(admin) });
});

function adminProfile(admin: IAdmin) {
  return {
    id: admin._id,
    username: admin.username,
    isOwner: admin.isOwner,
    permissions: Object.fromEntries(admin.permissions ?? []),
  };
}

export const adminMe = asyncHandler(async (req: Request, res: Response) => {
  const admin = await Admin.findById(req.auth!.id);
  if (!admin) throw new HttpError(401, "Admin account no longer exists");
  res.json(adminProfile(admin));
});

export const adminSecurityQuestion = asyncHandler(async (req: Request, res: Response) => {
  const username = requireString(req.query?.username, "username");
  const admin = await Admin.findOne({ restaurantId: req.restaurantId, username });
  if (!admin) throw new HttpError(404, "No admin account with that username");
  res.json({ securityQuestion: admin.securityQuestion });
});

export const adminForgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const username = requireString(req.body?.username, "username");
  const securityAnswer = requireString(req.body?.securityAnswer, "securityAnswer");
  const newPassword = requireString(req.body?.newPassword, "newPassword");
  if (newPassword.length < 6) throw new HttpError(400, "newPassword must be at least 6 characters");

  const admin = await Admin.findOne({ restaurantId: req.restaurantId, username });
  if (!admin || !(await comparePassword(securityAnswer, admin.securityAnswerHash))) {
    throw new HttpError(401, "Security answer did not match");
  }
  admin.passwordHash = await hashPassword(newPassword);
  await admin.save();
  res.json({ message: "Password updated successfully" });
});

export const adminChangePassword = asyncHandler(async (req: Request, res: Response) => {
  const oldPassword = requireString(req.body?.oldPassword, "oldPassword");
  const newPassword = requireString(req.body?.newPassword, "newPassword");
  if (newPassword.length < 6) throw new HttpError(400, "newPassword must be at least 6 characters");

  const admin = await Admin.findById(req.auth!.id);
  if (!admin || !(await comparePassword(oldPassword, admin.passwordHash))) {
    throw new HttpError(401, "Current password is incorrect");
  }
  admin.passwordHash = await hashPassword(newPassword);
  await admin.save();
  res.json({ message: "Password updated successfully" });
});

export const chefLogin = asyncHandler(async (req: Request, res: Response) => {
  const username = requireString(req.body?.username, "username");
  const password = requireString(req.body?.password, "password");

  const chef = await Chef.findOne({ restaurantId: req.restaurantId, username });
  if (!chef || !(await comparePassword(password, chef.passwordHash))) {
    throw new HttpError(401, "Invalid username or password");
  }

  const token = signToken({ role: "chef", restaurantId: req.restaurantId!, id: chef._id.toString() });
  res.json({ token, chef: { id: chef._id, username: chef.username } });
});

export const tableLogin = asyncHandler(async (req: Request, res: Response) => {
  const {
    code,
    token: qrToken,
    password,
    currentTableId,
    startNewOrder,
    continueOrder,
  } = req.body as {
    code?: unknown;
    token?: unknown;
    password?: unknown;
    /** The table this device's own (still-valid) session already belongs to, if any - lets
     *  the server tell "you're re-scanning your own table" apart from "someone else is here". */
    currentTableId?: unknown;
    /** Guest chose "Start a new order" on the occupied-table prompt: end the previous seating
     *  (cancelling whatever never reached the kitchen) and seat this device fresh. */
    startNewOrder?: unknown;
    /** Guest chose "Continue my order": rejoin the SAME seating instead of starting one - this
     *  device may have no session of its own yet (e.g. it wasn't the one that originally
     *  signed in), so it needs a real token for the existing seating, not just a client-side
     *  redirect using state this device doesn't have. */
    continueOrder?: unknown;
  };
  if (!code && !qrToken) throw new HttpError(400, "code or token is required");

  let table;
  if (qrToken) {
    // Scanning the encrypted, table-specific QR code already proves this is the physical table stand -
    // no PIN needed on top of that (unlike the bare-code fallback below, which anyone could type in).
    const decrypted = decryptTableToken(requireString(qrToken, "token"));
    if (!decrypted || decrypted.restaurantId !== req.restaurantId) {
      throw new HttpError(401, "Invalid or expired QR code");
    }
    table = await TableModel.findOne({ _id: decrypted.tableId, restaurantId: req.restaurantId });
    if (!table) throw new HttpError(401, "Invalid or expired QR code");
  } else {
    const tableCode = requireString(code, "code");
    const tablePassword = requireString(password, "password");
    table = await TableModel.findOne({ restaurantId: req.restaurantId, code: tableCode });
    if (!table || !(await comparePassword(tablePassword, table.passwordHash))) {
      throw new HttpError(401, "Invalid table code or password");
    }
  }

  // A guest/counter table is shared - several walk-ins can order from it at once,
  // so it is never marked occupied and never blocks a new sign-in.
  if (!table.isGuest && table.status === "occupied") {
    // Whether this login attempt has already proven it belongs to this table's current
    // seating, and so deserves the friendly "continue or start new" choice rather than a
    // flat block:
    //  - code+PIN already required the correct password above - that proof of physical
    //    access is exactly the same as the original guest who seated the table, regardless
    //    of which device is asking, so it always qualifies.
    //  - the QR path takes no password, so a bare scan of ANY table's QR proves nothing on
    //    its own; it only qualifies when this device's own current session already matches
    //    this exact table (re-scanning one's own table).
    const provedIdentity = !qrToken || (typeof currentTableId === "string" && currentTableId === table._id.toString());
    if (!provedIdentity) {
      throw new HttpError(409, "This table is already occupied");
    }
    if (startNewOrder === true) {
      // Chose to start over rather than continue - end the previous seating (cancelling
      // whatever never reached the kitchen, same as an admin releasing the table) so the
      // fresh login below can seat them cleanly.
      await cancelUnsentOrdersForTables([table._id]);
      // status/sessionId are overwritten just below regardless, so nothing else to reset here.
    } else if (continueOrder === true) {
      // Rejoin the SAME seating rather than starting a new one: reuse the existing sessionId
      // (a fresh one would invalidate whichever device is already using it) and, if there's
      // an open order already, embed its id so this device lands straight on the menu instead
      // of being asked for visitor details again.
      const openOrder = await Order.findOne({ tableId: table._id, status: "open" }).sort({ createdAt: -1 });
      const token = signToken({
        role: "table",
        restaurantId: req.restaurantId!,
        id: table._id.toString(),
        tableId: table._id.toString(),
        sessionId: table.sessionId,
        ...(openOrder && { orderId: openOrder._id.toString() }),
      });
      res.json({ token, table: { id: table._id, code: table.code } });
      return;
    } else {
      // Occupied, but proven to be this same seating, and neither choice was made yet -
      // the client shows a "Continue / Start new order" prompt for this case instead of a
      // dead-end error.
      throw new HttpError(409, "You already have an order in progress at this table");
    }
  }

  let sessionId: string | undefined;
  if (!table.isGuest) {
    // A fresh id per seating: releasing the table clears it, which invalidates the
    // token the previous guest is still holding.
    sessionId = randomUUID();
    table.status = "occupied";
    table.sessionId = sessionId;
    table.occupiedAt = new Date();
    await table.save();
  }

  const token = signToken({
    role: "table",
    restaurantId: req.restaurantId!,
    id: table._id.toString(),
    tableId: table._id.toString(),
    sessionId,
  });
  res.json({ token, table: { id: table._id, code: table.code } });
});
