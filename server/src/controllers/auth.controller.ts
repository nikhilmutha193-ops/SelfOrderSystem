import { randomUUID } from "crypto";
import { Request, Response } from "express";

import { asyncHandler } from "../middleware/errorHandler";
import { findActiveReservationForTable } from "../modules/bookings/bookings.service";
import Admin, { IAdmin, LoginArea } from "../models/Admin";
import Chef from "../models/Chef";
import Order from "../models/Order";
import OrderItem from "../models/OrderItem";
import Restaurant from "../models/Restaurant";
import TableModel from "../models/Table";
import { getBusinessDayStart } from "../utils/businessDay";
import { HttpError } from "../utils/httpError";
import {
  AuthTokenPayload,
  nowSeconds,
  signToken,
  staffSessionMaxSeconds,
} from "../utils/jwt";
import { tokenLoginAllowed } from "./restaurant.controller";
import { comparePassword, hashPassword } from "../utils/password";
import { effectivePermissions } from "../utils/permissions";
import { cancelUnsentOrdersForTables } from "../utils/tableRelease";
import { decryptTableToken } from "../utils/tableToken";

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new HttpError(400, `${field} is required`);
  }
  return value;
}

const AREA_NAMES: Record<LoginArea | "chef", string> = {
  admin: "admin portal",
  cashier: "Cashier (POS)",
  captain: "Captain app",
  chef: "kitchen screen",
};

/**
 * Each sign-in page lets in only the logins that belong there: a cashier or captain login uses its own page,
 * while admin logins (and the owner) can use any page they have access to.
 */
function assertMayUseSignIn(admin: IAdmin, area: LoginArea | "chef") {
  if (admin.isOwner) return;
  const own = admin.loginArea ?? "admin";
  if (own !== "admin" && own !== area) {
    throw new HttpError(
      403,
      `This login is for the ${AREA_NAMES[own]} sign-in page. Please use that page.`,
    );
  }
  const needs =
    area === "cashier"
      ? "pos"
      : area === "captain"
        ? "captain"
        : area === "chef"
          ? "kot"
          : null;
  if (needs && !effectivePermissions(admin)[needs]) {
    throw new HttpError(
      403,
      `This login does not have access to the ${AREA_NAMES[area]}.`,
    );
  }
}

export const adminLogin = asyncHandler(async (req: Request, res: Response) => {
  const username = requireString(req.body?.username, "username");
  const password = requireString(req.body?.password, "password");

  const admin = await Admin.findOne({
    restaurantId: req.restaurantId,
    username,
  });
  if (!admin || !(await comparePassword(password, admin.passwordHash))) {
    throw new HttpError(401, "Invalid username or password");
  }
  const area = ["admin", "cashier", "captain", "chef"].includes(req.body?.area)
    ? req.body.area
    : "admin";

  if (
    !admin.isOwner &&
    !(await Admin.exists({ restaurantId: req.restaurantId, isOwner: true }))
  ) {
    const earliest = await Admin.findOne({
      restaurantId: req.restaurantId,
    }).sort({ createdAt: 1 });
    if (earliest && earliest._id.equals(admin._id)) {
      admin.isOwner = true;
      await admin.save();
    }
  }
  assertMayUseSignIn(admin, area);

  const token = signToken({
    role: "admin",
    restaurantId: req.restaurantId!,
    id: admin._id.toString(),
    tv: admin.tokenVersion ?? 0,
    sst: nowSeconds(),
  });
  res.json({ token, admin: adminProfile(admin) });
});

function adminProfile(admin: IAdmin) {
  return {
    id: admin._id,
    username: admin.username,
    isOwner: admin.isOwner,
    loginArea: admin.loginArea ?? "admin",
    permissions: effectivePermissions(admin),
  };
}

export const adminMe = asyncHandler(async (req: Request, res: Response) => {
  const admin = await Admin.findById(req.auth!.id);
  if (!admin) throw new HttpError(401, "Admin account no longer exists");
  res.json(adminProfile(admin));
});

export const adminSecurityQuestion = asyncHandler(
  async (req: Request, res: Response) => {
    const username = requireString(req.query?.username, "username");
    const admin = await Admin.findOne({
      restaurantId: req.restaurantId,
      username,
    });
    if (!admin) throw new HttpError(404, "No admin account with that username");
    res.json({ securityQuestion: admin.securityQuestion });
  },
);

export const adminForgotPassword = asyncHandler(
  async (req: Request, res: Response) => {
    const username = requireString(req.body?.username, "username");
    const securityAnswer = requireString(
      req.body?.securityAnswer,
      "securityAnswer",
    );
    const newPassword = requireString(req.body?.newPassword, "newPassword");
    if (newPassword.length < 6)
      throw new HttpError(400, "newPassword must be at least 6 characters");

    const admin = await Admin.findOne({
      restaurantId: req.restaurantId,
      username,
    });
    if (
      !admin ||
      !(await comparePassword(securityAnswer, admin.securityAnswerHash))
    ) {
      throw new HttpError(401, "Security answer did not match");
    }
    admin.passwordHash = await hashPassword(newPassword);
    admin.tokenVersion = (admin.tokenVersion ?? 0) + 1;
    await admin.save();
    res.json({ message: "Password updated successfully" });
  },
);

export const adminChangePassword = asyncHandler(
  async (req: Request, res: Response) => {
    const oldPassword = requireString(req.body?.oldPassword, "oldPassword");
    const newPassword = requireString(req.body?.newPassword, "newPassword");
    if (newPassword.length < 6)
      throw new HttpError(400, "newPassword must be at least 6 characters");

    const admin = await Admin.findById(req.auth!.id);
    if (!admin || !(await comparePassword(oldPassword, admin.passwordHash))) {
      throw new HttpError(401, "Current password is incorrect");
    }
    admin.passwordHash = await hashPassword(newPassword);
    admin.tokenVersion = (admin.tokenVersion ?? 0) + 1;
    await admin.save();
    const token = signToken({
      role: "admin",
      restaurantId: req.restaurantId!,
      id: admin._id.toString(),
      tv: admin.tokenVersion,
      dev: req.auth!.dev,
      sst: nowSeconds(),
    });
    res.json({ message: "Password updated successfully", token });
  },
);

export const chefLogin = asyncHandler(async (req: Request, res: Response) => {
  const username = requireString(req.body?.username, "username");
  const password = requireString(req.body?.password, "password");

  const chef = await Chef.findOne({ restaurantId: req.restaurantId, username });
  if (!chef || !(await comparePassword(password, chef.passwordHash))) {
    throw new HttpError(401, "Invalid username or password");
  }

  const token = signToken({
    role: "chef",
    restaurantId: req.restaurantId!,
    id: chef._id.toString(),
    tv: chef.tokenVersion ?? 0,
    dev: req.body?.keepSignedIn === true,
    sst: nowSeconds(),
  });
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
    currentTableId?: unknown;
    startNewOrder?: unknown;
    continueOrder?: unknown;
  };
  if (!code && !qrToken) throw new HttpError(400, "code or token is required");

  // The admin can switch either way of signing in to a table off (for example when staff take every order).
  const loginSettings = (
    await Restaurant.findById(req.restaurantId).select("tableLoginSettings")
  )?.tableLoginSettings;
  if (qrToken && loginSettings?.allowQrLogin === false) {
    throw new HttpError(
      403,
      "Signing in with the table QR code is turned off. Please ask the staff to place your order.",
    );
  }
  if (!qrToken && loginSettings?.allowPinLogin === false) {
    throw new HttpError(
      403,
      "Signing in with a table code and PIN is turned off. Please ask the staff to place your order.",
    );
  }

  let table;
  if (qrToken) {
    const decrypted = decryptTableToken(requireString(qrToken, "token"));
    if (!decrypted || decrypted.restaurantId !== req.restaurantId) {
      throw new HttpError(401, "Invalid or expired QR code");
    }
    table = await TableModel.findOne({
      _id: decrypted.tableId,
      restaurantId: req.restaurantId,
    });
    if (!table) throw new HttpError(401, "Invalid or expired QR code");
  } else {
    const tableCode = requireString(code, "code");
    const tablePassword = requireString(password, "password");
    table = await TableModel.findOne({
      restaurantId: req.restaurantId,
      code: tableCode,
    });
    if (!table || !(await comparePassword(tablePassword, table.passwordHash))) {
      throw new HttpError(401, "Invalid table code or password");
    }
  }

  // A table currently held by a confirmed booking can't be grabbed by a walk-in via QR/code
  // login - it stays reserved for the booked party until staff mark them seated (or the
  // booking is cancelled/no-show). Checked before the ordinary occupied-check below, and
  // regardless of table status, since a reserved table might otherwise still show "available".
  const reservation = await findActiveReservationForTable(
    req.restaurantId!,
    table._id.toString(),
  );
  if (reservation) {
    throw new HttpError(
      409,
      "This table is reserved right now. Please check with staff.",
    );
  }

  if (!table.isGuest && table.status !== "available") {
    const provedIdentity =
      !qrToken ||
      (typeof currentTableId === "string" &&
        currentTableId === table._id.toString());
    if (!provedIdentity) {
      throw new HttpError(409, "This table is already occupied");
    }
    if (startNewOrder === true) {
      await cancelUnsentOrdersForTables([table._id]);
      // status/sessionId are overwritten just below regardless, so nothing else to reset here.
    } else if (continueOrder === true) {
      const openOrder = await Order.findOne({
        tableId: table._id,
        status: { $in: ["open", "billed"] },
      }).sort({
        createdAt: -1,
      });
      const token = signToken({
        role: "table",
        restaurantId: req.restaurantId!,
        id: table._id.toString(),
        tableId: table._id.toString(),
        sessionId: table.sessionId,
        via: qrToken ? "qr" : "code",
        ...(openOrder && { orderId: openOrder._id.toString() }),
      });
      res.json({ token, table: { id: table._id, code: table.code } });
      return;
    } else {
      throw new HttpError(
        409,
        "You already have an order in progress at this table",
      );
    }
  }

  let sessionId: string | undefined;
  if (!table.isGuest) {
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
    via: qrToken ? "qr" : "code",
  });
  res.json({ token, table: { id: table._id, code: table.code } });
});

/**
 * A guest with a receipt signs in by the token number printed on it (when the admin allows it), to watch their
 * order, see the menu, leave feedback and send quick requests. The session belongs to that one order and cannot
 * order more until the guest picks a table with `tokenSeat`.
 */
export const tokenLogin = asyncHandler(async (req: Request, res: Response) => {
  const tokenNumber = Number(req.body?.token);
  if (
    !Number.isInteger(tokenNumber) ||
    tokenNumber < 1 ||
    tokenNumber > 99999
  ) {
    throw new HttpError(400, "Enter the token number from your receipt");
  }
  const restaurant = await Restaurant.findById(req.restaurantId).select(
    "serviceFlow tableLoginSettings dayEndTime timezone",
  );
  if (!restaurant || !tokenLoginAllowed(restaurant))
    throw new HttpError(404, "Token sign-in is not available here");

  // Tokens restart every business day, so only today's count.
  const since = getBusinessDayStart(
    new Date(),
    restaurant.dayEndTime,
    restaurant.timezone,
  );
  const item = await OrderItem.findOne({
    restaurantId: req.restaurantId,
    tokenNumber,
    kotPrintedAt: { $gte: since },
  })
    .sort({ kotPrintedAt: -1 })
    .select("orderId");
  if (!item)
    throw new HttpError(
      404,
      "We couldn't find that token today. Check the number on your receipt.",
    );

  const token = signToken({
    role: "table",
    restaurantId: req.restaurantId!,
    id: `token-${tokenNumber}`,
    orderId: item.orderId.toString(),
    via: "token",
  });
  res.json({ token, tokenNumber });
});

/**
 * A token session picks the table they are sitting at: the table is taken, the token's order moves to it and the
 * guest gets a normal table session, so they can order from that table from now on.
 */
export const tokenSeat = asyncHandler(async (req: Request, res: Response) => {
  const auth = req.auth!;
  if (auth.via !== "token" || !auth.orderId)
    throw new HttpError(403, "Sign in with your token number first");
  // The table is named by the QR code the guest scanned, or by the number they typed.
  let table;
  if (req.body?.token) {
    const decrypted = decryptTableToken(requireString(req.body.token, "token"));
    if (!decrypted || decrypted.restaurantId !== req.restaurantId)
      throw new HttpError(401, "Invalid or expired QR code");
    table = await TableModel.findOne({
      _id: decrypted.tableId,
      restaurantId: req.restaurantId,
      isGuest: { $ne: true },
    });
  } else {
    const tableCode = requireString(req.body?.code, "code").trim();
    const tables = await TableModel.find({
      restaurantId: req.restaurantId,
      isGuest: { $ne: true },
    });
    table = tables.find(
      (t) => t.code.toLowerCase() === tableCode.toLowerCase(),
    );
  }
  if (!table)
    throw new HttpError(
      404,
      "We couldn't find that table. Check the number on the table.",
    );
  if (
    await findActiveReservationForTable(req.restaurantId!, table._id.toString())
  ) {
    throw new HttpError(
      409,
      "This table is reserved right now. Please check with staff.",
    );
  }
  if (table.status !== "available")
    throw new HttpError(409, "This table is already occupied");

  const order = await Order.findOne({
    _id: auth.orderId,
    restaurantId: req.restaurantId,
  });
  if (!order) throw new HttpError(404, "Order not found");
  if (order.status === "cancelled")
    throw new HttpError(409, "This order was cancelled");

  const sessionId = randomUUID();
  const claimed = await TableModel.updateOne(
    { _id: table._id, status: "available" },
    { $set: { status: "occupied", sessionId, occupiedAt: new Date() } },
  );
  if (claimed.modifiedCount === 0)
    throw new HttpError(409, "This table is already occupied");
  await Order.updateOne(
    { _id: order._id },
    { $set: { tableId: table._id, orderType: "dine-in" } },
  );

  const token = signToken({
    role: "table",
    restaurantId: req.restaurantId!,
    id: table._id.toString(),
    tableId: table._id.toString(),
    sessionId,
    via: req.body?.token ? "qr" : "code",
    orderId: order._id.toString(),
  });
  res.json({ token, table: { id: table._id, code: table.code } });
});

/**
 * A guest who is already signed in to a table can follow an order by its token number: the order is given to
 * their table (if it has none yet) and their table session keeps working, now pointing at that order.
 */
export const tokenLink = asyncHandler(async (req: Request, res: Response) => {
  const auth = req.auth!;
  if (!auth.tableId || auth.via === "token") throw new HttpError(403, "Sign in to your table first");
  const tokenNumber = Number(req.body?.token);
  if (!Number.isInteger(tokenNumber) || tokenNumber < 1 || tokenNumber > 99999) {
    throw new HttpError(400, "Enter the token number from your receipt");
  }
  const restaurant = await Restaurant.findById(req.restaurantId).select("serviceFlow tableLoginSettings dayEndTime timezone");
  if (!restaurant || !tokenLoginAllowed(restaurant)) throw new HttpError(404, "Token tracking is not available here");

  const since = getBusinessDayStart(new Date(), restaurant.dayEndTime, restaurant.timezone);
  const item = await OrderItem.findOne({ restaurantId: req.restaurantId, tokenNumber, kotPrintedAt: { $gte: since } })
    .sort({ kotPrintedAt: -1 })
    .select("orderId");
  if (!item) throw new HttpError(404, "We couldn't find that token today. Check the number on your receipt.");

  const order = await Order.findOne({ _id: item.orderId, restaurantId: req.restaurantId });
  if (!order || order.status === "cancelled") throw new HttpError(404, "We couldn't find that order.");
  if (order.tableId && order.tableId.toString() !== auth.tableId) {
    throw new HttpError(409, "That order already belongs to another table");
  }
  if (!order.tableId) await Order.updateOne({ _id: order._id }, { $set: { tableId: auth.tableId, orderType: "dine-in" } });

  const token = signToken({
    role: "table",
    restaurantId: req.restaurantId!,
    id: auth.id,
    tableId: auth.tableId,
    sessionId: auth.sessionId,
    via: auth.via,
    orderId: order._id.toString(),
  });
  res.json({ token, tokenNumber });
});

export const refreshSession = asyncHandler(
  async (req: Request, res: Response) => {
    const auth = req.auth!;
    const startedAt = auth.sst ?? nowSeconds();
    if (nowSeconds() - startedAt > staffSessionMaxSeconds(auth)) {
      throw new HttpError(401, "Your session has ended. Please sign in again.");
    }

    const payload: AuthTokenPayload = {
      role: auth.role,
      restaurantId: auth.restaurantId,
      id: auth.id,
      tv: auth.tv ?? 0,
      dev: auth.dev,
      sst: startedAt,
    };
    res.json({ token: signToken(payload) });
  },
);
