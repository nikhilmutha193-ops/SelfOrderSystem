import { Request, Response } from "express";

import { asyncHandler } from "../middleware/errorHandler";
import { IOrder } from "../models/Order";
import { IOrderItem } from "../models/OrderItem";
import Restaurant, { IInvoiceSettings, IKotSettings, IQrSettings, IRestaurant, ITaxRate } from "../models/Restaurant";
import { isValidDayEndTime, isValidTimezone } from "../utils/businessDay";
import { HttpError } from "../utils/httpError";
import { computeInvoiceTotals } from "../utils/invoice";
import { seedLandingContent } from "../utils/landingSeed";
import { resolveLogoBuffer, streamInvoicePdf, streamKotPdf } from "../utils/pdf";

const SAMPLE_ITEMS: Pick<IOrderItem, "foodName" | "isJain" | "quantity" | "unitPrice" | "total" | "status">[] = [
  { foodName: "Paneer Butter Masala", isJain: false, quantity: 2, unitPrice: 220, total: 440, status: "pending" },
  { foodName: "Dal Tadka (Jain)", isJain: true, quantity: 1, unitPrice: 150, total: 150, status: "pending" },
  { foodName: "Butter Naan", isJain: false, quantity: 4, unitPrice: 35, total: 140, status: "pending" },
];

function buildSampleOrder(): IOrder {
  return {
    _id: "preview",
    orderType: "dine-in",
    customerName: "Sample Customer",
    customerPhone: "9876543210",
    checkinTime: new Date(),
    members: 2,
    status: "open",
    paymentMethod: "pending",
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as IOrder;
}

async function buildPreviewRestaurant(req: Request, overrides: Record<string, unknown>): Promise<IRestaurant> {
  const existing = await Restaurant.findById(req.restaurantId);
  if (!existing) throw new HttpError(404, "Restaurant not found");
  const base = existing.toObject();

  return {
    ...base,
    ...(overrides.name !== undefined && { name: overrides.name }),
    ...(overrides.logoUrl !== undefined && { logoUrl: overrides.logoUrl }),
    ...(overrides.address !== undefined && { address: overrides.address }),
    ...(overrides.gstin !== undefined && { gstin: overrides.gstin }),
    ...(overrides.fssaiLicense !== undefined && { fssaiLicense: overrides.fssaiLicense }),
    ...(overrides.taxRates !== undefined && { taxRates: overrides.taxRates }),
    kotSettings: { ...base.kotSettings, ...(overrides.kotSettings as Partial<IKotSettings> | undefined) },
    invoiceSettings: {
      ...base.invoiceSettings,
      ...(overrides.invoiceSettings as Partial<IInvoiceSettings> | undefined),
    },
  } as unknown as IRestaurant;
}

export const getRestaurantPublic = asyncHandler(async (req: Request, res: Response) => {
  const restaurant = await Restaurant.findById(req.restaurantId).select("name logoUrl address siteTitle faviconUrl");
  if (!restaurant) throw new HttpError(404, "Restaurant not found");
  res.json(restaurant);
});

export const getRestaurantSettings = asyncHandler(async (req: Request, res: Response) => {
  const restaurant = await Restaurant.findById(req.restaurantId);
  if (!restaurant) throw new HttpError(404, "Restaurant not found");
  res.json(restaurant);
});

export const getRestaurantLogo = asyncHandler(async (req: Request, res: Response) => {
  const restaurant = await Restaurant.findById(req.restaurantId).select("logoUrl");
  if (!restaurant?.logoUrl) throw new HttpError(404, "No logo is set");
  const buffer = await resolveLogoBuffer(restaurant.logoUrl);
  if (!buffer) throw new HttpError(404, "Logo could not be loaded");

  const ext = restaurant.logoUrl.split("?")[0].split(".").pop()?.toLowerCase();
  const contentType =
    ext === "jpg" || ext === "jpeg"
      ? "image/jpeg"
      : ext === "webp"
        ? "image/webp"
        : ext === "gif"
          ? "image/gif"
          : "image/png";
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "private, max-age=300");
  res.send(buffer);
});

export const updateRestaurantSettings = asyncHandler(async (req: Request, res: Response) => {
  const {
    name,
    address,
    logoUrl,
    siteTitle,
    faviconUrl,
    gstin,
    fssaiLicense,
    tagline,
    aboutText,
    publicUrl,
    heroImages,
    dayEndTime,
    timezone,
    taxRates,
    qrSettings,
    kotSettings,
    invoiceSettings,
    tableAutoReleaseMinutes,
    prepBufferMinutes,
    prepMessageTemplate,
    chatModeration,
  } = req.body as {
    name?: string;
    siteTitle?: string;
    faviconUrl?: string;
    address?: string;
    logoUrl?: string;
    gstin?: string;
    fssaiLicense?: string;
    tagline?: string;
    aboutText?: string;
    publicUrl?: string;
    heroImages?: string[];
    dayEndTime?: string;
    timezone?: string;
    taxRates?: { name: string; percent: number }[];
    qrSettings?: Partial<IQrSettings>;
    kotSettings?: Partial<IKotSettings>;
    invoiceSettings?: Partial<IInvoiceSettings>;
    tableAutoReleaseMinutes?: number;
    prepBufferMinutes?: number;
    prepMessageTemplate?: string;
    chatModeration?: { enabled?: boolean; mode?: "mask" | "block"; customWords?: string[] };
  };

  if (publicUrl && !/^https?:\/\/.+/i.test(publicUrl)) {
    throw new HttpError(400, "publicUrl must start with http:// or https://");
  }

  if (taxRates) {
    for (const rate of taxRates) {
      if (!rate.name || typeof rate.percent !== "number" || rate.percent < 0 || rate.percent > 100) {
        throw new HttpError(400, "Each tax rate needs a name and a percent between 0 and 100");
      }
    }
  }

  if (heroImages && (!Array.isArray(heroImages) || heroImages.some((url) => typeof url !== "string" || !url))) {
    throw new HttpError(400, "heroImages must be an array of non-empty URLs");
  }

  if (dayEndTime !== undefined && !isValidDayEndTime(dayEndTime)) {
    throw new HttpError(400, "dayEndTime must be in HH:mm format (e.g. 03:00)");
  }
  if (timezone !== undefined && !isValidTimezone(timezone)) {
    throw new HttpError(400, "timezone must be a valid IANA name (e.g. Asia/Kolkata)");
  }

  if (
    tableAutoReleaseMinutes !== undefined &&
    (typeof tableAutoReleaseMinutes !== "number" || tableAutoReleaseMinutes < 0)
  ) {
    throw new HttpError(400, "tableAutoReleaseMinutes must be a non-negative number");
  }
  if (prepBufferMinutes !== undefined && (typeof prepBufferMinutes !== "number" || prepBufferMinutes < 0)) {
    throw new HttpError(400, "prepBufferMinutes must be a non-negative number");
  }

  const restaurant = await Restaurant.findById(req.restaurantId);
  if (!restaurant) throw new HttpError(404, "Restaurant not found");

  if (name !== undefined) restaurant.name = name;
  if (address !== undefined) restaurant.address = address;
  if (logoUrl !== undefined) restaurant.logoUrl = logoUrl;
  if (siteTitle !== undefined) restaurant.siteTitle = siteTitle;
  if (faviconUrl !== undefined) restaurant.faviconUrl = faviconUrl;
  if (gstin !== undefined) restaurant.gstin = gstin;
  if (fssaiLicense !== undefined) restaurant.fssaiLicense = fssaiLicense;
  if (tagline !== undefined) restaurant.tagline = tagline;
  if (aboutText !== undefined) restaurant.aboutText = aboutText;
  if (publicUrl !== undefined) restaurant.publicUrl = publicUrl.replace(/\/+$/, "");
  if (heroImages !== undefined) restaurant.heroImages = heroImages;
  if (dayEndTime !== undefined) restaurant.dayEndTime = dayEndTime;
  if (timezone !== undefined) restaurant.timezone = timezone;
  if (tableAutoReleaseMinutes !== undefined) restaurant.tableAutoReleaseMinutes = tableAutoReleaseMinutes;
  if (prepBufferMinutes !== undefined) restaurant.prepBufferMinutes = prepBufferMinutes;
  if (prepMessageTemplate !== undefined) restaurant.prepMessageTemplate = prepMessageTemplate;
  if (taxRates !== undefined) restaurant.taxRates = taxRates;
  if (qrSettings !== undefined) Object.assign(restaurant.qrSettings, qrSettings);
  if (kotSettings !== undefined) Object.assign(restaurant.kotSettings, kotSettings);
  if (invoiceSettings !== undefined) Object.assign(restaurant.invoiceSettings, invoiceSettings);
  if (chatModeration !== undefined) {
    if (chatModeration.enabled !== undefined) restaurant.chatModeration.enabled = !!chatModeration.enabled;
    if (chatModeration.mode !== undefined) {
      if (chatModeration.mode !== "mask" && chatModeration.mode !== "block") {
        throw new HttpError(400, "chatModeration.mode must be 'mask' or 'block'");
      }
      restaurant.chatModeration.mode = chatModeration.mode;
    }
    if (chatModeration.customWords !== undefined) {
      if (!Array.isArray(chatModeration.customWords) || chatModeration.customWords.some((w) => typeof w !== "string")) {
        throw new HttpError(400, "chatModeration.customWords must be an array of strings");
      }
      // Normalise: trim, drop blanks/dupes, cap length so the list stays sane.
      restaurant.chatModeration.customWords = [
        ...new Set(chatModeration.customWords.map((w) => w.trim().toLowerCase()).filter(Boolean)),
      ].slice(0, 200);
    }
  }

  await restaurant.save();
  res.json(restaurant);
});

export const previewKotPdf = asyncHandler(async (req: Request, res: Response) => {
  const { name, logoUrl, kotSettings } = req.body as {
    name?: string;
    logoUrl?: string;
    kotSettings?: Partial<IKotSettings>;
  };
  const restaurant = await buildPreviewRestaurant(req, { name, logoUrl, kotSettings });
  const order = buildSampleOrder();
  const items = SAMPLE_ITEMS as unknown as IOrderItem[];
  await streamKotPdf(res, { restaurant, order, round: 1, items, tableCode: "5" });
});

export const previewInvoicePdf = asyncHandler(async (req: Request, res: Response) => {
  const { name, logoUrl, address, gstin, fssaiLicense, taxRates, invoiceSettings } = req.body as {
    name?: string;
    logoUrl?: string;
    address?: string;
    gstin?: string;
    fssaiLicense?: string;
    taxRates?: ITaxRate[];
    invoiceSettings?: Partial<IInvoiceSettings>;
  };
  const restaurant = await buildPreviewRestaurant(req, {
    name,
    logoUrl,
    address,
    gstin,
    fssaiLicense,
    taxRates,
    invoiceSettings,
  });
  const order = buildSampleOrder();
  const items = SAMPLE_ITEMS as unknown as IOrderItem[];
  const totals = computeInvoiceTotals(items, restaurant.taxRates || []);
  await streamInvoicePdf(res, { restaurant, order, items, totals });
});

export const seedLandingSampleContent = asyncHandler(async (req: Request, res: Response) => {
  const added = await seedLandingContent(req.restaurantId!);
  res.json({
    added,
    message: added.length
      ? `Added sample ${added.join(", ")}.`
      : "Nothing to add - your landing page already has content in every section.",
  });
});
