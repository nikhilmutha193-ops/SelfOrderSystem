import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import mongoose from "mongoose";
import { connectDb } from "./config/db";
import { requestLogger } from "./middleware/requestLogger";
import { describeError, logger } from "./utils/logger";
import { resolveTenant } from "./middleware/tenant";
import { sanitizeRequest } from "./middleware/sanitize";
import { authLimiter, apiLimiter } from "./middleware/rateLimit";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler";
import { UPLOADS_DIR } from "./utils/objectStore";

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
import adminsRoutes from "./routes/admins.routes";
import analyticsRoutes from "./routes/analytics.routes";
import translateRoutes from "./routes/translate.routes";
import aggregatorRoutes from "./routes/aggregator.routes";
import webhookRoutes from "./routes/webhooks.routes";
import oauthRoutes from "./routes/oauth.routes";

const app = express();

// Behind Vercel/Docker's nginx, so trust the proxy for correct client IPs (rate limiting)
// and protocol (secure cookies / HSTS). "1" = the single proxy in front of us.
app.set("trust proxy", 1);
// Don't advertise the framework.
app.disable("x-powered-by");

app.use(requestLogger);
// Sensible security headers (HSTS, nosniff, frame-deny, referrer policy). The API serves
// JSON and PDFs, not an HTML app, so the default CSP is dropped to avoid breaking the
// separately-hosted client and the /uploads images it references.
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } }));

// An explicit allowlist beats a reflected wildcard. CLIENT_ORIGIN may be a comma-separated
// list; "*" is honoured only if set on purpose, and credentials are never combined with it.
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

app.use("/api", apiLimiter);
app.use("/api", resolveTenant);
app.use("/api/auth", authLimiter, authRoutes);
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
app.use("/api/admins", adminsRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/translate", translateRoutes);
app.use("/api/aggregator", aggregatorRoutes);
app.use("/api/webhooks", webhookRoutes);
app.use("/api/oauth", oauthRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
