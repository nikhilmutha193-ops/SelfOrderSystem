import { beforeAll, describe, expect, it } from "vitest";

import Coupon from "../src/models/Coupon";
import Order from "../src/models/Order";
import OrderItem from "../src/models/OrderItem";
import Restaurant from "../src/models/Restaurant";
import { backfillLegacyBills } from "../src/utils/backfillBills";
import { financialYearLabel } from "../src/utils/invoiceNumber";
import { api, bearer, createWorld, loginAdmin, loginChef, seatTable, World } from "./fixtures";

let world: World;
let owner: string;
let manager: string;
let chef: string;
const fy = () => financialYearLabel(new Date(), "Asia/Kolkata");

beforeAll(async () => {
  world = await createWorld();
  owner = await loginAdmin();
  manager = await loginAdmin("manager", "Manager@123");
  chef = await loginChef();
});

async function takeaway(lines: { foodItemId: string; quantity: number }[], name = "Walk-in") {
  const order = await api().post("/api/orders/takeaway").set(bearer(owner)).send({ customerName: name });
  await api().post(`/api/orders/${order.body._id}/items`).set(bearer(owner)).send({ items: lines });
  return order.body._id as string;
}

const bill = (orderId: string, token = owner, body = {}) =>
  api().post(`/api/orders/${orderId}/bill`).set(bearer(token)).send(body);

const invoice = (orderId: string) => api().get(`/api/orders/${orderId}/invoice`).set(bearer(owner));

describe("generating a bill", () => {
  it("assigns the next number in the financial year series and saves the totals", async () => {
    const orderId = await takeaway([{ foodItemId: world.food.dosa, quantity: 1 }]);
    const res = await bill(orderId);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("billed");
    expect(res.body.invoiceNumber).toMatch(new RegExp(`^INV/${fy()}/\\d{6}$`));
    expect(res.body.invoiceNumber.length).toBeLessThanOrEqual(16);
    expect(res.body.bill).toMatchObject({
      subtotal: 120,
      taxableAmount: 120,
      grandTotal: 126,
      roundOff: 0,
      sac: "996331",
      legacy: false,
    });
  });

  it("rounds the total to the nearest rupee and shows the round-off", async () => {
    const orderId = await takeaway([{ foodItemId: world.food.dosa, quantity: 1 }]);
    await api().post(`/api/orders/${orderId}/coupon`).set(bearer(owner)).send({ code: "SAVE10" });
    const res = await bill(orderId);
    expect(res.body.bill).toMatchObject({
      subtotal: 120,
      discount: 12,
      taxableAmount: 108,
      roundOff: -0.4,
      grandTotal: 113,
    });
    expect(res.body.bill.taxLines).toEqual([
      { name: "CGST", percent: 2.5, base: 108, amount: 2.7 },
      { name: "SGST", percent: 2.5, base: 108, amount: 2.7 },
    ]);
  });

  it("gives concurrent bills consecutive numbers with no gaps or repeats", async () => {
    const orderIds = await Promise.all(
      Array.from({ length: 12 }, (_, n) => takeaway([{ foodItemId: world.food.vada, quantity: 1 }], `Rush ${n}`))
    );
    const results = await Promise.all(orderIds.map((id) => bill(id)));
    expect(results.every((r) => r.status === 200)).toBe(true);
    const seqs = results.map((r) => Number(r.body.invoiceNumber.split("/")[2])).sort((a, b) => a - b);
    expect(new Set(seqs).size).toBe(12);
    expect(seqs[11] - seqs[0]).toBe(11);
  });

  it("bills an order only once when two people press the button together", async () => {
    const orderId = await takeaway([{ foodItemId: world.food.vada, quantity: 1 }]);
    const [a, b] = await Promise.all([bill(orderId), bill(orderId)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);

    const winner = a.status === 200 ? a : b;
    const next = await bill(await takeaway([{ foodItemId: world.food.vada, quantity: 1 }]));
    const seq = (n: string) => Number(n.split("/")[2]);
    expect(seq(next.body.invoiceNumber)).toBe(seq(winner.body.invoiceNumber) + 1);
  });

  it("refuses to bill an order with no items", async () => {
    const empty = await api().post("/api/orders/takeaway").set(bearer(owner)).send({ customerName: "Empty" });
    const res = await bill(empty.body._id);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe("Add at least one item before generating the bill");
  });

  it("uses the restaurant's own prefix and prints the tax invoice", async () => {
    await Restaurant.updateOne({ _id: world.restaurantId }, { $set: { "invoiceSettings.invoicePrefix": "TK" } });
    const orderId = await takeaway([{ foodItemId: world.food.coffee, quantity: 1 }]);
    const res = await bill(orderId, owner, { customerGstin: "29abcde1234f1z5" });
    expect(res.body.invoiceNumber.startsWith(`TK/${fy()}/`)).toBe(true);
    expect(res.body.customerGstin).toBe("29ABCDE1234F1Z5");

    const pdf = await api().get(`/api/orders/${orderId}/invoice/pdf`).set(bearer(owner));
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
    expect(pdf.headers["content-disposition"]).toContain(`TK-${fy()}-`);
    await Restaurant.updateOne({ _id: world.restaurantId }, { $set: { "invoiceSettings.invoicePrefix": "INV" } });
  });

  it("rejects an invalid invoice prefix in settings", async () => {
    const res = await api()
      .put("/api/restaurant/settings")
      .set(bearer(owner))
      .send({ invoiceSettings: { invoicePrefix: "TOOLONG" } });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Invoice prefix must be 1 to 3 letters or digits");
  });
});

describe("billed orders are locked", () => {
  it("blocks new items, coupon changes and item cancellation until reopened", async () => {
    const orderId = await takeaway([{ foodItemId: world.food.dosa, quantity: 1 }]);
    const billed = await bill(orderId);
    const itemId = (await invoice(orderId)).body.items[0]._id;

    const add = await api()
      .post(`/api/orders/${orderId}/items`)
      .set(bearer(owner))
      .send({ items: [{ foodItemId: world.food.vada, quantity: 1 }] });
    expect(add.status).toBe(409);
    const cancelItem = await api().patch(`/api/orders/items/${itemId}/cancel`).set(bearer(owner)).send({});
    expect(cancelItem.body.message).toBe("This order has been billed. Reopen the bill to change it.");
    const coupon = await api().post(`/api/orders/${orderId}/coupon`).set(bearer(owner)).send({ code: "SAVE10" });
    expect(coupon.status).toBe(409);

    const noReason = await api().post(`/api/orders/${orderId}/reopen`).set(bearer(manager)).send({});
    expect(noReason.body.message).toBe("A reason is required");
    const reopened = await api()
      .post(`/api/orders/${orderId}/reopen`)
      .set(bearer(manager))
      .send({ reason: "Guest added a dessert" });
    expect(reopened.body).toMatchObject({ status: "open", bill: null, invoiceNumber: billed.body.invoiceNumber });

    await api()
      .post(`/api/orders/${orderId}/items`)
      .set(bearer(owner))
      .send({ items: [{ foodItemId: world.food.vada, quantity: 1 }] });
    const rebilled = await bill(orderId);
    expect(rebilled.body.invoiceNumber).toBe(billed.body.invoiceNumber);
    expect(rebilled.body.bill.subtotal).toBe(180);
  });

  it("keeps a paid bill's totals when tax rates change later", async () => {
    const orderId = await takeaway([{ foodItemId: world.food.dosa, quantity: 2 }]);
    await api().patch(`/api/orders/${orderId}/pay`).set(bearer(owner)).send({ paymentMethod: "cash" });
    const before = (await invoice(orderId)).body.totals;
    const summaryBefore = (await api().get("/api/dashboard/summary").set(bearer(owner))).body.salesToday;

    await Restaurant.updateOne({ _id: world.restaurantId }, { $set: { taxRates: [{ name: "GST", percent: 18 }] } });
    try {
      expect((await invoice(orderId)).body.totals).toEqual(before);
      expect((await api().get("/api/dashboard/summary").set(bearer(owner))).body.salesToday).toBe(summaryBefore);
    } finally {
      await Restaurant.updateOne(
        { _id: world.restaurantId },
        {
          $set: {
            taxRates: [
              { name: "CGST", percent: 2.5 },
              { name: "SGST", percent: 2.5 },
            ],
          },
        }
      );
    }
  });

  it("counts dashboard sales from the saved bill, including tax", async () => {
    const summary = (await api().get("/api/dashboard/summary").set(bearer(owner))).body;
    const paid = await Order.find({ restaurantId: world.restaurantId, status: "closed" });
    const expected = paid.reduce((sum, o) => sum + (o.bill?.grandTotal ?? 0), 0);
    expect(summary.salesToday).toBe(expected);
  });
});

describe("paying, cancelling and voiding", () => {
  it("bills an open order automatically when it is paid", async () => {
    const orderId = await takeaway([{ foodItemId: world.food.vada, quantity: 1 }]);
    const res = await api().patch(`/api/orders/${orderId}/pay`).set(bearer(owner)).send({ paymentMethod: "upi" });
    expect(res.status).toBe(400);
    const paid = await api().patch(`/api/orders/${orderId}/pay`).set(bearer(owner)).send({ paymentMethod: "online" });
    expect(paid.body).toMatchObject({ status: "closed", paymentMethod: "online" });
    expect(paid.body.invoiceNumber).toMatch(/^INV\//);
    expect(paid.body.bill.grandTotal).toBe(63);
  });

  it("needs a reason to cancel a bill and keeps its number in the register", async () => {
    const orderId = await takeaway([{ foodItemId: world.food.vada, quantity: 1 }]);
    const billed = await bill(orderId);
    const noReason = await api().patch(`/api/orders/${orderId}/cancel`).set(bearer(owner)).send({});
    expect(noReason.body.message).toBe("A reason is required to cancel a bill");
    const cancelled = await api()
      .patch(`/api/orders/${orderId}/cancel`)
      .set(bearer(owner))
      .send({ reason: "Guest left before food" });
    expect(cancelled.body).toMatchObject({ status: "cancelled", invoiceNumber: billed.body.invoiceNumber });

    const register = await api().get("/api/orders/invoices").set(bearer(owner));
    const row = register.body.find((r: { invoiceNumber: string }) => r.invoiceNumber === billed.body.invoiceNumber);
    expect(row).toMatchObject({ status: "cancelled", reason: "Guest left before food" });
  });

  it("lets only the owner void a paid bill, with a reason", async () => {
    const orderId = await takeaway([{ foodItemId: world.food.dosa, quantity: 1 }]);
    const paid = await api().patch(`/api/orders/${orderId}/pay`).set(bearer(owner)).send({ paymentMethod: "cash" });

    const denied = await api().post(`/api/orders/${orderId}/void`).set(bearer(manager)).send({ reason: "Mistake" });
    expect(denied.status).toBe(403);
    const voided = await api()
      .post(`/api/orders/${orderId}/void`)
      .set(bearer(owner))
      .send({ reason: "Charged the wrong table" });
    expect(voided.body.status).toBe("cancelled");
    expect(voided.body.voidReason).toBe("Charged the wrong table");

    const register = await api().get("/api/orders/invoices").set(bearer(owner));
    const row = register.body.find((r: { invoiceNumber: string }) => r.invoiceNumber === paid.body.invoiceNumber);
    expect(row.status).toBe("voided");
    expect((await api().post(`/api/orders/${orderId}/void`).set(bearer(owner)).send({ reason: "Again" })).status).toBe(
      409
    );
  });
});

describe("coupons", () => {
  it("recalculates the discount when items change and drops a coupon below its minimum", async () => {
    await Coupon.create({
      restaurantId: world.restaurantId,
      code: "MIN200",
      type: "flat",
      value: 30,
      minOrderValue: 200,
      isActive: true,
    });
    const orderId = await takeaway([{ foodItemId: world.food.dosa, quantity: 1 }]);
    await api().post(`/api/orders/${orderId}/coupon`).set(bearer(owner)).send({ code: "SAVE10" });
    await api()
      .post(`/api/orders/${orderId}/items`)
      .set(bearer(owner))
      .send({ items: [{ foodItemId: world.food.dosa, quantity: 1 }] });
    expect((await invoice(orderId)).body.totals.discount).toBe(24);

    await api().post(`/api/orders/${orderId}/coupon`).set(bearer(owner)).send({ code: "MIN200" });
    const items = (await invoice(orderId)).body.items;
    await api().patch(`/api/orders/items/${items[0]._id}/cancel`).set(bearer(owner)).send({});
    const after = (await invoice(orderId)).body;
    expect(after.order.couponCode).toBeUndefined();
    expect(after.totals.discount).toBe(0);
  });

  it("counts a use at billing and gives it back when the bill is reopened", async () => {
    await Coupon.create({
      restaurantId: world.restaurantId,
      code: "ONCE",
      type: "flat",
      value: 10,
      minOrderValue: 0,
      usageLimit: 1,
      isActive: true,
    });
    const first = await takeaway([{ foodItemId: world.food.vada, quantity: 1 }]);
    const second = await takeaway([{ foodItemId: world.food.vada, quantity: 1 }]);
    await api().post(`/api/orders/${first}/coupon`).set(bearer(owner)).send({ code: "ONCE" });
    await api().post(`/api/orders/${second}/coupon`).set(bearer(owner)).send({ code: "ONCE" });

    expect((await bill(first)).status).toBe(200);
    expect((await Coupon.findOne({ code: "ONCE" }))!.usedCount).toBe(1);
    const blocked = await bill(second);
    expect(blocked.status).toBe(409);
    expect(blocked.body.message).toMatch(/^Coupon ONCE can't be used/);

    await api().post(`/api/orders/${first}/reopen`).set(bearer(owner)).send({ reason: "Wrong coupon" });
    expect((await Coupon.findOne({ code: "ONCE" }))!.usedCount).toBe(0);
    expect((await bill(second)).status).toBe(200);
  });
});

describe("kitchen items and duplicates", () => {
  it("asks for a reason before cancelling an item the kitchen already has", async () => {
    const seat = await seatTable(2, "Reason");
    await api()
      .post(`/api/orders/${seat.orderId}/items`)
      .set(bearer(seat.token))
      .send({ items: [{ foodItemId: world.food.dosa, quantity: 1 }] });
    const kot = await api().post(`/api/orders/${seat.orderId}/kot/print`).set(bearer(chef));
    const itemId = kot.body.items[0]._id;

    const noReason = await api().patch(`/api/orders/items/${itemId}/cancel`).set(bearer(owner)).send({});
    expect(noReason.body.message).toBe("Choose a reason to cancel an item that was already sent to the kitchen");
    const cancelled = await api()
      .patch(`/api/orders/items/${itemId}/cancel`)
      .set(bearer(owner))
      .send({ reason: "quality", note: "Too salty" });
    expect(cancelled.body).toMatchObject({ status: "cancelled", cancelReason: "quality", cancelNote: "Too salty" });
  });

  it("prints one ticket when several people press Print KOT together", async () => {
    const orderId = await takeaway([
      { foodItemId: world.food.dosa, quantity: 1 },
      { foodItemId: world.food.vada, quantity: 2 },
    ]);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => api().post(`/api/orders/${orderId}/kot/print`).set(bearer(chef)))
    );
    const printed = results.filter((r) => r.body.round !== null);
    expect(printed).toHaveLength(1);
    expect(printed[0].body.items).toHaveLength(2);
    const items = await OrderItem.find({ orderId });
    expect(new Set(items.map((i) => i.kotRound)).size).toBe(1);
    expect(items.every((i) => typeof i.tokenNumber === "number")).toBe(true);
  });

  it("returns the same dine-in order when the guest submits twice", async () => {
    const login = await api()
      .post("/api/auth/table/login")
      .send({ code: "tbl3", password: "pass3", startNewOrder: true });
    const details = { customerName: "Twice", members: 2 };
    const first = await api().post("/api/orders/dine-in").set(bearer(login.body.token)).send(details);
    const second = await api().post("/api/orders/dine-in").set(bearer(login.body.token)).send(details);
    expect(second.body.order._id).toBe(first.body.order._id);
  });

  it("replays a request with the same Idempotency-Key instead of repeating it", async () => {
    const key = "retry-takeaway-0001";
    const first = await api()
      .post("/api/orders/takeaway")
      .set(bearer(owner))
      .set("Idempotency-Key", key)
      .send({ customerName: "Retry" });
    const second = await api()
      .post("/api/orders/takeaway")
      .set(bearer(owner))
      .set("Idempotency-Key", key)
      .send({ customerName: "Retry" });
    expect(second.status).toBe(201);
    expect(second.body._id).toBe(first.body._id);
    expect(await Order.countDocuments({ customerName: "Retry" })).toBe(1);

    const reused = await api()
      .post(`/api/orders/${first.body._id}/items`)
      .set(bearer(owner))
      .set("Idempotency-Key", key)
      .send({ items: [{ foodItemId: world.food.vada, quantity: 1 }] });
    expect(reused.status).toBe(422);
  });
});

describe("archiving and old data", () => {
  it("archives finished orders, deletes only unsent test orders, and keeps both in reports", async () => {
    const paid = await takeaway([{ foodItemId: world.food.vada, quantity: 1 }], "Archive paid");
    await api().patch(`/api/orders/${paid}/pay`).set(bearer(owner)).send({ paymentMethod: "cash" });
    const test = await takeaway([{ foodItemId: world.food.vada, quantity: 1 }], "Archive test");
    const cooking = await takeaway([{ foodItemId: world.food.vada, quantity: 1 }], "Archive cooking");
    await api().post(`/api/orders/${cooking}/kot/print`).set(bearer(chef));

    const res = await api().delete("/api/orders").set(bearer(owner)).query({ type: "takeaway" });
    expect(res.status).toBe(200);
    expect(res.body.archived).toBeGreaterThan(0);
    expect(await Order.exists({ _id: test })).toBeNull();
    expect((await Order.findById(paid))!.archivedAt).toBeInstanceOf(Date);
    expect((await Order.findById(cooking))!.archivedAt).toBeNull();

    const list = await api().get("/api/orders").set(bearer(owner)).query({ type: "takeaway" });
    const names = list.body.map((o: { customerName: string }) => o.customerName);
    expect(names).toContain("Archive cooking");
    expect(names).not.toContain("Archive paid");

    const csv = await api().get("/api/orders/report.csv").set(bearer(owner)).buffer(true);
    expect(String(csv.text ?? csv.body)).toContain("Archive paid");
  });

  it("backfills legacy paid orders with saved totals and no invoice number", async () => {
    const legacy = await Order.create({
      restaurantId: world.restaurantId,
      orderType: "takeaway",
      customerName: "Legacy",
      status: "closed",
      paymentMethod: "cash",
    });
    await OrderItem.create({
      restaurantId: world.restaurantId,
      orderId: legacy._id,
      foodName: "Old dosa",
      unitPrice: 100,
      quantity: 1,
      total: 100,
      status: "served",
    });
    expect(await backfillLegacyBills()).toBeGreaterThan(0);
    const after = await Order.findById(legacy._id);
    expect(after!.bill).toMatchObject({ grandTotal: 105, legacy: true });
    expect(after!.invoiceNumber).toBeUndefined();
    expect(await backfillLegacyBills()).toBe(0);
  });
});
