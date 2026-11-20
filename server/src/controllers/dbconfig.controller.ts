import { Request, Response } from "express";
import mongoose from "mongoose";

import { connectionInfo, switchConnection } from "../config/db";
import { clearTenantCache } from "../middleware/tenant";
import { asyncHandler } from "../middleware/errorHandler";
import { writeAudit } from "../utils/audit";
import { clearDbOverride, describeUri, isMongoUri, maskUri, writeDbOverride } from "../utils/dbConfig";
import { copyRestaurant, probeDatabase } from "../utils/dbTransfer";
import { HttpError } from "../utils/httpError";
import { assertOwnerPassword } from "../utils/ownerConfirm";

// Vercel's filesystem is read-only and every request may land on a new instance, so the address can't be saved there.
const canSwitch = () => process.env.VERCEL !== "1";

function uriFrom(body: unknown): string {
  const uri = (body as { uri?: unknown } | undefined)?.uri;
  if (!isMongoUri(uri)) throw new HttpError(400, "Enter a MongoDB connection string that starts with mongodb:// or mongodb+srv://");
  return uri.trim();
}

function assertOwner(req: Request) {
  if (!req.admin?.isOwner) throw new HttpError(403, "Only the owner account can manage the database connection");
}

function assertCanSwitch() {
  if (!canSwitch()) {
    throw new HttpError(503, "The database address can't be changed on this host. Set MONGO_URI in its settings instead.");
  }
}

export const getDbConfig = asyncHandler(async (req: Request, res: Response) => {
  assertOwner(req);
  const info = connectionInfo();
  const parts = info ? describeUri(info.uri) : null;
  res.json({
    connected: mongoose.connection.readyState === 1,
    source: info?.source ?? null,
    hosts: parts?.hosts ?? null,
    database: parts?.database || mongoose.connection.name || null,
    user: parts?.user ?? null,
    masked: info ? maskUri(info.uri) : null,
    envConfigured: !!process.env.MONGO_URI,
    canSwitch: canSwitch(),
  });
});

/** Connects to an address and says whether the app can run on it. Changes nothing. */
export const testDbConnection = asyncHandler(async (req: Request, res: Response) => {
  assertOwner(req);
  res.json(await probeDatabase(uriFrom(req.body)));
});

/** Copies this restaurant to another database (`to`) or fetches it from there (`from`). */
export const copyDb = asyncHandler(async (req: Request, res: Response) => {
  const { direction, overwrite, password } = req.body as { direction?: unknown; overwrite?: unknown; password?: unknown };
  if (direction !== "to" && direction !== "from") throw new HttpError(400, 'direction must be "to" or "from"');
  await assertOwnerPassword(req, password);
  const uri = uriFrom(req.body);

  const copied = await copyRestaurant(uri, direction, overwrite === true);
  if (direction === "from") clearTenantCache(); // the restaurant document here was replaced
  await writeAudit(
    req,
    "db.copy",
    `Copied the restaurant ${direction === "to" ? "to" : "from"} ${describeUri(uri).hosts}/${describeUri(uri).database}`
  );
  res.json({ message: "Copy complete", copied });
});

/** Makes the running server use another database. The address is saved so it survives restarts. */
export const switchDb = asyncHandler(async (req: Request, res: Response) => {
  assertCanSwitch();
  await assertOwnerPassword(req, (req.body as { password?: unknown }).password);
  const uri = uriFrom(req.body);

  const probe = await probeDatabase(uri);
  if (!probe.restaurantFound) {
    throw new HttpError(
      400,
      `That database has no restaurant "${process.env.RESTAURANT_KEY}". Use "Copy this restaurant there" first, then switch.`
    );
  }
  if (!probe.isReplicaSet) {
    throw new HttpError(400, "That MongoDB is not a replica set. Billing and purchases need transactions, which MongoDB only allows on a replica set (Atlas is one).");
  }

  try {
    await switchConnection(uri);
  } catch {
    throw new HttpError(400, "Could not switch to that database. The previous one is still in use.");
  }
  writeDbOverride(uri);
  clearTenantCache();
  // Written after the switch, so the entry lands in the database now in use.
  await writeAudit(req, "db.switch", `Database switched to ${describeUri(uri).hosts}/${describeUri(uri).database}`);
  res.json({ message: "Switched", database: probe.database });
});

/** Forgets the saved address and goes back to MONGO_URI from the server's environment. */
export const useEnvDb = asyncHandler(async (req: Request, res: Response) => {
  assertCanSwitch();
  await assertOwnerPassword(req, (req.body as { password?: unknown }).password);
  const envUri = process.env.MONGO_URI;
  if (!envUri) throw new HttpError(400, "MONGO_URI is not set in the server's environment");

  const probe = await probeDatabase(envUri);
  if (!probe.restaurantFound) {
    throw new HttpError(400, `The MONGO_URI database has no restaurant "${process.env.RESTAURANT_KEY}".`);
  }
  try {
    await switchConnection(null);
  } catch {
    throw new HttpError(400, "Could not reconnect with MONGO_URI. The previous database is still in use.");
  }
  clearDbOverride();
  clearTenantCache();
  await writeAudit(req, "db.switch", "Database switched back to MONGO_URI");
  res.json({ message: "Switched", database: probe.database });
});
