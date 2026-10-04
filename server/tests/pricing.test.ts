import { beforeAll, describe, expect, it } from "vitest";

import FoodItem from "../src/models/FoodItem";
import StockItem from "../src/models/StockItem";
import StockMovement from "../src/models/StockMovement";
import TableModel from "../src/models/Table";
import { api, bearer, counterOrder, createWorld, loginAdmin, seatTable, World } from "./fixtures";

let world: World;
let owner: string;
let acHall: string;
let rooftop: string;

beforeAll(async () => {
  world = await createWorld();
  owner = await loginAdmin();
});

async function orderDetail(orderId: string) {
  return (await api().get(`/api/orders/${orderId}`).set(bearer(owner))).body;
}

describe("table areas", () => {
  it("creates, renames and validates areas", async () => {
    const saved = await api()
      .put("/api/pricing/areas")
      .set(bearer(owner))
      .send({ areas: [{ name: "AC Hall" }, { name: "Rooftop" }] });
    expect(saved.status).toBe(200);
    expect(saved.body.map((a: { name: string }) => a.name)).toEqual(["AC Hall", "Rooftop"]);
    [acHall, rooftop] = saved.body.map((a: { _id: string }) => a._id);

    const renamed = await api()
      .put("/api/pricing/areas")
      .set(bearer(owner))
      .send({ areas: [{ _id: acHall, name: "AC Dining" }, { _id: rooftop, name: "Rooftop" }] });
    expect(renamed.body[0]).toMatchObject({ _id: acHall, name: "AC Dining" });

    const dup = await api()
      .put("/api/pricing/areas")
      .set(bearer(owner))
      .send({ areas: [{ name: "Patio" }, { name: "patio" }] });
    expect(dup.status).toBe(400);
    expect(dup.body.message).toBe("Each area needs a different name");

    const area = await api()
      .put(`/api/pricing/tables/${world.tableIds[0]}/area`)
      .set(bearer(owner))
      .send({ areaId: acHall });
    expect(area.status).toBe(200);
    const unknown = await api()
      .put(`/api/pricing/tables/${world.tableIds[0]}/area`)
      .set(bearer(owner))
      .send({ areaId: "64b000000000000000000001" });
    expect(unknown.status).toBe(404);
  });
});

describe("price rules and packaging", () => {
  it("charges the area price, the takeaway price and packaging", async () => {
    const res = await api()
      .put(`/api/food-items/${world.food.coffee}`)
      .set(bearer(owner))
      .send({ priceRules: { takeaway: 90, areas: [{ areaId: acHall, price: 120 }] }, packagingCharge: 10 });
    expect(res.status).toBe(200);
    expect(res.body.priceRules).toMatchObject({ takeaway: 90, delivery: null });

    const acOrder = await counterOrder(owner, [{ foodItemId: world.food.coffee, quantity: 1 }], "AC", {
      tableId: world.tableIds[0],
    });
    const plainOrder = await counterOrder(owner, [{ foodItemId: world.food.coffee, quantity: 1 }], "Plain", {
      tableId: world.tableIds[1],
    });
    const takeaway = await counterOrder(owner, [{ foodItemId: world.food.coffee, quantity: 2 }], "Parcel");

    expect((await orderDetail(acOrder)).items[0]).toMatchObject({ unitPrice: 120, packagingCharge: 0 });
    expect((await orderDetail(plainOrder)).items[0]).toMatchObject({ unitPrice: 100, packagingCharge: 0 });
    const parcel = await orderDetail(takeaway);
    expect(parcel.items[0]).toMatchObject({ unitPrice: 90, packagingCharge: 10 });
    expect(parcel.totals).toMatchObject({ subtotal: 180, packagingCharge: 20, taxableAmount: 200, grandTotal: 210 });

    const billed = await api().post(`/api/orders/${takeaway}/bill`).set(bearer(owner)).send({});
    expect(billed.status).toBe(200);
    expect((await orderDetail(takeaway)).order.bill.packagingCharge).toBe(20);
  });

  it("shows a guest the price for their table's area", async () => {
    const { token } = await seatTable(1);
    const menu = await api().get("/api/menu").set(bearer(token));
    const coffee = menu.body
      .flatMap((c: { subcategories: { foodItems: { name: string; price: number }[] }[] }) =>
        c.subcategories.flatMap((s) => s.foodItems)
      )
      .find((f: { name: string }) => f.name === "Filter Coffee");
    expect(coffee.price).toBe(120);
    const anonymous = await api().get("/api/menu");
    const anonCoffee = anonymous.body
      .flatMap((c: { subcategories: { foodItems: { name: string; price: number }[] }[] }) =>
        c.subcategories.flatMap((s) => s.foodItems)
      )
      .find((f: { name: string }) => f.name === "Filter Coffee");
    expect(anonCoffee.price).toBe(100);
  });

  it("rejects bad prices", async () => {
    const negative = await api()
      .put(`/api/food-items/${world.food.coffee}`)
      .set(bearer(owner))
      .send({ packagingCharge: -1 });
    expect(negative.status).toBe(400);
    const badArea = await api()
      .put(`/api/food-items/${world.food.coffee}`)
      .set(bearer(owner))
      .send({ priceRules: { areas: [{ areaId: "64b000000000000000000001", price: 10 }] } });
    expect(badArea.status).toBe(400);
  });

  it("removing an area clears it from tables and dish prices", async () => {
    const res = await api()
      .put("/api/pricing/areas")
      .set(bearer(owner))
      .send({ areas: [{ _id: rooftop, name: "Rooftop" }] });
    expect(res.status).toBe(200);
    expect((await TableModel.findById(world.tableIds[0]))?.areaId).toBeNull();
    expect((await FoodItem.findById(world.food.coffee))?.priceRules.areas).toHaveLength(0);
  });
});

describe("combos", () => {
  let combo: string;

  it("creates a combo and rejects bad parts", async () => {
    const parent = await FoodItem.findById(world.food.dosa);
    const created = await api()
      .post("/api/food-items")
      .set(bearer(owner))
      .send({
        categoryId: parent!.categoryId.toString(),
        subcategoryId: parent!.subcategoryId.toString(),
        name: "Breakfast Combo",
        price: 199,
        comboItems: [
          { foodItemId: world.food.dosa, quantity: 1 },
          { foodItemId: world.food.coffee, quantity: 2 },
        ],
      });
    expect(created.status).toBe(201);
    combo = created.body._id;

    const nested = await api()
      .put(`/api/food-items/${world.food.vada}`)
      .set(bearer(owner))
      .send({ comboItems: [{ foodItemId: combo, quantity: 1 }] });
    expect(nested.status).toBe(400);
    expect(nested.body.message).toBe("A combo can't contain another combo");

    const self = await api()
      .put(`/api/food-items/${combo}`)
      .set(bearer(owner))
      .send({ comboItems: [{ foodItemId: combo, quantity: 1 }] });
    expect(self.status).toBe(400);
  });

  it("puts the combo's parts on the order line and deducts their stock", async () => {
    const item = await api()
      .post("/api/inventory/items")
      .set(bearer(owner))
      .send({ name: "Batter", unit: "g", purchaseUnit: "kg", purchaseFactor: 1000 });
    await StockItem.updateOne({ _id: item.body._id }, { $set: { avgCost: 1 } });
    await api()
      .put(`/api/inventory/recipes/${world.food.dosa}`)
      .set(bearer(owner))
      .send({ lines: [{ stockItemId: item.body._id, quantity: 100 }] })
      .expect(200);
    await api()
      .put(`/api/inventory/recipes/${world.food.coffee}`)
      .set(bearer(owner))
      .send({ lines: [{ stockItemId: item.body._id, quantity: 5 }] })
      .expect(200);

    const orderId = await counterOrder(owner, [{ foodItemId: combo, quantity: 2 }], "Combo guest");
    const detail = await orderDetail(orderId);
    expect(detail.items[0].components).toEqual([
      expect.objectContaining({ name: "Masala Dosa", quantity: 1 }),
      expect.objectContaining({ name: "Filter Coffee", quantity: 2 }),
    ]);
    const moves = await StockMovement.find({ orderItemId: detail.items[0]._id });
    expect(moves.reduce((sum, m) => sum + m.quantity, 0)).toBe(-(2 * 100 + 2 * 2 * 5));
  });
});
