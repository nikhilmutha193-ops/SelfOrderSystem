import { Request, Response } from "express";

import { getContext } from "../../core/context";
import { parse } from "../../core/validate";
import { asyncHandler } from "../../middleware/errorHandler";
import * as bookings from "./bookings.service";
import {
  availabilityQuery,
  bookingParams,
  bookingSettingsSchema,
  cancelBookingSchema,
  confirmBookingSchema,
  createBookingSchema,
  listBookingsQuery,
} from "./bookings.schema";

export const getSettings = asyncHandler(async (req: Request, res: Response) => {
  res.json(await bookings.getSettings(getContext(req).restaurantId));
});

export const saveSettings = asyncHandler(async (req: Request, res: Response) => {
  const input = parse(bookingSettingsSchema, req.body);
  res.json(await bookings.saveSettings(getContext(req), input));
});

export const getAvailability = asyncHandler(async (req: Request, res: Response) => {
  const { date } = parse(availabilityQuery, req.query);
  res.json(await bookings.getAvailability(getContext(req).restaurantId, date));
});

export const createBooking = asyncHandler(async (req: Request, res: Response) => {
  const input = parse(createBookingSchema, req.body);
  res.status(201).json(await bookings.createBooking(getContext(req), input));
});

// Public - the table sign-in page offers "Reserve a table" with no guest session, so these read
// req.restaurantId directly (set for every /api request by resolveTenant) instead of getContext,
// which requires an authenticated req.auth.
export const getPublicSettings = asyncHandler(async (req: Request, res: Response) => {
  res.json(await bookings.getSettings(req.restaurantId!));
});

export const getPublicAvailability = asyncHandler(async (req: Request, res: Response) => {
  const { date } = parse(availabilityQuery, req.query);
  res.json(await bookings.getAvailability(req.restaurantId!, date));
});

export const createPublicBooking = asyncHandler(async (req: Request, res: Response) => {
  const input = parse(createBookingSchema, req.body);
  res.status(201).json(await bookings.createPublicBooking(req.restaurantId!, input));
});

export const listBookings = asyncHandler(async (req: Request, res: Response) => {
  const { date } = parse(listBookingsQuery, req.query);
  res.json(await bookings.listBookings(getContext(req), date));
});

export const listTablesForBooking = asyncHandler(async (req: Request, res: Response) => {
  const { id } = parse(bookingParams, req.params);
  res.json(await bookings.listTablesForBooking(getContext(req), id));
});

export const confirmBooking = asyncHandler(async (req: Request, res: Response) => {
  const { id } = parse(bookingParams, req.params);
  const { tableId } = parse(confirmBookingSchema, req.body);
  res.json(await bookings.confirmBooking(getContext(req), id, tableId));
});

export const cancelBooking = asyncHandler(async (req: Request, res: Response) => {
  const { id } = parse(bookingParams, req.params);
  const { reason } = parse(cancelBookingSchema, req.body);
  res.json(await bookings.cancelBooking(getContext(req), id, reason));
});

export const markSeated = asyncHandler(async (req: Request, res: Response) => {
  const { id } = parse(bookingParams, req.params);
  res.json(await bookings.markSeated(getContext(req), id));
});

export const markNoShow = asyncHandler(async (req: Request, res: Response) => {
  const { id } = parse(bookingParams, req.params);
  res.json(await bookings.markNoShow(getContext(req), id));
});
