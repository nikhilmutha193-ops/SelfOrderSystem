import mongoose from "mongoose";

import { readDbOverride } from "../utils/dbConfig";
import { describeError, logger } from "../utils/logger";

let connection: Promise<void> | null = null;
let current: { uri: string; source: "env" | "admin" } | null = null;

async function open(uri: string): Promise<void> {
  // Password redacted - this is for confirming which cluster/user/db the container is actually
  // using (e.g. after rotating a credential), not for sharing the full connection string.
  logger.info("Connecting to MongoDB", { uri: uri.replace(/:\/\/([^:/@]+):[^@]*@/, "://$1:***@") });
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  logger.info("MongoDB connected");
}

export function connectDb(): Promise<void> {
  if (connection) return connection;

  // A connection chosen in the admin wins over MONGO_URI; if it no longer works the server falls back to MONGO_URI
  // instead of refusing to start, so a bad saved address can never lock everyone out.
  const saved = readDbOverride();
  const fromEnv = process.env.MONGO_URI;
  if (!saved && !fromEnv) {
    return Promise.reject(new Error("MONGO_URI is not set"));
  }

  connection = (async () => {
    if (saved) {
      try {
        await open(saved);
        current = { uri: saved, source: "admin" };
        return;
      } catch (err) {
        logger.error("The saved database connection failed; using MONGO_URI", describeError(err));
        await mongoose.disconnect().catch(() => undefined);
        if (!fromEnv) throw err;
      }
    }
    await open(fromEnv!);
    current = { uri: fromEnv!, source: "env" };
  })().catch((err) => {
    connection = null; // let the next call retry instead of caching a failure
    throw err;
  });

  return connection;
}

/** Which connection string the server is using, and where it came from (`env` = MONGO_URI, `admin` = saved in the admin). */
export function connectionInfo(): { uri: string; source: "env" | "admin" } | null {
  return current;
}

/**
 * Moves the running server onto another database. `uri` null means back to MONGO_URI. If the new address can't be
 * opened, the previous one is reopened and the error is thrown, so a typo never leaves the server without a database.
 */
export async function switchConnection(uri: string | null): Promise<void> {
  const previous = current;
  const target = uri ?? process.env.MONGO_URI;
  if (!target) throw new Error("MONGO_URI is not set");

  await mongoose.disconnect();
  connection = null;
  try {
    await open(target);
    current = { uri: target, source: uri ? "admin" : "env" };
    connection = Promise.resolve();
  } catch (err) {
    await mongoose.disconnect().catch(() => undefined);
    if (previous) {
      await open(previous.uri);
      current = previous;
      connection = Promise.resolve();
    }
    throw err;
  }
}
