import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import { connectDb } from "./config/db";
import { resolveTenant } from "./middleware/tenant";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler";
import { UPLOADS_DIR } from "./middleware/upload";

import authRoutes from "./routes/auth.routes";
import catalogRoutes from "./routes/catalog.routes";
import tablesRoutes from "./routes/tables.routes";
import chefsRoutes from "./routes/chefs.routes";
import restaurantRoutes from "./routes/restaurant.routes";
import ordersRoutes from "./routes/orders.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import teamRoutes from "./routes/team.routes";
import reviewRoutes from "./routes/review.routes";
import awardRoutes from "./routes/award.routes";
import couponRoutes from "./routes/coupon.routes";
import landingRoutes from "./routes/landing.routes";
import uploadRoutes from "./routes/upload.routes";
import backupRoutes from "./routes/backup.routes";

const app = express();

app.use(cors({ origin: process.env.CLIENT_ORIGIN || "*" }));
app.use(express.json({ limit: "25mb" })); // a full data backup/restore payload can exceed the 100kb default

app.get("/health", (_req, res) => {
  const dbConnected = mongoose.connection.readyState === 1;
  res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? "ok" : "error",
    db: dbConnected ? "connected" : "disconnected",
  });
});

app.use("/uploads", express.static(UPLOADS_DIR));

// Serverless (Vercel) invocations get a fresh module per cold start, so make sure
// the DB is connected before any /api route runs; connectDb() memoizes the connection.
app.use("/api", async (_req, res, next) => {
  try {
    await connectDb();
    next();
  } catch (err) {
    next(err);
  }
});

app.use("/api", resolveTenant);
app.use("/api/auth", authRoutes);
app.use("/api", catalogRoutes);
app.use("/api/tables", tablesRoutes);
app.use("/api/chefs", chefsRoutes);
app.use("/api/restaurant", restaurantRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/team", teamRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/awards", awardRoutes);
app.use("/api/coupons", couponRoutes);
app.use("/api/landing", landingRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/backup", backupRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
