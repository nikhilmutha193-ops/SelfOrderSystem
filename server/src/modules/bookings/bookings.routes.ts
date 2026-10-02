import { Router } from "express";

import { requireAuth, requireModule } from "../../middleware/auth";
import {
  cancelBooking,
  confirmBooking,
  createBooking,
  createPublicBooking,
  getAvailability,
  getPublicAvailability,
  getPublicSettings,
  getSettings,
  listBookings,
  listTablesForBooking,
  markNoShow,
  markSeated,
  saveSettings,
} from "./bookings.controller";

const bookingRoutes = Router();

// Public - the table sign-in page offers "Reserve a table" with no login required. Registered
// before the requireAuth/requireModule below, which only applies to routes added after it.
bookingRoutes.get("/public/settings", getPublicSettings);
bookingRoutes.get("/public/availability", getPublicAvailability);
bookingRoutes.post("/public", createPublicBooking);

// Everything else is admin/staff only - staff confirm bookings, assign tables and manage them.
bookingRoutes.use(requireAuth("admin"), requireModule("bookings"));
bookingRoutes.get("/settings", getSettings);
bookingRoutes.put("/settings", saveSettings);
bookingRoutes.get("/availability", getAvailability);
bookingRoutes.get("/", listBookings);
bookingRoutes.post("/", createBooking);
bookingRoutes.get("/:id/tables", listTablesForBooking);
bookingRoutes.post("/:id/confirm", confirmBooking);
bookingRoutes.post("/:id/cancel", cancelBooking);
bookingRoutes.post("/:id/seat", markSeated);
bookingRoutes.post("/:id/no-show", markNoShow);

export default bookingRoutes;
