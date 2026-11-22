import { beforeAll, describe, expect, it } from "vitest";

import { api, bearer, createWorld, loginAdmin } from "./fixtures";

let owner: string;

beforeAll(async () => {
  await createWorld();
  owner = await loginAdmin();
  await api()
    .post("/api/inventory/import/apply")
    .set(bearer(owner))
    .send({
      rows: [
        { Item: "Rice", "Counted in": "kg", Quantity: 10, "Cost per unit": 80 },
        { Item: "Oil", "Counted in": "l", Quantity: 5, "Cost per unit": 140 },
        { Item: "Eggs", "Counted in": "dozen", Quantity: 4, "Cost per unit": 84 },
      ],
    });
});

const inv = (path: string) => `/api/inventory${path}`;
const preview = (rows: object[]) => api().post(inv("/counts/import/preview")).set(bearer(owner)).send({ rows });
const apply = (rows: object[], note?: string) => api().post(inv("/counts/import/apply")).set(bearer(owner)).send({ rows, note });
const find = async (name: string) =>
  (await api().get(inv("/items")).set(bearer(owner))).body.find((i: { name: string }) => i.name === name);

describe("counting stock from a sheet", () => {
  it("previews what was counted against what is on hand, without saving", async () => {
    const rows = [
      { Item: "rice", "System stock": 10, "Counted quantity": 9.5 },
      { Item: "Oil", "System stock": 5, "Counted quantity": 5 },
      { Item: "Eggs", "System stock": 4, "Counted quantity": "" },
      { Item: "Ghost", "Counted quantity": 2 },
      { Item: "Rice", "Counted quantity": 1 },
      { Item: "Oil", "Counted quantity": -1 },
      { Item: "", "Counted quantity": "" },
    ];
    const seen = await preview(rows);
    expect(seen.status).toBe(200);
    expect(seen.body.counts).toMatchObject({ counted: 2, different: 1, skipped: 1, error: 3, blank: 1, varianceValue: -40 });
    const byRow = (n: number) => seen.body.rows.find((r: { row: number }) => r.row === n);
    expect(byRow(2)).toMatchObject({ action: "count", name: "Rice", expected: 10, counted: 9.5, variance: -0.5, value: -40 });
    expect(byRow(3)).toMatchObject({ action: "count", variance: 0 });
    expect(byRow(4)).toMatchObject({ action: "skip" });
    expect(byRow(5).error).toMatch(/Not in Inventory/);
    expect(byRow(6).error).toMatch(/Same item as row 2/);
    expect(byRow(7).error).toMatch(/Same item as row 3|negative/);
    expect((await find("Rice")).onHand).toBe(10);
  });

  it("saves one count: each difference becomes an adjustment and stock equals what was counted", async () => {
    const done = await apply(
      [
        { Item: "Rice", "System stock": 10, "Counted quantity": 9.5 },
        { Item: "Oil", "Counted quantity": 5 },
        { Item: "Eggs", "Counted quantity": "" },
      ],
      "Sunday night count"
    );
    expect(done.status).toBe(201);
    expect(done.body).toMatchObject({ counted: 2, different: 1, skipped: 1, varianceValue: -40 });
    expect(await find("Rice")).toMatchObject({ onHand: 9.5 });
    expect(await find("Oil")).toMatchObject({ onHand: 5 });
    expect(await find("Eggs")).toMatchObject({ onHand: 4 });

    const counts = await api().get(inv("/counts")).set(bearer(owner));
    expect(counts.body[0]).toMatchObject({ note: "Sunday night count", varianceValue: -40 });
    expect(counts.body[0].lines.map((l: { name: string; expected: number; counted: number; variance: number }) => [l.name, l.expected, l.counted, l.variance])).toEqual([
      ["Rice", 10, 9.5, -0.5],
      ["Oil", 5, 5, 0],
    ]);
    const rice = await find("Rice");
    const ledger = await api().get(inv(`/items/${rice._id}/movements`)).set(bearer(owner));
    expect(ledger.body.movements[0]).toMatchObject({ type: "adjustment", quantity: -0.5, note: "Stock count" });
  });

  it("warns when the stock changed after the sheet was made, and counts against what is there now", async () => {
    const seen = await preview([{ Item: "Rice", "System stock": 10, "Counted quantity": 9 }]);
    expect(seen.body.rows[0]).toMatchObject({ expected: 9.5, variance: -0.5 });
    expect(seen.body.rows[0].note).toMatch(/Stock changed since this sheet was made/);
  });

  it("needs a Counted quantity column, something to count, and uses a default note", async () => {
    expect((await preview([{ Item: "Rice", "System stock": 9.5 }])).status).toBe(400);
    expect((await preview([{ Stuff: 1 }])).status).toBe(400);
    const nothing = await apply([{ Item: "Rice", "Counted quantity": "" }]);
    expect(nothing.status).toBe(400);
    expect(nothing.body.message).toMatch(/nothing to count/);

    await apply([{ Item: "Rice", "Counted quantity": 9.5 }]);
    const counts = await api().get(inv("/counts")).set(bearer(owner));
    expect(counts.body[0].note).toBe("Count from Excel");
    expect((await api().post(inv("/counts/import/preview")).send({ rows: [{ Item: "x" }] })).status).toBe(401);
  });
});
