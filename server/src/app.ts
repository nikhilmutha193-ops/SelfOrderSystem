import fs from "fs";
import path from "path";
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
import { registerBookingHandlers } from "./modules/bookings/bookings.handlers";
import bookingRoutes from "./modules/bookings/bookings.routes";
import gstRoutes from "./modules/gst/gst.routes";
import refundRoutes from "./modules/refunds/refunds.routes";
import menuEngineeringRoutes from "./modules/menuEngineering/menuEngineering.routes";
import { registerCreditHandlers } from "./modules/credit/credit.handlers";
import creditRoutes from "./modules/credit/credit.routes";
import pricingRoutes from "./modules/pricing/pricing.routes";
import recommendationRoutes from "./modules/recommendations/recommendations.routes";
import chatRoutes from "./modules/chat/chat.routes";
import { registerCustomerHandlers } from "./modules/customers/customers.handlers";
import { billRoutes, customerRoutes } from "./modules/customers/customers.routes";
import { registerInventoryHandlers } from "./modules/inventory/inventory.handlers";
import inventoryRoutes from "./modules/inventory/inventory.routes";
import { registerKitchenHandlers } from "./modules/kitchen/kitchen.handlers";
import kitchenRoutes from "./modules/kitchen/kitchen.routes";
import ordersRoutes from "./modules/orders/orders.routes";
import displayRoutes from "./modules/displays/displays.routes";
import { kioskRoutes, pickupRoutes } from "./modules/kiosk/kiosk.routes";
import paymentRoutes from "./modules/payments/payments.routes";
import posRoutes from "./modules/pos/pos.routes";
import { registerPrintingHandlers } from "./modules/printing/printing.handlers";
import { printAgentRoutes, printingRoutes } from "./modules/printing/printing.routes";
import { dayCloseRoutes, shiftRoutes } from "./modules/shifts/shifts.routes";
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
import promoBannerRoutes from "./routes/promoBanner.routes";
import restaurantRoutes from "./routes/restaurant.routes";
import reviewRoutes from "./routes/review.routes";
import tablesRoutes from "./routes/tables.routes";
import teamRoutes from "./routes/team.routes";
import translateRoutes from "./routes/translate.routes";
import uploadRoutes from "./routes/upload.routes";
import webhookRoutes from "./routes/webhooks.routes";
import { describeError, logger } from "./utils/logger";
import { UPLOADS_DIR } from "./utils/objectStore";

registerKitchenHandlers();
registerPrintingHandlers();
registerInventoryHandlers();
registerCustomerHandlers();
registerBookingHandlers();
registerCreditHandlers();

const app = express();

// How many reverse proxies sit in front of the API (the client container's nginx is one; a TLS proxy
// such as Caddy in front of it makes two), so the real client address is read from X-Forwarded-For.
const proxyHops = Number(process.env.TRUST_PROXY_HOPS);
app.set("trust proxy", Number.isInteger(proxyHops) && proxyHops >= 0 ? proxyHops : 1);
// Don't advertise the framework.
app.disable("x-powered-by");

app.use(requestLogger);
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } }));

const allowedOrigins = (process.env.CLIENT_ORIGIN || "*")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
const hostnameOf = (value: string | undefined): string => {
  try {
    return new URL(value?.includes("://") ? value : `http://${value ?? ""}`).hostname.toLowerCase();
  } catch {
    return "";
  }
};
app.use(
  cors((req, cb) => {
    const origin = req.headers.origin;
    // Non-browser clients (curl, server-to-server) send no Origin - allow them.
    // A page served from the address the request was sent to (the site's own nginx forwards its Host) is the same
    // site, so it works with a bare IP or any domain even when CLIENT_ORIGIN doesn't list it.
    const sameSite = !!origin && hostnameOf(origin) !== "" && hostnameOf(origin) === hostnameOf(req.headers.host);
    const allowed = !origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin) || sameSite;
    // A refused origin gets no CORS headers (the browser blocks it) instead of a 500 error.
    cb(null, { origin: allowed });
  })
);
app.use(
  express.json({
    limit: "25mb", // a full data backup/restore payload can exceed the 100kb default
    // Payment webhooks are signed over the exact bytes sent, so keep them for that route.
    verify: (req, _res, buf) => {
      if (req.url?.startsWith("/api/payments/razorpay/webhook")) (req as express.Request).rawBody = buf;
    },
  })
);
app.use(sanitizeRequest); // strip Mongo operators from body/query/params before any route uses them

// The version in package.json (kept in step with the project VERSION by scripts/release.js), so anyone can see
// which build is running: GET /health.
const appVersion: string = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")).version ?? "unknown";
  } catch {
    return "unknown";
  }
})();

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
    version: appVersion,
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
app.use("/api/menu/recommendations", recommendationRoutes);
app.use("/api", catalogRoutes);
app.use("/api/tables", tablesRoutes);
app.use("/api/chefs", chefsRoutes);
app.use("/api/restaurant", restaurantRoutes);
app.use("/api/orders", chatRoutes);
app.use("/api/orders", kitchenRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/shifts", shiftRoutes);
app.use("/api/day-close", dayCloseRoutes);
app.use("/api/printing", printingRoutes);
app.use("/api/print-agent", printAgentRoutes);
app.use("/api/pos", posRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/bills", billRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/pricing", pricingRoutes);
app.use("/api/credit", creditRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/kiosk", kioskRoutes);
app.use("/api/displays", displayRoutes);
app.use("/api/pickup", pickupRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/team", teamRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/awards", awardRoutes);
app.use("/api/banners", promoBannerRoutes);
app.use("/api/coupons", couponRoutes);
app.use("/api/landing", landingRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/backup", backupRoutes);
app.use("/api/admins", adminsRoutes);
app.use("/api/gst", gstRoutes);
app.use("/api/refunds", refundRoutes);
app.use("/api/analytics/menu-engineering", menuEngineeringRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/translate", translateRoutes);
app.use("/api/aggregator", aggregatorRoutes);
app.use("/api/webhooks", webhookRoutes);
app.use("/api/oauth", oauthRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
