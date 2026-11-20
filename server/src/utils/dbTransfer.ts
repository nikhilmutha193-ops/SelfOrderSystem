import mongoose, { Connection } from "mongoose";

import Restaurant from "../models/Restaurant";
import { HttpError } from "./httpError";

const SERVER_TIMEOUT_MS = 8000;

function restaurantKey(): string {
  const key = process.env.RESTAURANT_KEY;
  if (!key) throw new HttpError(500, "RESTAURANT_KEY is not configured on the server");
  return key.toLowerCase();
}

async function withConnection<T>(uri: string, fn: (conn: Connection) => Promise<T>): Promise<T> {
  const conn = mongoose.createConnection(uri, { serverSelectionTimeoutMS: SERVER_TIMEOUT_MS });
  try {
    await conn.asPromise();
  } catch {
    await conn.close().catch(() => undefined);
    throw new HttpError(400, "Could not connect with that connection string. Check the address, user, password and network access.");
  }
  try {
    return await fn(conn);
  } finally {
    await conn.close().catch(() => undefined);
  }
}

export interface ProbeResult {
  database: string;
  serverVersion: string | null;
  replicaSet: string | null;
  isReplicaSet: boolean;
  restaurantFound: boolean;
}

/** Connects to a database address, changes nothing, and reports whether this app can run on it. */
export function probeDatabase(uri: string): Promise<ProbeResult> {
  return withConnection(uri, async (conn) => {
    const db = conn.db!;
    const hello = (await db.command({ hello: 1 })) as { setName?: string };
    const build = await db.admin().buildInfo().catch(() => null);
    const found = await conn.collection(Restaurant.collection.name).findOne({ key: restaurantKey() });
    return {
      database: db.databaseName,
      serverVersion: (build as { version?: string } | null)?.version ?? null,
      replicaSet: hello.setName ?? null,
      // Billing, purchases and stock counts use transactions, which MongoDB only allows on a replica set.
      isReplicaSet: !!hello.setName,
      restaurantFound: !!found,
    };
  });
}

/** Collections whose documents belong to a restaurant (everything with a restaurantId, not just what backups export). */
function tenantCollections(): string[] {
  return Object.values(mongoose.models)
    .filter((model) => model.modelName !== Restaurant.modelName && !!model.schema.path("restaurantId"))
    .map((model) => model.collection.name);
}

const BATCH = 500;

/**
 * Copies this restaurant between the running database and another one: the restaurant, its logins and settings, and
 * every collection that belongs to it, with the same ids. `to` sends this server's data to the other database,
 * `from` brings the other database's copy of this restaurant here. A restaurant with the same key already on the
 * destination is refused unless `overwrite` is set, and is then replaced.
 */
export async function copyRestaurant(
  remoteUri: string,
  direction: "to" | "from",
  overwrite: boolean
): Promise<Record<string, number>> {
  const key = restaurantKey();
  const restaurants = Restaurant.collection.name;

  return withConnection(remoteUri, async (remote) => {
    const local = mongoose.connection;
    const from = direction === "to" ? local : remote;
    const into = direction === "to" ? remote : local;

    const source = await from.collection(restaurants).findOne({ key });
    if (!source) {
      throw new HttpError(
        400,
        direction === "to"
          ? `This database has no restaurant "${key}" to copy.`
          : `The other database has no restaurant "${key}" to copy.`
      );
    }

    const names = tenantCollections();
    const existing = await into.collection(restaurants).findOne({ key });
    if (existing) {
      if (!overwrite) {
        throw new HttpError(
          409,
          `The destination database already has restaurant "${key}". Tick "Replace what is there" to overwrite it.`
        );
      }
      for (const name of names) await into.collection(name).deleteMany({ restaurantId: existing._id });
      await into.collection(restaurants).deleteOne({ _id: existing._id });
    }

    await into.collection(restaurants).insertOne(source);
    const copied: Record<string, number> = { restaurant: 1 };
    for (const name of names) {
      const docs = await from.collection(name).find({ restaurantId: source._id }).toArray();
      for (let i = 0; i < docs.length; i += BATCH) {
        await into.collection(name).insertMany(docs.slice(i, i + BATCH), { ordered: false });
      }
      if (docs.length > 0) copied[name] = docs.length;
    }
    return copied;
  });
}
