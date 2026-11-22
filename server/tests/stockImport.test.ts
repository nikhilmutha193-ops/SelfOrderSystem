import fs from "fs";
import path from "path";
import { beforeAll, describe, expect, it } from "vitest";

import { parseStockUnit } from "../src/modules/inventory/inventory.import";
import { api, bearer, createWorld, loginAdmin } from "./fixtures";

let owner: string;

beforeAll(async () => {
  await createWorld();
  owner = await loginAdmin();
});

const inv = (path: string) => `/api/inventory${path}`;
const preview = (rows: object[]) => api().post(inv("/import/preview")).set(bearer(owner)).send({ rows });
const apply = (rows: object[]) => api().post(inv("/import/apply")).set(bearer(owner)).send({ rows });
const find = async (name: string) =>
  (await api().get(inv("/items")).set(bearer(owner))).body.find((i: { name: string }) => i.name === name);

describe("the words that mean a counted-in type", () => {
  it("understands the usual spellings, and the labels from the list", () => {
    const cases: [string, string][] = [
      ["kg", "kg"], ["Kilograms", "kg"], ["KGS", "kg"], ["grams (g)", "g"], ["gm", "g"],
      ["litres (L)", "l"], ["Ltr", "l"], ["liter", "l"], ["ML", "ml"], ["millilitres", "ml"],
      ["pieces", "pcs"], ["Nos", "pcs"], ["doz", "dozen"], ["Pkt", "packet"], ["boxes", "box"],
      ["btl", "bottle"], ["tins", "can"], ["trays", "tray"], ["bunches", "bunch"],
    ];
    for (const [word, unit] of cases) expect(parseStockUnit(word), word).toBe(unit);
    expect(parseStockUnit("bucket")).toBeNull();
    expect(parseStockUnit("")).toBeNull();
  });
});

describe("the guide printed in the sample file and the dialog", () => {
  const client = path.join(__dirname, "..", "..", "client", "src", "features", "inventory");
  const guide = fs
    .readFileSync(path.join(client, "format.ts"), "utf8")
    .split(/\r?\n/)
    .map((line) => /value: "(\w+)",\s*label: "([^"]+)".*words: "([^"]+)"/.exec(line))
    .filter((m): m is RegExpExecArray => !!m);

  it("lists all twelve types", () => {
    expect(guide.map((m) => m[1]).sort()).toEqual(
      ["bottle", "box", "bunch", "can", "dozen", "g", "kg", "l", "ml", "packet", "pcs", "tray"].sort()
    );
  });

  it("only promises words and labels the import understands", () => {
    for (const [, unit, label, words] of guide) {
      expect(parseStockUnit(label), `label ${label}`).toBe(unit);
      for (const word of words.split(",").map((w) => w.trim())) expect(parseStockUnit(word), word).toBe(unit);
    }
  });

  it("uses types in the sample rows that the import understands", () => {
    const sample = fs.readFileSync(path.join(client, "stockSample.ts"), "utf8");
    const units = [...sample.matchAll(/unit: "([^"]+)"/g)].map((m) => m[1]);
    expect(units.length).toBeGreaterThanOrEqual(8);
    for (const unit of units) expect(parseStockUnit(unit), unit).not.toBeNull();
  });
});

describe("importing stock from Excel", () => {
  it("creates new items in their own types, with stock and cost, and previews without saving", async () => {
    const rows = [
      { Item: "Basmati rice", "Counted in": "kg", Quantity: 25, "Cost per unit": 90, "Alert below": 5 },
      { Item: "Refined oil", "Counted in": "Litres", Quantity: 15, "Cost per unit": 140 },
      { Item: "Eggs", "Counted in": "dozen", Quantity: 10, "Cost per unit": 84 },
      { Item: "Paper cups", "Counted in": "box", Quantity: 4 },
      { Item: "Turmeric", "Counted in": "g", Quantity: 500, "Cost per unit": 0.25 },
      { Item: "Soda", "Counted in": "bottle" },
    ];
    const seen = await preview(rows);
    expect(seen.status).toBe(200);
    expect(seen.body.counts).toMatchObject({ create: 6, add: 0, error: 0 });
    expect(await find("Basmati rice")).toBeUndefined();

    const done = await apply(rows);
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ created: 6, added: 0, skipped: 0 });
    expect(await find("Basmati rice")).toMatchObject({ unit: "kg", onHand: 25, avgCost: 90, reorderLevel: 5, value: 2250 });
    expect(await find("Refined oil")).toMatchObject({ unit: "l", onHand: 15, avgCost: 140 });
    expect(await find("Eggs")).toMatchObject({ unit: "dozen", onHand: 10 });
    expect(await find("Paper cups")).toMatchObject({ unit: "box", onHand: 4, avgCost: 0 });
    // g gets the usual purchase unit without being asked; an item with no quantity is created with no stock.
    expect(await find("Turmeric")).toMatchObject({ unit: "g", onHand: 500, purchaseUnit: "kg", purchaseFactor: 1000 });
    expect(await find("Soda")).toMatchObject({ unit: "bottle", onHand: 0 });
  });

  it("adds to the stock already on hand and averages the cost", async () => {
    const rows = [
      { Item: "basmati RICE", Quantity: 5, "Cost per unit": 102 },
      { Item: "Eggs", "Counted in": "dz", Quantity: 2 },
    ];
    const seen = await preview(rows);
    expect(seen.body.counts).toMatchObject({ create: 0, add: 2 });
    expect(seen.body.rows[0]).toMatchObject({ action: "add", before: 25, after: 30, quantity: 5 });

    expect((await apply(rows)).body).toMatchObject({ created: 0, added: 2 });
    // 25 kg at 90 and 5 kg at 102 average to 92.
    expect(await find("Basmati rice")).toMatchObject({ onHand: 30, avgCost: 92 });
    expect(await find("Eggs")).toMatchObject({ onHand: 12, avgCost: 84 });

    // Importing the same file again adds the quantities again: that is what "add" means.
    await apply([{ Item: "Eggs", Quantity: 2 }]);
    expect((await find("Eggs")).onHand).toBe(14);
  });

  it("only changes details when no quantity is given", async () => {
    const res = await apply([{ Item: "Eggs", "Alert below": 3 }]);
    expect(res.body).toMatchObject({ added: 0, updated: 1 });
    expect(await find("Eggs")).toMatchObject({ reorderLevel: 3, onHand: 14 });
    expect((await preview([{ Item: "Eggs", "Alert below": 3 }])).body.counts).toMatchObject({ unchanged: 1, update: 0 });
  });

  it("reports bad rows and still imports the good ones", async () => {
    const rows = [
      { Item: "Jaggery", "Counted in": "kg", Quantity: 3 },
      { Item: "Basmati rice", "Counted in": "g", Quantity: 100 },
      { Item: "Mystery", "Counted in": "bucket", Quantity: 1 },
      { Item: "No unit", Quantity: 1 },
      { Item: "Negative", "Counted in": "kg", Quantity: -2 },
      { Item: "Text qty", "Counted in": "kg", Quantity: "lots" },
      { Item: "Jaggery", "Counted in": "kg", Quantity: 9 },
      { Item: "", "Counted in": "kg", Quantity: 1 },
      { Item: "", "Counted in": "", Quantity: "" },
    ];
    const seen = await preview(rows);
    expect(seen.body.counts).toMatchObject({ create: 1, error: 7, blank: 1 });
    const message = (name: string, nth = 0) =>
      seen.body.rows.filter((r: { name: string }) => r.name === name)[nth]?.error as string;
    expect(message("Basmati rice")).toMatch(/counted in kg, not g/);
    expect(message("Mystery")).toMatch(/not a counted-in type/);
    expect(message("No unit")).toMatch(/needs Counted in/);
    expect(message("Negative")).toMatch(/can't be negative/);
    expect(message("Text qty")).toMatch(/must be a number/);
    expect(message("Jaggery", 1)).toMatch(/Same item as row 2/);
    expect(seen.body.rows.find((r: { name: string }) => r.name === "").error).toMatch(/Item name is empty/);

    const done = await apply(rows);
    expect(done.body).toMatchObject({ created: 1, skipped: 7 });
    expect(await find("Jaggery")).toMatchObject({ onHand: 3 });
    expect(await find("Mystery")).toBeUndefined();
    expect((await find("Basmati rice")).onHand).toBe(30);
  });

  it("records it in the item's history as opening stock from Excel", async () => {
    const item = await find("Jaggery");
    const ledger = await api().get(inv(`/items/${item._id}/movements`)).set(bearer(owner));
    expect(ledger.body.movements[0]).toMatchObject({ type: "opening", quantity: 3, note: "Imported from Excel" });
  });

  it("needs an Item column, some rows, and the inventory permission", async () => {
    expect((await preview([{ Stuff: "x" }])).status).toBe(400);
    expect((await preview([])).status).toBe(400);
    expect((await api().post(inv("/import/preview")).send({ rows: [{ Item: "x" }] })).status).toBe(401);
  });
});
