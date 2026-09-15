import mongoose from "mongoose";

let connection: Promise<void> | null = null;

export function connectDb(): Promise<void> {
  if (connection) return connection;

  const uri = process.env.MONGO_URI;
  if (!uri) {
    return Promise.reject(new Error("MONGO_URI is not set"));
  }

  connection = mongoose
    // default 30s server selection outlives a serverless function's timeout,
    // turning an unreachable DB into a 504 instead of a clean error
    .connect(uri, { serverSelectionTimeoutMS: 8000 })
    .then(() => {
      console.log("MongoDB connected");
    })
    .catch((err) => {
      connection = null; // let the next call retry instead of caching a failure
      throw err;
    });

  return connection;
}
