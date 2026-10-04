import mongoose from "mongoose";

import { logger } from "../utils/logger";

let connection: Promise<void> | null = null;

export function connectDb(): Promise<void> {
  if (connection) return connection;

  const uri = process.env.MONGO_URI;
  if (!uri) {
    return Promise.reject(new Error("MONGO_URI is not set"));
  }

  // Password redacted - this is for confirming which cluster/user/db the container is actually
  // using (e.g. after rotating a credential), not for sharing the full connection string.
  logger.info("Connecting to MongoDB", { uri: uri.replace(/:\/\/([^:/@]+):[^@]*@/, "://$1:***@") });

  connection = mongoose
    .connect(uri, { serverSelectionTimeoutMS: 8000 })
    .then(async () => {
      await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
      logger.info("MongoDB connected");
    })
    .catch((err) => {
      connection = null; // let the next call retry instead of caching a failure
      throw err;
    });

  return connection;
}
