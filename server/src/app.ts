import "dotenv/config";

import cors from "cors";
import express from "express";
import helmet from "helmet";
import mongoose from "mongoose";

import { connectDb } from "./config/db";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { apiLimiter, authLimiter } from "./middleware/rateLimit";
import { requestLogger } from "./middleware/requestLogger";
import { sanitizeRequest } from "./middleware/sanitize";
import { resolveTenant } from "./middleware/tenant";
import chatRoutes from "./modules/chat/chat.routes";
import kitchenRoutes from "./modules/kitchen/kitchen.routes";
import ordersRoutes from "./modules/orders/orders.routes";
import adminsRoutes from "./routes/admins.routes";
import aggregatorRoutes from "./routes/aggregator.routes";
import analyticsRoutes from "./routes/analytics.routes";
import authRoutes from "./routes/auth.routes";
import awardRoutes from "./routes/award.routes";
import backupRoutes from "./routes/backup.routes";
import catalogRoutes from "./routes/catalog.routes";
import chefsRoutes from "./routes/chefs.routes";
import couponRoutes from "./routes/coupon.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import landingRoutes from "./routes/landing.routes";
import oauthRoutes from "./routes/oauth.routes";
import restaurantRoutes from "./routes/restaurant.routes";
import reviewRoutes from "./routes/review.routes";
import tablesRoutes from "./routes/tables.routes";
import teamRoutes from "./routes/team.routes";
import translateRoutes from "./routes/translate.routes";
import uploadRoutes from "./routes/upload.routes";
import webhookRoutes from "./routes/webhooks.routes";
import { describeError, logger } from "./utils/logger";
import { UPLOADS_DIR } from "./utils/objectStore";

const app = express();

app.set("trust proxy", 1);
// Don't advertise the framework.
app.disable("x-powered-by");

app.use(requestLogger);
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } }));

const allowedOrigins = (process.env.CLIENT_ORIGIN || "*")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: (origin, cb) => {
      // Non-browser clients (curl, server-to-server) send no Origin - allow them.
      if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
        return cb(null, true);
      }
      cb(new Error("Not allowed by CORS"));
    },
  })
);
app.use(express.json({ limit: "25mb" })); // a full data backup/restore payload can exceed the 100kb default
app.use(sanitizeRequest); // strip Mongo operators from body/query/params before any route uses them

app.get("/health", async (_req, res) => {
  try {
    await connectDb(); // a cold serverless instance has no connection yet
  } catch (err) {
    logger.error("health check: MongoDB connection failed", describeError(err));
  }
  const dbConnected = mongoose.connection.readyState === 1;
  res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? "ok" : "error",
    db: dbConnected ? "connected" : "disconnected",
  });
});

app.use("/uploads", express.static(UPLOADS_DIR));

app.use("/api", async (_req, res, next) => {
  try {
    await connectDb();
    next();
  } catch (err) {
    next(err);
  }
});

app.use("/api", apiLimiter);
app.use("/api", resolveTenant);
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api", catalogRoutes);
app.use("/api/tables", tablesRoutes);
app.use("/api/chefs", chefsRoutes);
app.use("/api/restaurant", restaurantRoutes);
app.use("/api/orders", chatRoutes);
app.use("/api/orders", kitchenRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/team", teamRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/awards", awardRoutes);
app.use("/api/coupons", couponRoutes);
app.use("/api/landing", landingRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/backup", backupRoutes);
app.use("/api/admins", adminsRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/translate", translateRoutes);
app.use("/api/aggregator", aggregatorRoutes);
app.use("/api/webhooks", webhookRoutes);
app.use("/api/oauth", oauthRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
