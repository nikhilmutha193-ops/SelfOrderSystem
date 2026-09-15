import "dotenv/config";
import express from "express";
import cors from "cors";
import { connectDb } from "./config/db";
import { resolveTenant } from "./middleware/tenant";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler";
import { UPLOADS_DIR } from "./middleware/upload";
import { initBackupScheduler } from "./utils/backupScheduler";

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

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/uploads", express.static(UPLOADS_DIR));

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

const PORT = process.env.PORT || 5000;

connectDb()
  .then(() => {
    app.listen(PORT, () => console.log(`API listening on port ${PORT}`));
    initBackupScheduler();
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB", err);
    process.exit(1);
  });
