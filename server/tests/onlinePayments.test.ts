import crypto from "crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import Order from "../src/models/Order";
import OrderItem from "../src/models/OrderItem";
import PaymentAttempt from "../src/models/PaymentAttempt";
import PaymentGateway from "../src/models/PaymentGateway";
import Restaurant from "../src/models/Restaurant";
import TableModel from "../src/models/Table";
import { api, bearer, createWorld, loginAdmin, seatTable, World } from "./fixtures";

const KEY_ID = "rzp_test_abc123XYZ";
const KEY_SECRET = "test_key_secret_value";
const WEBHOOK_SECRET = "test_webhook_secret";

let world: World;
let owner: string;

// A stand-in for api.razorpay.com: orders created here, payments set up per test.
interface FakePayment {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string;
  method: string;
}
const gatewayOrders = new Map<string, { id: string; amount: number }>();
const payments = new Map<string, FakePayment>();
const calls: { method: string; url: string; auth: string | null; body: unknown }[] = [];
let rejectKeys = false;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const realFetch = globalThis.fetch;
beforeAll(async () => {
  vi.stubGlobal("fetch", async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    if (!url.startsWith("https://api.razorpay.com/v1")) return realFetch(input, init);
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    const auth = new Headers(init.headers).get("Authorization");
    calls.push({ method, url, auth, body });
    if (rejectKeys) return json(401, { error: { description: "Authentication failed" } });
    const path = url.slice("https://api.razorpay.com/v1".length);
    if (method === "GET" && path.startsWith("/orders?")) return json(200, { items: [] });
    if (method === "POST" && path === "/orders") {
      const order = { id: `order_${gatewayOrders.size + 1}`, amount: body.amount, currency: "INR", status: "created" };
      gatewayOrders.set(order.id, order);
      return json(200, order);
    }
    const capture = path.match(/^\/payments\/([^/]+)\/capture$/);
    if (method === "POST" && capture) {
      const payment = payments.get(capture[1])!;
      payment.status = "captured";
      return json(200, payment);
    }
    const fetchPayment = path.match(/^\/payments\/([^/]+)$/);
    if (method === "GET" && fetchPayment) {
      const payment = payments.get(fetchPayment[1]);
      return payment ? json(200, payment) : json(404, { error: { description: "not found" } });
    }
    return json(404, { error: { description: "unexpected call" } });
  });

  world = await createWorld();
  owner = await loginAdmin();
  await Restaurant.updateOne({ _id: world.restaurantId }, { $set: { "billingSettings.dineInPayment": "upfront" } });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  calls.length = 0;
  rejectKeys = false;
});

const sign = (payload: string, secret: string) => crypto.createHmac("sha256", secret).update(payload).digest("hex");

function pay(gatewayOrderId: string, paymentId: string, status = "captured") {
  const order = gatewayOrders.get(gatewayOrderId)!;
  payments.set(paymentId, { id: paymentId, order_id: order.id, amount: order.amount, currency: "INR", status, method: "upi" });
  return {
    razorpay_order_id: order.id,
    razorpay_payment_id: paymentId,
    razorpay_signature: sign(`${order.id}|${paymentId}`, KEY_SECRET),
  };
}

async function guestWithDosa(tableNumber: number) {
  const seat = await seatTable(tableNumber);
  await api()
    .post(`/api/orders/${seat.orderId}/items`)
    .set(bearer(seat.token))
    .send({ items: [{ foodItemId: world.food.dosa, quantity: 2 }] });
  return seat;
}

describe("gateway settings", () => {
  it("checks the keys with Razorpay, then never hands the secrets back", async () => {
    const res = await api()
      .put("/api/payments/settings")
      .set(bearer(owner))
      .send({ enabled: true, keyId: KEY_ID, keySecret: KEY_SECRET, webhookSecret: WEBHOOK_SECRET });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      provider: "razorpay",
      enabled: true,
      keyId: KEY_ID,
      hasKeySecret: true,
      hasWebhookSecret: true,
      secretsUnreadable: false,
    });
    expect(calls[0].auth).toBe(`Basic ${Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString("base64")}`);

    const stored = await PaymentGateway.findOne({ restaurantId: world.restaurantId }).lean();
    expect(stored!.keySecretEnc).not.toContain(KEY_SECRET);
    const settings = await api().get("/api/restaurant/settings").set(bearer(owner));
    expect(JSON.stringify(settings.body)).not.toContain(KEY_SECRET);
  });

  it("refuses keys Razorpay rejects, and turning it on without keys", async () => {
    rejectKeys = true;
    const bad = await api().put("/api/payments/settings").set(bearer(owner)).send({ keySecret: "wrong" });
    expect(bad.status).toBe(409);
    expect(bad.body.message).toBe("The Razorpay keys were rejected. Check them under Settings → Billing.");
    expect(await PaymentGateway.countDocuments({ restaurantId: world.restaurantId, enabled: true })).toBe(1);

    const badId = await api().put("/api/payments/settings").set(bearer(owner)).send({ keyId: "not-a-key" });
    expect(badId.status).toBe(400);
  });

  it("is for staff who can change settings", async () => {
    const manager = await loginAdmin("manager", "Manager@123");
    expect((await api().get("/api/payments/settings").set(bearer(manager))).status).toBe(403);
  });
});

describe("a guest paying from their phone", () => {
  it("pays through Checkout, which settles the order and sends it to the kitchen", async () => {
    const seat = await guestWithDosa(1);
    const view = await api().get(`/api/orders/${seat.orderId}`).set(bearer(seat.token));
    expect(view.body.onlinePayment).toBe(true);

    const checkout = await api().post(`/api/payments/orders/${seat.orderId}/checkout`).set(bearer(seat.token));
    expect(checkout.status).toBe(201);
    expect(checkout.body).toMatchObject({ provider: "razorpay", keyId: KEY_ID, currency: "INR" });
    expect(checkout.body.amount).toBe(Math.round(view.body.totals.grandTotal * 100));
    expect(checkout.body).not.toHaveProperty("keySecret");

    // Opening it again reuses the same gateway order.
    const again = await api().post(`/api/payments/orders/${seat.orderId}/checkout`).set(bearer(seat.token));
    expect(again.body.gatewayOrderId).toBe(checkout.body.gatewayOrderId);

    const forged = { ...pay(checkout.body.gatewayOrderId, "pay_1"), razorpay_signature: "0".repeat(64) };
    expect((await api().post("/api/payments/razorpay/confirm").set(bearer(seat.token)).send(forged)).status).toBe(400);

    const confirm = await api()
      .post("/api/payments/razorpay/confirm")
      .set(bearer(seat.token))
      .send(pay(checkout.body.gatewayOrderId, "pay_1"));
    expect(confirm.status).toBe(200);
    expect(confirm.body).toEqual({ status: "paid" });

    const order = await Order.findById(seat.orderId).lean();
    expect(order).toMatchObject({ status: "closed", paymentMethod: "online" });
    expect(order!.payments[0]).toMatchObject({ method: "online", reference: "pay_1", receivedByName: "Razorpay" });
    expect((await OrderItem.find({ orderId: seat.orderId })).every((i) => i.kotRound === 1)).toBe(true);
    expect((await TableModel.findById(world.tableIds[0]))!.status).toBe("occupied");

    // A repeated confirmation (or the webhook arriving later) changes nothing.
    const repeat = await api()
      .post("/api/payments/razorpay/confirm")
      .set(bearer(seat.token))
      .send(pay(checkout.body.gatewayOrderId, "pay_1"));
    expect(repeat.body).toEqual({ status: "paid" });
    expect((await Order.findById(seat.orderId).lean())!.payments).toHaveLength(1);
  });

  it("settles from the webhook when the browser never comes back", async () => {
    const seat = await guestWithDosa(2);
    const checkout = await api().post(`/api/payments/orders/${seat.orderId}/checkout`).set(bearer(seat.token));
    pay(checkout.body.gatewayOrderId, "pay_2");
    const body = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_2", order_id: checkout.body.gatewayOrderId } } },
    });

    const forged = await api()
      .post("/api/payments/razorpay/webhook")
      .set({ "Content-Type": "application/json", "X-Razorpay-Signature": sign(body, "someone-else") })
      .send(body);
    expect(forged.status).toBe(400);
    expect((await Order.findById(seat.orderId).lean())!.status).toBe("open");

    const res = await api()
      .post("/api/payments/razorpay/webhook")
      .set({ "Content-Type": "application/json", "X-Razorpay-Signature": sign(body, WEBHOOK_SECRET) })
      .send(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "paid" });
    expect((await Order.findById(seat.orderId).lean())!.status).toBe("closed");
  });

  it("captures a payment that was only authorized", async () => {
    const seat = await guestWithDosa(3);
    const checkout = await api().post(`/api/payments/orders/${seat.orderId}/checkout`).set(bearer(seat.token));
    const confirm = await api()
      .post("/api/payments/razorpay/confirm")
      .set(bearer(seat.token))
      .send(pay(checkout.body.gatewayOrderId, "pay_3", "authorized"));
    expect(confirm.body).toEqual({ status: "paid" });
    expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/payments/pay_3/capture"))).toBe(true);
  });

  it("leaves the order for staff when the bill changed after checkout started", async () => {
    await api().patch(`/api/pos/tables/${world.tableIds[0]}/release`).set(bearer(owner));
    const seat = await guestWithDosa(1);
    const checkout = await api().post(`/api/payments/orders/${seat.orderId}/checkout`).set(bearer(seat.token));
    await api()
      .post(`/api/orders/${seat.orderId}/items`)
      .set(bearer(seat.token))
      .send({ items: [{ foodItemId: world.food.vada, quantity: 1 }] });

    const confirm = await api()
      .post("/api/payments/razorpay/confirm")
      .set(bearer(seat.token))
      .send(pay(checkout.body.gatewayOrderId, "pay_4"));
    expect(confirm.body).toEqual({ status: "mismatch" });
    expect((await Order.findById(seat.orderId).lean())!.status).toBe("open");

    const attention = await api().get("/api/payments/attention").set(bearer(owner));
    expect(attention.body.map((a: { paymentId: string }) => a.paymentId)).toContain("pay_4");
    expect((await PaymentAttempt.findOne({ paymentId: "pay_4" }))!.note).toContain("Settle the order by hand");
  });

  it("can't open a checkout for another table's order", async () => {
    const mine = await guestWithDosa(2);
    const other = await Order.findOne({ tableId: world.tableIds[0], status: "open" });
    const res = await api().post(`/api/payments/orders/${other!._id}/checkout`).set(bearer(mine.token));
    expect(res.status).toBe(403);
  });
});
