import { beforeAll, describe, expect, it } from "vitest";

import FoodItem from "../src/models/FoodItem";
import OrderItem from "../src/models/OrderItem";
import StockMovement from "../src/models/StockMovement";
import { api, bearer, counterOrder, createWorld, loginAdmin, World } from "./fixtures";

let world: World;
let owner: string;
const stock: Record<string, string> = {};

beforeAll(async () => {
  world = await createWorld();
  owner = await loginAdmin();
});

const inv = (path: string) => `/api/inventory${path}`;
const onHand = async (name: string) => {
  const items = (await api().get(inv("/items")).set(bearer(owner))).body;
  return items.find((i: { name: string }) => i.name === name);
};
const cancelItem = (itemId: string) =>
  api().patch(`/api/orders/items/${itemId}/cancel`).set(bearer(owner)).send({ reason: "wrong_item" });

describe("stock items and recipes", () => {
  it("creates stock items and rejects duplicates", async () => {
    const items = [
      { name: "Milk", unit: "ml", purchaseUnit: "L", purchaseFactor: 1000, reorderLevel: 2000 },
      { name: "Decoction", unit: "ml", purchaseUnit: "L", purchaseFactor: 1000 },
      { name: "Dosa batter", unit: "g", purchaseUnit: "kg", purchaseFactor: 1000 },
      { name: "Oil", unit: "ml", purchaseUnit: "L", purchaseFactor: 1000 },
    ];
    for (const item of items) {
      const res = await api().post(inv("/items")).set(bearer(owner)).send(item);
      expect(res.status).toBe(201);
      stock[item.name] = res.body._id;
    }
    const dup = await api().post(inv("/items")).set(bearer(owner)).send({ name: "milk", unit: "ml" });
    expect(dup.status).toBe(409);
    expect(dup.body.message).toBe("A stock item called milk already exists");
  });

  it("saves recipes with modifier extras and validates options", async () => {
    const coffee = await api()
      .put(inv(`/recipes/${world.food.coffee}`))
      .set(bearer(owner))
      .send({
        lines: [
          { stockItemId: stock.Milk, quantity: 150, key: true },
          { stockItemId: stock.Decoction, quantity: 30 },
        ],
        modifierLines: [{ groupName: "Size", label: "Large", stockItemId: stock.Milk, quantity: 50 }],
      });
    expect(coffee.status).toBe(200);
    expect(coffee.body.recipe.lines).toHaveLength(2);

    const dosa = await api()
      .put(inv(`/recipes/${world.food.dosa}`))
      .set(bearer(owner))
      .send({
        lines: [
          { stockItemId: stock["Dosa batter"], quantity: 200, key: true },
          { stockItemId: stock.Oil, quantity: 10 },
        ],
      });
    expect(dosa.status).toBe(200);

    const bad = await api()
      .put(inv(`/recipes/${world.food.coffee}`))
      .set(bearer(owner))
      .send({
        lines: [{ stockItemId: stock.Milk, quantity: 150 }],
        modifierLines: [{ groupName: "Size", label: "Huge", stockItemId: stock.Milk, quantity: 50 }],
      });
    expect(bad.status).toBe(400);
    expect(bad.body.message).toBe("Size: Huge is not an option on Filter Coffee");

    const twice = await api()
      .put(inv(`/recipes/${world.food.vada}`))
      .set(bearer(owner))
      .send({
        lines: [
          { stockItemId: stock.Oil, quantity: 10 },
          { stockItemId: stock.Oil, quantity: 5 },
        ],
      });
    expect(twice.status).toBe(400);
  });

  it("keeps inventory to staff with the Inventory permission", async () => {
    const manager = await loginAdmin("manager", "Manager@123");
    expect((await api().get(inv("/items")).set(bearer(manager))).status).toBe(403);
  });
});

describe("purchases", () => {
  it("adds purchased stock in base units and sets the average cost", async () => {
    const vendor = await api().post(inv("/vendors")).set(bearer(owner)).send({ name: "Nandini Dairy" });
    expect(vendor.status).toBe(201);
    const res = await api()
      .post(inv("/purchases"))
      .set(bearer(owner))
      .send({
        vendorId: vendor.body._id,
        invoiceRef: "ND-101",
        lines: [
          { stockItemId: stock.Milk, quantity: 10, unitPrice: 60 },
          { stockItemId: stock.Decoction, quantity: 2, unitPrice: 200 },
          { stockItemId: stock["Dosa batter"], quantity: 5, unitPrice: 80 },
          { stockItemId: stock.Oil, quantity: 1, unitPrice: 150 },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ vendorName: "Nandini Dairy", total: 1550 });
    expect(await onHand("Milk")).toMatchObject({ onHand: 10000, avgCost: 0.06, value: 600 });
    expect(await onHand("Decoction")).toMatchObject({ onHand: 2000, avgCost: 0.2 });

    const register = await api().get(inv("/purchases")).set(bearer(owner));
    expect(register.body.total).toBe(1550);
  });
});

describe("consumption follows the kitchen", () => {
  it("selling 10 filter coffees uses exactly the recipe amounts", async () => {
    await counterOrder(owner, [{ foodItemId: world.food.coffee, quantity: 10 }]);
    expect((await onHand("Milk")).onHand).toBe(8500);
    expect((await onHand("Decoction")).onHand).toBe(1700);
  });

  it("adds modifier extras", async () => {
    const orderId = await counterOrder(owner, [], "Large", { sendToKitchen: false });
    await api()
      .post(`/api/orders/${orderId}/items`)
      .set(bearer(owner))
      .send({
        items: [{ foodItemId: world.food.coffee, quantity: 2, modifiers: [{ groupName: "Size", label: "Large" }] }],
      });
    expect((await onHand("Milk")).onHand).toBe(8500);
    await api().post(`/api/orders/${orderId}/kot/print`).set(bearer(owner));
    expect((await onHand("Milk")).onHand).toBe(8100);
  });

  it("puts stock back when a sent item is cancelled before cooking", async () => {
    const orderId = await counterOrder(owner, [{ foodItemId: world.food.dosa, quantity: 1 }]);
    expect((await onHand("Dosa batter")).onHand).toBe(4800);
    const item = await OrderItem.findOne({ orderId });
    await cancelItem(item!._id.toString());
    expect((await onHand("Dosa batter")).onHand).toBe(5000);
    const types = (await StockMovement.find({ orderItemId: item!._id })).map((m) => m.type).sort();
    expect(types).toEqual(["consumption", "consumption", "reversal", "reversal"]);
  });

  it("records a cooked item that is cancelled as wastage", async () => {
    const orderId = await counterOrder(owner, [{ foodItemId: world.food.dosa, quantity: 1 }]);
    const item = await OrderItem.findOne({ orderId });
    await api().patch(`/api/orders/items/${item!._id}/preparing`).set(bearer(owner));
    await cancelItem(item!._id.toString());
    expect((await onHand("Dosa batter")).onHand).toBe(4800);

    const report = await api().get(inv("/reports/usage")).set(bearer(owner));
    const batter = report.body.lines.find((l: { name: string }) => l.name === "Dosa batter");
    expect(batter).toMatchObject({ purchased: 5000, consumed: 0, wasted: 200, wastedValue: 16 });
    const milk = report.body.lines.find((l: { name: string }) => l.name === "Milk");
    expect(milk).toMatchObject({ consumed: 1900, consumedValue: 114 });
  });

  it("treats cooked items on a cancelled order as wastage, and leaves a voided paid bill alone", async () => {
    const cancelled = await counterOrder(owner, [{ foodItemId: world.food.dosa, quantity: 1 }]);
    const item = await OrderItem.findOne({ orderId: cancelled });
    await api().patch(`/api/orders/items/${item!._id}/serve`).set(bearer(owner));
    await api().patch(`/api/orders/${cancelled}/cancel`).set(bearer(owner)).send({});
    expect((await onHand("Dosa batter")).onHand).toBe(4600);
    expect(await StockMovement.countDocuments({ orderItemId: item!._id, type: "wastage" })).toBe(2);

    const paid = await counterOrder(owner, [{ foodItemId: world.food.dosa, quantity: 1 }]);
    await api().patch(`/api/orders/${paid}/pay`).set(bearer(owner)).send({ paymentMethod: "cash" });
    await api().post(`/api/orders/${paid}/void`).set(bearer(owner)).send({ reason: "Test void" });
    expect((await onHand("Dosa batter")).onHand).toBe(4400);
  });
});

describe("average cost, counts and adjustments", () => {
  it("re-averages the cost on a new purchase", async () => {
    await api()
      .post(inv("/purchases"))
      .set(bearer(owner))
      .send({ lines: [{ stockItemId: stock.Milk, quantity: 5, unitPrice: 72 }] });
    const milk = await onHand("Milk");
    expect(milk.onHand).toBe(13100);
    expect(milk.avgCost).toBeCloseTo((8100 * 0.06 + 5000 * 0.072) / 13100, 6);
  });

  it("records wastage with a reason and refuses it without one", async () => {
    const noReason = await api()
      .post(inv("/movements"))
      .set(bearer(owner))
      .send({ stockItemId: stock.Oil, type: "wastage", quantity: 50 });
    expect(noReason.status).toBe(400);
    expect(noReason.body.message).toBe("Add a reason for wastage or adjustments");
    const res = await api()
      .post(inv("/movements"))
      .set(bearer(owner))
      .send({ stockItemId: stock.Oil, type: "wastage", quantity: 50, note: "Spilled" });
    expect(res.status).toBe(201);
    expect(res.body.onHand).toBe(1000 - 10 * 3 - 50);
  });

  it("a stock count posts the variance so stock matches what was counted", async () => {
    const before = await onHand("Milk");
    const res = await api()
      .post(inv("/counts"))
      .set(bearer(owner))
      .send({
        note: "Night count",
        lines: [
          { stockItemId: stock.Milk, counted: 13000 },
          { stockItemId: stock.Oil, counted: 900 },
        ],
      });
    expect(res.status).toBe(201);
    const milkLine = res.body.lines.find((l: { name: string }) => l.name === "Milk");
    expect(milkLine).toMatchObject({ expected: 13100, counted: 13000, variance: -100 });
    expect(milkLine.value).toBeCloseTo(-100 * before.avgCost, 2);
    expect((await onHand("Milk")).onHand).toBe(13000);
    expect((await onHand("Oil")).onHand).toBe(900);

    const ledger = await api()
      .get(inv(`/items/${stock.Milk}/movements`))
      .set(bearer(owner));
    const sum = ledger.body.movements.reduce((s: number, m: { quantity: number }) => s + m.quantity, 0);
    expect(sum).toBe(13000);
  });

  it("refuses to change the unit of an item that has stock", async () => {
    const res = await api()
      .put(inv(`/items/${stock.Oil}`))
      .set(bearer(owner))
      .send({ name: "Oil", unit: "g", purchaseUnit: "L", purchaseFactor: 1000 });
    expect(res.status).toBe(409);
  });
});

describe("alerts, sold out and food cost", () => {
  it("counts items at or below their reorder level on the dashboard", async () => {
    await api()
      .put(inv(`/items/${stock.Milk}`))
      .set(bearer(owner))
      .send({ name: "Milk", unit: "ml", purchaseUnit: "L", purchaseFactor: 1000, reorderLevel: 20000 });
    const summary = await api().get("/api/dashboard/summary").set(bearer(owner));
    expect(summary.body.lowStockItems).toBe(1);
    expect((await onHand("Milk")).low).toBe(true);
  });

  it("marks a dish sold out when a key ingredient runs out and brings it back after a purchase", async () => {
    expect((await api().put(inv("/settings")).set(bearer(owner)).send({ autoSoldOut: true })).status).toBe(200);
    const batter = (await onHand("Dosa batter")).onHand;
    await api()
      .post(inv("/movements"))
      .set(bearer(owner))
      .send({ stockItemId: stock["Dosa batter"], type: "wastage", quantity: batter, note: "Batter turned sour" });
    let dosa = await FoodItem.findById(world.food.dosa);
    expect(dosa).toMatchObject({ isActive: false, soldOutByStock: true });
    const menu = await api().get("/api/menu");
    const names = menu.body.flatMap((c: { subcategories: { foodItems: { name: string }[] }[] }) =>
      c.subcategories.flatMap((s) => s.foodItems.map((f) => f.name))
    );
    expect(names).not.toContain("Masala Dosa");

    await api()
      .post(inv("/purchases"))
      .set(bearer(owner))
      .send({ lines: [{ stockItemId: stock["Dosa batter"], quantity: 2, unitPrice: 80 }] });
    dosa = await FoodItem.findById(world.food.dosa);
    expect(dosa).toMatchObject({ isActive: true, soldOutByStock: false });
  });

  it("shows each dish's recipe cost against its price", async () => {
    const recipes = await api().get(inv("/recipes")).set(bearer(owner));
    const coffee = recipes.body.find((r: { name: string }) => r.name === "Filter Coffee");
    const milk = await onHand("Milk");
    const expected = Math.round((150 * milk.avgCost + 30 * 0.2) * 100) / 100;
    expect(coffee.cost).toBe(expected);
    expect(coffee.costPercent).toBe(Math.round((expected / 100) * 100 * 100) / 100);
    expect(recipes.body.find((r: { name: string }) => r.name === "Medu Vada").recipe).toBeNull();
  });
});

describe("deleting stock items", () => {
  it("permanently deletes an item that has no history and isn't used in a recipe", async () => {
    const created = await api().post(inv("/items")).set(bearer(owner)).send({ name: "Sugar", unit: "g" });
    expect(created.status).toBe(201);

    const res = await api().delete(inv(`/items/${created.body._id}`)).set(bearer(owner));
    expect(res.status).toBe(204);

    const items = await api().get(inv("/items")).set(bearer(owner));
    expect(items.body.map((i: { name: string }) => i.name)).not.toContain("Sugar");
  });

  it("refuses to delete an item that has stock history", async () => {
    const res = await api().delete(inv(`/items/${stock.Oil}`)).set(bearer(owner));
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/stock history/);
    expect((await onHand("Oil")).name).toBe("Oil");
  });

  it("refuses to delete an item that's used in a recipe", async () => {
    const created = await api().post(inv("/items")).set(bearer(owner)).send({ name: "Ghee", unit: "g" });
    await api()
      .put(inv(`/recipes/${world.food.vada}`))
      .set(bearer(owner))
      .send({ lines: [{ stockItemId: created.body._id, quantity: 5, key: false }] });

    const res = await api().delete(inv(`/items/${created.body._id}`)).set(bearer(owner));
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/Medu Vada/);
  });

  it("404s deleting a stock item that doesn't exist", async () => {
    const res = await api().delete(inv(`/items/${stock.Oil.slice(0, -3)}abc`)).set(bearer(owner));
    expect(res.status).toBe(404);
  });
});
