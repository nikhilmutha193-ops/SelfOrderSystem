import { Request, Response } from "express";
import { randomUUID } from "crypto";

import { Types } from "mongoose";
import { asyncHandler } from "../middleware/errorHandler";
import { IOrder } from "../models/Order";
import { IOrderItem } from "../models/OrderItem";
import Restaurant, {
  IBillingSettings,
  IExtraCharge,
  IInvoiceSettings,
  IKotSettings,
  IQrSettings,
  IRestaurant,
  ITaxRate,
  PrintPaperSize,
  SERVICE_FLOWS,
  ServiceFlow,
} from "../models/Restaurant";
import { isValidDayEndTime, isValidTimezone } from "../utils/businessDay";
import { HttpError } from "../utils/httpError";
import { computeInvoiceTotals } from "../utils/invoice";
import { financialYearLabel, INVOICE_PREFIX_PATTERN } from "../utils/invoiceNumber";
import { seedLandingContent } from "../utils/landingSeed";
import { resolveLogoBuffer, streamInvoicePdf, streamKotPdf } from "../utils/pdf";
import { cleanLayouts, INVOICE_FONTS, INVOICE_SHOW, KOT_FONTS, KOT_SHOW, PaperKey } from "../utils/printLayout";

const SAMPLE_ITEMS: Partial<IOrderItem>[] = [
  {
    foodName: "Paneer Butter Masala",
    isJain: false,
    quantity: 2,
    unitPrice: 220,
    total: 440,
    status: "pending",
    modifiers: [{ groupName: "Gravy", label: "Extra gravy", priceDelta: 0 }],
    note: "Less spicy",
  },
  { foodName: "Dal Tadka", isJain: true, quantity: 1, unitPrice: 150, total: 150, status: "pending" },
  { foodName: "Butter Naan", isJain: false, quantity: 4, unitPrice: 35, total: 140, status: "pending", isPacked: true },
  {
    foodName: "Thali Combo",
    isJain: false,
    quantity: 1,
    unitPrice: 199,
    total: 199,
    status: "pending",
    components: [
      { name: "Veg Pulao", quantity: 1 },
      { name: "Raita", quantity: 1 },
    ] as IOrderItem["components"],
  },
];

/** Lets the settings preview show a chosen paper (58 mm, 80 mm or a page) before it is saved. */
function previewPaperSize(paper: unknown, current: PrintPaperSize | undefined): PrintPaperSize | undefined {
  if (paper === "p58") return "thermal58";
  if (paper === "p80") return "thermal80";
  if (paper === "page") return current === "a4" ? "a4" : "a5";
  return undefined;
}

function buildSampleOrder(invoicePrefix?: string): IOrder {
  return {
    _id: "preview",
    invoiceNumber: `${invoicePrefix || "INV"}/${financialYearLabel(new Date(), undefined)}/000123`,
    billedAt: new Date(),
    customerGstin: "",
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

/** Token sign-in follows the admin switch; until it is set, it is on in the cafe flow only. */
export function tokenLoginAllowed(restaurant: Pick<IRestaurant, "tableLoginSettings" | "serviceFlow"> | null): boolean {
  return restaurant?.tableLoginSettings?.allowTokenLogin ?? restaurant?.serviceFlow === "cafe";
}

const ORDER_TYPES = ["dine-in", "takeaway", "delivery"];

/** Validates the extra-charges list from Settings and gives new rows a stable key. */
function cleanExtraCharges(raw: unknown): IExtraCharge[] {
  if (!Array.isArray(raw)) throw new HttpError(400, "Extra charges must be a list");
  if (raw.length > 10) throw new HttpError(400, "You can set up at most 10 extra charges");
  const names = new Set<string>();
  return raw.map((row) => {
    const name = String(row?.name ?? "").trim();
    if (!name || name.length > 40) throw new HttpError(400, "Each extra charge needs a name of up to 40 characters");
    if (names.has(name.toLowerCase())) throw new HttpError(400, `"${name}" is listed twice`);
    names.add(name.toLowerCase());
    const type: "fixed" | "percent" = row?.type === "percent" ? "percent" : "fixed";
    const value = Number(row?.value);
    if (!Number.isFinite(value) || value < 0 || (type === "percent" ? value > 100 : value > 100000)) {
      throw new HttpError(400, `Enter a valid amount for "${name}"`);
    }
    const orderTypes = Array.isArray(row?.orderTypes)
      ? ([...new Set((row.orderTypes as unknown[]).map(String).filter((t) => ORDER_TYPES.includes(t)))] as IExtraCharge["orderTypes"])
      : [];
    const key = typeof row?.key === "string" && /^[A-Za-z0-9_-]{4,40}$/.test(row.key) ? row.key : randomUUID().slice(0, 8);
    return { key, name, type, value, orderTypes, autoApply: !!row?.autoApply, active: row?.active !== false };
  });
}

export const getRestaurantPublic = asyncHandler(async (req: Request, res: Response) => {
  const restaurant = await Restaurant.findById(req.restaurantId).select(
    "name logoUrl address siteTitle faviconUrl brandColor tableLoginSettings billingSettings.dineInPayment serviceFlow"
  );
  if (!restaurant) throw new HttpError(404, "Restaurant not found");
  const body = restaurant.toObject();
  body.tableLoginSettings = { ...body.tableLoginSettings, allowTokenLogin: tokenLoginAllowed(restaurant) };
  res.json(body);
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
    brandColor,
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
    billingSettings,
    tableAutoReleaseMinutes,
    serviceFlow,
    prepBufferMinutes,
    prepMessageTemplate,
    chatModeration,
  } = req.body as {
    name?: string;
    siteTitle?: string;
    faviconUrl?: string;
    brandColor?: string;
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
    billingSettings?: Partial<IBillingSettings>;
    tableAutoReleaseMinutes?: number;
    serviceFlow?: string;
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

  if (brandColor !== undefined && brandColor !== "" && !/^#[0-9a-f]{6}$/i.test(String(brandColor))) {
    throw new HttpError(400, "Brand colour must be a hex colour like #c4602f");
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
  if (brandColor !== undefined) restaurant.brandColor = String(brandColor).toLowerCase();
  if (gstin !== undefined) restaurant.gstin = gstin;
  if (fssaiLicense !== undefined) restaurant.fssaiLicense = fssaiLicense;
  if (tagline !== undefined) restaurant.tagline = tagline;
  if (aboutText !== undefined) restaurant.aboutText = aboutText;
  if (publicUrl !== undefined) restaurant.publicUrl = publicUrl.replace(/\/+$/, "");
  if (heroImages !== undefined) restaurant.heroImages = heroImages;
  if (dayEndTime !== undefined) restaurant.dayEndTime = dayEndTime;
  if (timezone !== undefined) restaurant.timezone = timezone;
  if (tableAutoReleaseMinutes !== undefined) restaurant.tableAutoReleaseMinutes = tableAutoReleaseMinutes;
  if (serviceFlow !== undefined) {
    if (!(SERVICE_FLOWS as string[]).includes(serviceFlow)) {
      throw new HttpError(400, "Choose the restaurant flow (pay after) or the cafe flow (pay first)");
    }
    restaurant.serviceFlow = serviceFlow as ServiceFlow;
  }
  if (prepBufferMinutes !== undefined) restaurant.prepBufferMinutes = prepBufferMinutes;
  if (prepMessageTemplate !== undefined) restaurant.prepMessageTemplate = prepMessageTemplate;
  if (taxRates !== undefined) restaurant.taxRates = taxRates;
  if (qrSettings !== undefined) Object.assign(restaurant.qrSettings, qrSettings);
  if (kotSettings !== undefined) {
    if (kotSettings.guestOrderMode !== undefined && !["auto", "accept"].includes(kotSettings.guestOrderMode)) {
      throw new HttpError(400, "Guest orders must be sent automatically or wait for staff to accept");
    }
    if (kotSettings.tokenStart !== undefined) {
      const start = Number(kotSettings.tokenStart);
      if (!Number.isInteger(start) || start < 1 || start > 99999) {
        throw new HttpError(400, "The first token number must be a whole number from 1 to 99999");
      }
      kotSettings.tokenStart = start;
    }
    if (kotSettings.categoryGroups !== undefined) {
      const groups = kotSettings.categoryGroups as { categoryIds?: unknown }[];
      if (!Array.isArray(groups) || groups.length > 10) {
        throw new HttpError(400, "Use at most 10 groups of categories");
      }
      const seen = new Set<string>();
      kotSettings.categoryGroups = groups.map((group) => {
        const ids = Array.isArray(group?.categoryIds) ? group.categoryIds : [];
        if (ids.length < 2) throw new HttpError(400, "Choose at least two categories to print on one ticket");
        for (const id of ids) {
          if (typeof id !== "string" || !Types.ObjectId.isValid(id)) throw new HttpError(400, "Invalid category");
          if (seen.has(id)) throw new HttpError(400, "A category can be in only one group");
          seen.add(id);
        }
        return { categoryIds: ids as string[] };
      }) as never;
    }
    if (kotSettings.steps !== undefined) {
      const steps = kotSettings.steps as Record<string, unknown>;
      for (const key of ["preparing", "ready", "served"]) {
        if (steps[key] !== undefined && typeof steps[key] !== "boolean") {
          throw new HttpError(400, "Kitchen steps must be on or off");
        }
      }
      kotSettings.steps = {
        preparing: steps.preparing !== false,
        ready: steps.ready !== false,
        served: steps.served !== false,
      };
      if (!kotSettings.steps.ready && !kotSettings.steps.served) {
        throw new HttpError(400, "Keep the Ready or the Served step on, or a dish would never finish");
      }
    }
    if (kotSettings.layouts !== undefined) kotSettings.layouts = cleanLayouts(kotSettings.layouts, KOT_SHOW, KOT_FONTS);
    Object.assign(restaurant.kotSettings, kotSettings);
    restaurant.markModified("kotSettings.layouts");
  }
  if (invoiceSettings !== undefined) {
    if (invoiceSettings.invoicePrefix !== undefined) {
      const prefix = String(invoiceSettings.invoicePrefix).trim().toUpperCase();
      if (!INVOICE_PREFIX_PATTERN.test(prefix)) {
        throw new HttpError(400, "Invoice prefix must be 1 to 3 letters or digits");
      }
      invoiceSettings.invoicePrefix = prefix;
    }
    if (invoiceSettings.placeOfSupply !== undefined && String(invoiceSettings.placeOfSupply).length > 60) {
      throw new HttpError(400, "Place of supply must be 60 characters or fewer");
    }
    if (invoiceSettings.maskCustomerPhone !== undefined && typeof invoiceSettings.maskCustomerPhone !== "boolean") {
      throw new HttpError(400, "Hiding the customer's phone number must be on or off");
    }
    if (invoiceSettings.autoPrintBill !== undefined && typeof invoiceSettings.autoPrintBill !== "boolean") {
      throw new HttpError(400, "Automatic bill printing must be on or off");
    }
    if (invoiceSettings.layouts !== undefined) {
      invoiceSettings.layouts = cleanLayouts(invoiceSettings.layouts, INVOICE_SHOW, INVOICE_FONTS);
    }
    Object.assign(restaurant.invoiceSettings, invoiceSettings);
    restaurant.markModified("invoiceSettings.layouts");
  }
  if (billingSettings !== undefined) {
    const { serviceChargePercent, maxStaffDiscountPercent, upiVpa, upiPayeeName, dineInPayment } = billingSettings;
    const { packagingMode, packagingFlatCharge } = billingSettings;
    if (packagingMode !== undefined && packagingMode !== "perPlate" && packagingMode !== "flat") {
      throw new HttpError(400, "Choose whether packaging is charged per plate or once per order");
    }
    if (
      packagingFlatCharge !== undefined &&
      (typeof packagingFlatCharge !== "number" || !(packagingFlatCharge >= 0) || packagingFlatCharge > 10000)
    ) {
      throw new HttpError(400, "Packaging charge must be between ₹0 and ₹10,000");
    }
    if (billingSettings.extraCharges !== undefined) {
      billingSettings.extraCharges = cleanExtraCharges(billingSettings.extraCharges);
    }
    if (dineInPayment !== undefined && dineInPayment !== "after" && dineInPayment !== "upfront") {
      throw new HttpError(400, "Choose whether dine-in guests pay after eating or when ordering");
    }
    if (billingSettings.guestPayOptions !== undefined) {
      const options = billingSettings.guestPayOptions as Record<string, unknown>;
      for (const key of ["online", "upiQr", "counter"]) {
        if (options[key] !== undefined && typeof options[key] !== "boolean") {
          throw new HttpError(400, "Guest payment options must be on or off");
        }
      }
      billingSettings.guestPayOptions = {
        online: options.online !== false,
        upiQr: options.upiQr !== false,
        counter: options.counter !== false,
      };
    }
    if (billingSettings.takeawayPayFirst !== undefined && typeof billingSettings.takeawayPayFirst !== "boolean") {
      throw new HttpError(400, "Takeaway and counter pay first must be on or off");
    }
    if (
      serviceChargePercent !== undefined &&
      (typeof serviceChargePercent !== "number" || serviceChargePercent < 0 || serviceChargePercent > 20)
    ) {
      throw new HttpError(400, "Service charge must be between 0% and 20%");
    }
    if (
      maxStaffDiscountPercent !== undefined &&
      (typeof maxStaffDiscountPercent !== "number" || maxStaffDiscountPercent < 0 || maxStaffDiscountPercent > 100)
    ) {
      throw new HttpError(400, "Staff discount limit must be between 0% and 100%");
    }
    if (
      upiVpa !== undefined &&
      upiVpa !== "" &&
      !/^[A-Za-z0-9._-]{2,256}@[A-Za-z]{2,64}$/.test(String(upiVpa).trim())
    ) {
      throw new HttpError(400, "Enter a valid UPI ID, like restaurant@okicici");
    }
    if (upiPayeeName !== undefined && String(upiPayeeName).length > 60) {
      throw new HttpError(400, "UPI payee name must be 60 characters or fewer");
    }
    Object.assign(restaurant.billingSettings, {
      ...billingSettings,
      ...(upiVpa !== undefined && { upiVpa: String(upiVpa).trim() }),
    });
    // "How you serve" now decides whether dine-in guests pay first, so the older separate setting is retired.
    if (serviceFlow !== undefined) restaurant.billingSettings.dineInPayment = "after";
  }
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
  const { name, logoUrl, kotSettings, paper } = req.body as {
    name?: string;
    logoUrl?: string;
    kotSettings?: Partial<IKotSettings>;
    paper?: PaperKey;
  };
  const cleaned = kotSettings && { ...kotSettings, layouts: cleanLayouts(kotSettings.layouts, KOT_SHOW, KOT_FONTS) };
  const restaurant = await buildPreviewRestaurant(req, { name, logoUrl, kotSettings: cleaned });
  const paperSize = previewPaperSize(paper, restaurant.kotSettings?.paperSize);
  if (paperSize) restaurant.kotSettings = { ...restaurant.kotSettings, paperSize };
  const order = buildSampleOrder();
  const items = SAMPLE_ITEMS as unknown as IOrderItem[];
  await streamKotPdf(res, { restaurant, order, round: 1, items, tableCode: "5", tokenNumber: 12 });
});

export const previewInvoicePdf = asyncHandler(async (req: Request, res: Response) => {
  const { name, logoUrl, address, gstin, fssaiLicense, taxRates, invoiceSettings, paper } = req.body as {
    name?: string;
    logoUrl?: string;
    address?: string;
    gstin?: string;
    fssaiLicense?: string;
    taxRates?: ITaxRate[];
    invoiceSettings?: Partial<IInvoiceSettings>;
    paper?: PaperKey;
  };
  const cleaned = invoiceSettings && {
    ...invoiceSettings,
    layouts: cleanLayouts(invoiceSettings.layouts, INVOICE_SHOW, INVOICE_FONTS),
  };
  const restaurant = await buildPreviewRestaurant(req, {
    name,
    logoUrl,
    address,
    gstin,
    fssaiLicense,
    taxRates,
    invoiceSettings: cleaned,
  });
  const paperSize = previewPaperSize(paper, restaurant.invoiceSettings?.paperSize);
  if (paperSize) restaurant.invoiceSettings = { ...restaurant.invoiceSettings, paperSize };
  // Sample numbers when none are set yet, so the GSTIN and FSSAI lines can be checked in the header.
  if (!restaurant.address) restaurant.address = "123 Main Street, Your City";
  if (!restaurant.gstin) restaurant.gstin = "29ABCDE1234F1Z5";
  if (!restaurant.fssaiLicense) restaurant.fssaiLicense = "12345678901234";
  // A billed sample with a coupon, charges and a payment, so every detail can be switched on and off in the preview.
  const order = {
    ...buildSampleOrder(restaurant.invoiceSettings?.invoicePrefix),
    status: "billed",
    couponCode: "WELCOME10",
    customerGstin: "29ABCDE1234F1Z5",
    payments: [{ method: "upi", amount: 0, reference: "UPI123456" }],
  } as unknown as IOrder;
  // Tokens print on bills in the cafe flow, so the sample is drawn as one, with a token on its dishes.
  restaurant.serviceFlow = "cafe";
  const items = SAMPLE_ITEMS.map((item) => ({ ...item, tokenNumber: 12 })) as unknown as IOrderItem[];
  const totals = computeInvoiceTotals(items, restaurant.taxRates || [], {
    couponDiscount: 20,
    serviceChargePercent: 5,
    extraCharges: [{ name: "Cutlery", type: "fixed", value: 5 }],
  });
  order.payments[0].amount = totals.grandTotal;
  if (!restaurant.billingSettings?.upiVpa) {
    restaurant.billingSettings = { ...restaurant.billingSettings, upiVpa: "restaurant@upi" };
  }
  await streamInvoicePdf(res, { restaurant, order, items, totals, preview: true });
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
