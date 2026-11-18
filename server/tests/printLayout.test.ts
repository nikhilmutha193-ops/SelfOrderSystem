import { beforeAll, describe, expect, it } from "vitest";

import { renderBill, renderKot } from "../src/modules/printing/printing.render";
import { computeInvoiceTotals } from "../src/utils/invoice";
import { cleanLayouts, INVOICE_FONTS, INVOICE_SHOW, resolveInvoiceLayout, resolveKotLayout } from "../src/utils/printLayout";
import { api, bearer, createWorld, loginAdmin } from "./fixtures";

let owner: string;

beforeAll(async () => {
  await createWorld();
  owner = await loginAdmin();
});

describe("print layouts", () => {
  it("falls back to the older settings, and saved layouts win per paper", () => {
    const settings = {
      showCustomerName: false,
      showJainTag: true,
      fontSize: "large" as const,
      layouts: { p58: { show: { customerName: true, footer: false }, fonts: { items: "small" } } },
    };
    const wide = resolveKotLayout(settings, "p80");
    expect(wide.show.customerName).toBe(false);
    expect(wide.fonts.items).toBe("large");
    const narrow = resolveKotLayout(settings, "p58");
    expect(narrow.show.customerName).toBe(true);
    expect(narrow.show.footer).toBe(false);
    expect(narrow.fonts.items).toBe("small");
    expect(resolveInvoiceLayout({ showUnitPrice: false }, "p80").show.unitPrice).toBe(false);
  });

  it("drops unknown papers, keys and sizes", () => {
    const cleaned = cleanLayouts(
      { p58: { show: { gstin: false, nope: true, address: "yes" }, fonts: { items: "huge", header: "large" } }, a4: {} },
      INVOICE_SHOW,
      INVOICE_FONTS,
    );
    expect(cleaned).toEqual({ p58: { show: { gstin: false }, fonts: { header: "large" } } });
  });

  it("saves layouts from the settings and previews them for a chosen paper", async () => {
    const saved = await api()
      .put("/api/restaurant/settings")
      .set(bearer(owner))
      .send({ invoiceSettings: { layouts: { p58: { show: { gstin: false, bogus: true } } } } });
    expect(saved.status).toBe(200);
    const got = await api().get("/api/restaurant/settings").set(bearer(owner));
    expect(got.body.invoiceSettings.layouts).toEqual({ p58: { show: { gstin: false } } });

    for (const [path, body] of [
      ["kot-preview", { paper: "p58", kotSettings: { layouts: { p58: { show: { token: false } } } } }],
      ["invoice-preview", { paper: "p58", invoiceSettings: { layouts: { p58: { show: { payments: false } } } } }],
    ] as const) {
      const res = await api().post(`/api/restaurant/${path}`).set(bearer(owner)).send(body).buffer(true).parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => cb(null, Buffer.concat(chunks)));
      });
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("application/pdf");
    }
  });

  it("hides details from the thermal ticket and bill when they are switched off", () => {
    const restaurant = {
      name: "Cafe",
      timezone: "Asia/Kolkata",
      kotSettings: { footerNote: "See you", layouts: { p58: { show: { footer: false, token: false } } } },
    } as never;
    const items = [{ foodName: "Dosa", quantity: 2, modifiers: [], note: "crispy", isJain: false, isPacked: false, components: [] }];
    const base = { restaurant, orderLabel: "Table 1", tokenNumber: 7, round: 1, items, printedAt: new Date() };
    const narrow = renderKot({ ...base, paperWidth: 58 }).toString("latin1");
    const wide = renderKot({ ...base, paperWidth: 80 }).toString("latin1");
    expect(narrow).not.toContain("See you");
    expect(narrow).not.toContain("TOKEN 7");
    expect(wide).toContain("See you");
    expect(wide).toContain("TOKEN 7");

    const totals = computeInvoiceTotals([{ total: 100, status: "pending" }], [{ name: "GST", percent: 5 }] as never);
    const bill = (layouts: object) =>
      renderBill({
        restaurant: {
          name: "Cafe",
          gstin: "29ABCDE1234F1Z5",
          timezone: "Asia/Kolkata",
          invoiceSettings: { layouts },
          billingSettings: {},
        } as never,
        order: { customerName: "Asha", status: "closed", checkinTime: new Date() } as never,
        orderLabel: "Dine-in",
        items: [{ foodName: "Dosa", quantity: 1, total: 100, status: "served", complimentary: false }],
        totals,
        paperWidth: 58,
      }).toString("latin1");
    expect(bill({})).toContain("GSTIN: 29ABCDE1234F1Z5");
    expect(bill({ p58: { show: { gstin: false } } })).not.toContain("GSTIN");
  });
});

describe("hiding the customer's mobile number", () => {
  it("masks the middle digits and leaves short or empty numbers alone", async () => {
    const { maskPhone, billPhone } = await import("../src/utils/phone");
    expect(maskPhone("9876543210")).toBe("98XXXXXX10");
    expect(maskPhone("+91 98765 43210")).toBe("+91 98XXXXXX10");
    expect(maskPhone("")).toBe("");
    expect(billPhone("9876543210", { maskCustomerPhone: false })).toBe("9876543210");
    expect(billPhone("9876543210", { maskCustomerPhone: true })).toBe("98XXXXXX10");
  });

  it("masks it on the thermal bill when the setting is on", () => {
    const totals = computeInvoiceTotals([{ total: 100, status: "pending" }], [] as never);
    const bill = (maskCustomerPhone: boolean) =>
      renderBill({
        restaurant: {
          name: "Cafe",
          timezone: "Asia/Kolkata",
          invoiceSettings: { maskCustomerPhone },
          billingSettings: {},
        } as never,
        order: { customerName: "Asha", customerPhone: "9876543210", status: "closed", checkinTime: new Date() } as never,
        orderLabel: "Dine-in",
        items: [{ foodName: "Dosa", quantity: 1, total: 100, status: "served", complimentary: false }],
        totals,
        paperWidth: 80,
      }).toString("latin1");
    expect(bill(false)).toContain("9876543210");
    expect(bill(true)).toContain("98XXXXXX10");
    expect(bill(true)).not.toContain("9876543210");
  });
});
