import { randomUUID } from "crypto";
import mongoose from "mongoose";
import { afterAll, inject } from "vitest";

process.env.MONGO_URI = inject("mongoUriTemplate").replace("__DB__", `test_${randomUUID().replace(/-/g, "")}`);
process.env.JWT_SECRET = "test-secret";
process.env.JWT_EXPIRES_IN = "8h";
process.env.RESTAURANT_KEY = "resto_test";
process.env.CLIENT_ORIGIN = "*";
process.env.LOG_LEVEL = process.env.LOG_LEVEL || "error";

afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
