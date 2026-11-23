import { beforeAll, describe, expect, it } from "vitest";

import { orderFields } from "../src/utils/invoiceFields";
import { api, bearer, createWorld, loginAdmin } from "./fixtures";

let owner: string;

beforeAll(async () => {
  await createWorld();
  owner = await loginAdmin();
});

type Line = { kind: string; runs?: { text: string }[] };
const textOf = (lines: Line[]) => lines.filter((l) => l.kind === "text").map((l) => (l.runs ?? []).map((r) => r.text).join(""));
const preview = (invoiceSettings: unknown) =>
  api().post("/api/restaurant/invoice-preview-thermal").set(bearer(owner)).send({ paper: "p80", invoiceSettings });
const save = (invoiceSettings: unknown) => api().put("/api/restaurant/settings").set(bearer(owner)).send({ invoiceSettings });

describe("invoice name and field order", () => {
  it("cleans a saved order: known fields once, the rest added at the end", () => {
    expect(orderFields(["title", "name", "name", "bogus"], ["name", "address", "title"])).toEqual(["title", "name", "address"]);
    expect(orderFields(undefined, ["a", "b"])).toEqual(["a", "b"]);
  });

  it("prints the invoice name on its own lines and the fields in the chosen order", async () => {
    const res = await preview({
      displayName: "Benne Kaffi",
      subText: "Filter Coffee House",
      headerOrder: ["title", "name", "subtext", "address", "gstin", "fssai", "token"],
      detailsOrder: ["customer", "orderType", "dateTime", "invoiceNumber", "customerGstin"],
    });
    expect(res.status).toBe(200);
    const text = textOf(res.body.lines);
    expect(text.indexOf("Benne Kaffi")).toBeGreaterThan(-1);
    expect(text).toContain("Filter Coffee House");
    const title = text.findIndex((t) => /Tax Invoice|Bill Preview/.test(t));
    expect(title).toBeLessThan(text.indexOf("Benne Kaffi"));
    const at = (prefix: string) => text.findIndex((t) => t.startsWith(prefix));
    expect(at("Order:")).toBeLessThan(at("Date:"));
    expect(at("Date:")).toBeLessThan(at("Invoice No:"));
  });

  it("keeps the standard order and the restaurant name when nothing is set", async () => {
    const text = textOf((await preview({})).body.lines);
    const at = (prefix: string) => text.findIndex((t) => t.startsWith(prefix));
    expect(at("Invoice No:")).toBeLessThan(at("Date:"));
    expect(at("Date:")).toBeLessThan(at("Order:"));
  });

  it("saves the name and the order, and refuses a bad one", async () => {
    expect((await save({ displayName: "Benne Kaffi", headerOrder: ["title", "name"] })).status).toBe(200);
    const got = (await api().get("/api/restaurant/settings").set(bearer(owner))).body.invoiceSettings;
    expect(got.displayName).toBe("Benne Kaffi");
    expect(got.headerOrder.slice(0, 2)).toEqual(["title", "name"]);
    expect(got.headerOrder).toHaveLength(7);

    expect((await save({ headerOrder: ["name", "colour"] })).status).toBe(400);
    expect((await save({ detailsOrder: "dateTime" })).status).toBe(400);
    expect((await save({ displayName: "x".repeat(81) })).status).toBe(400);
    expect((await save({ subText: "x".repeat(121) })).status).toBe(400);
    expect((await save({ displayName: "Two\nlines" })).status).toBe(200);
    expect((await api().get("/api/restaurant/settings").set(bearer(owner))).body.invoiceSettings.displayName).toBe("Two lines");
    expect((await save({ displayName: "" })).status).toBe(200);
  });
});

describe("invoice name and text under it have their own sizes", () => {
  it("prints the subtext under the name in its own size, and the layout saves both sizes", async () => {
    const res = await preview({
      displayName: "Benne Kaffi",
      subText: "Since 1998",
      layouts: { p80: { fonts: { name: "large", subtext: "small" } } },
    });
    expect(res.status).toBe(200);
    const text = textOf(res.body.lines);
    expect(text.indexOf("Since 1998")).toBe(text.indexOf("Benne Kaffi") + 1);
    const runOf = (t: string) => res.body.lines.find((l: any) => l.kind === "text" && l.runs?.[0]?.text === t).runs[0];
    expect(runOf("Benne Kaffi").wide).toBe(2);
    expect(runOf("Since 1998").small).toBe(true);
  });
});
