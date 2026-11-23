import crypto from "crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import Order from "../src/models/Order";
import PaymentAttempt from "../src/models/PaymentAttempt";
import PaymentGateway from "../src/models/PaymentGateway";
import Restaurant from "../src/models/Restaurant";
import { generateSignature, verifySignature } from "../src/modules/payments/paytm";
import { api, bearer, createWorld, loginAdmin, seatTable, World } from "./fixtures";

const MID = "CAFEAB12345678901234";
const KEY = "AbCdEfGh12345678"; // a Paytm merchant key is 16 characters
const STAGING = "https://securegw-stage.paytm.in";

let world: World;
let owner: string;

// A stand-in for Paytm's servers: what each order's status is, and the calls received.
const statuses = new Map<string, { resultStatus: string; txnId?: string; txnAmount?: string; paymentMode?: string; resultMsg?: string }>();
const calls: { url: string; body: Record<string, unknown>; signature: string }[] = [];

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const realFetch = globalThis.fetch;
beforeAll(async () => {
  vi.stubGlobal("fetch", async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    if (!url.startsWith(STAGING)) return realFetch(input, init);
    const sent = JSON.parse(String(init.body)) as { body: Record<string, unknown>; head: { signature: string } };
    calls.push({ url, body: sent.body, signature: sent.head.signature });
    // Paytm recomputes the checksum over the body with the merchant key.
    if (!verifySignature(JSON.stringify(sent.body), KEY, sent.head.signature)) {
      return json(200, { body: { resultInfo: { resultStatus: "F", resultCode: "330", resultMsg: "Invalid checksum" } } });
    }
    if (url.includes("/theia/api/v1/initiateTransaction")) {
      return json(200, { body: { resultInfo: { resultStatus: "S", resultCode: "0000" }, txnToken: `token-${sent.body.orderId}` } });
    }
    if (url.endsWith("/v3/order/status")) {
      const known = statuses.get(String(sent.body.orderId));
      if (!known) {
        return json(200, { body: { resultInfo: { resultStatus: "TXN_FAILURE", resultCode: "334", resultMsg: "Invalid Order ID" } } });
      }
      return json(200, {
        body: {
          resultInfo: { resultStatus: known.resultStatus, resultCode: "01", resultMsg: known.resultMsg ?? "" },
          orderId: sent.body.orderId,
          txnId: known.txnId,
          txnAmount: known.txnAmount,
          paymentMode: known.paymentMode,
        },
      });
    }
    return json(404, {});
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
});

async function guestWithDosa(tableNumber: number) {
  const seat = await seatTable(tableNumber);
  await api()
    .post(`/api/orders/${seat.orderId}/items`)
    .set(bearer(seat.token))
    .send({ items: [{ foodItemId: world.food.dosa, quantity: 2 }] });
  return seat;
}

const settingsBody = {
  provider: "paytm",
  enabled: true,
  paytmMid: MID,
  paytmKey: KEY,
  paytmWebsite: "WEBSTAGING",
  paytmEnvironment: "staging",
};

describe("the Paytm checksum", () => {
  it("signs a body so Paytm's own check (decrypt, then hash with the salt) accepts it", () => {
    const body = JSON.stringify({ mid: MID, orderId: "ORDER1" });
    const signature = generateSignature(body, KEY, "AB+/");
    expect(verifySignature(body, KEY, signature)).toBe(true);
    expect(verifySignature(body + " ", KEY, signature)).toBe(false);
    expect(verifySignature(body, "ZZZZZZZZ12345678", signature)).toBe(false);
    // The signature is AES-128-CBC of "sha256(body|salt)" + salt, with Paytm's fixed vector.
    const decipher = crypto.createDecipheriv("aes-128-cbc", KEY, "@@@@&&&&####$$$$");
    const plain = Buffer.concat([decipher.update(signature, "base64"), decipher.final()]).toString("utf8");
    expect(plain).toBe(crypto.createHash("sha256").update(`${body}|AB+/`).digest("hex") + "AB+/");
  });
});

describe("Paytm settings", () => {
  it("checks the merchant key with Paytm, then never hands it back", async () => {
    const wrong = await api().put("/api/payments/settings").set(bearer(owner)).send({ ...settingsBody, paytmKey: "WrongKey12345678" });
    expect(wrong.status).toBe(409);
    expect(wrong.body.message).toMatch(/rejected/);

    const res = await api().put("/api/payments/settings").set(bearer(owner)).send(settingsBody);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      provider: "paytm",
      enabled: true,
      paytm: { mid: MID, website: "WEBSTAGING", environment: "staging", hasKey: true },
    });
    expect(JSON.stringify(res.body)).not.toContain(KEY);
    const stored = await PaymentGateway.findOne({ restaurantId: world.restaurantId }).lean();
    expect(stored!.paytmKeyEnc).toBeTruthy();
    expect(stored!.paytmKeyEnc).not.toContain(KEY);

    const short = await api().put("/api/payments/settings").set(bearer(owner)).send({ paytmKey: "tooshort" });
    expect(short.status).toBe(400);
    // Saving something else keeps the key.
    const again = await api().put("/api/payments/settings").set(bearer(owner)).send({ paytmWebsite: "WEBSTAGING" });
    expect(again.body.paytm.hasKey).toBe(true);
  });
});

describe("paying with Paytm", () => {
  it("opens a checkout with a signed request, and settles only on what Paytm itself reports", async () => {
    const seat = await guestWithDosa(1);
    const checkout = await api().post(`/api/payments/orders/${seat.orderId}/checkout`).set(bearer(seat.token));
    expect(checkout.status).toBe(201);
    expect(checkout.body).toMatchObject({ provider: "paytm", mid: MID, host: STAGING, currency: "INR" });
    expect(checkout.body.txnToken).toBe(`token-${checkout.body.gatewayOrderId}`);
    expect(calls[0].body).toMatchObject({
      requestType: "Payment",
      mid: MID,
      websiteName: "WEBSTAGING",
      orderId: checkout.body.gatewayOrderId,
    });
    expect((calls[0].body.txnAmount as { value: string }).value).toBe((checkout.body.amount / 100).toFixed(2));
    expect(await PaymentAttempt.findOne({ gatewayOrderId: checkout.body.gatewayOrderId })).toMatchObject({
      provider: "paytm",
      status: "created",
    });

    const id = checkout.body.gatewayOrderId as string;
    const confirm = () => api().post("/api/payments/paytm/confirm").set(bearer(seat.token)).send({ orderId: id });
    const amount = (checkout.body.amount / 100).toFixed(2);

    // Nothing is believed before Paytm says so.
    expect((await confirm()).status).toBe(409);
    statuses.set(id, { resultStatus: "PENDING" });
    expect((await confirm()).status).toBe(409);
    statuses.set(id, { resultStatus: "TXN_FAILURE", resultMsg: "Insufficient funds" });
    const failed = await confirm();
    expect(failed.status).toBe(409);
    expect(failed.body.message).toMatch(/Insufficient funds/);
    statuses.set(id, { resultStatus: "TXN_SUCCESS", txnId: "TXN1", txnAmount: "1.00", paymentMode: "UPI" });
    expect((await confirm()).status).toBe(400); // the amount does not match
    expect((await Order.findById(seat.orderId).lean())!.status).not.toBe("closed");

    statuses.set(id, { resultStatus: "TXN_SUCCESS", txnId: "TXN1", txnAmount: amount, paymentMode: "UPI" });
    const ok = await confirm();
    expect(ok.body).toEqual({ status: "paid" });
    const order = await Order.findById(seat.orderId).lean();
    expect(order).toMatchObject({ status: "closed", paymentMethod: "online" });
    expect(order!.payments[0]).toMatchObject({ method: "online", reference: "TXN1", receivedByName: "Paytm" });
    // A repeated confirmation changes nothing.
    expect((await confirm()).body).toEqual({ status: "paid" });
    expect((await Order.findById(seat.orderId).lean())!.payments).toHaveLength(1);
  });

  it("settles from Paytm's notice when the browser never comes back, and ignores a made-up one", async () => {
    const seat = await guestWithDosa(2);
    const checkout = await api().post(`/api/payments/orders/${seat.orderId}/checkout`).set(bearer(seat.token));
    const id = checkout.body.gatewayOrderId as string;

    // A notice for a payment Paytm does not know about settles nothing.
    const fake = await api().post("/api/payments/paytm/webhook").type("form").send({ ORDERID: id, STATUS: "TXN_SUCCESS" });
    expect(fake.status).toBe(200);
    expect((await Order.findById(seat.orderId).lean())!.status).not.toBe("closed");

    statuses.set(id, { resultStatus: "TXN_SUCCESS", txnId: "TXN2", txnAmount: (checkout.body.amount / 100).toFixed(2), paymentMode: "CC" });
    const real = await api().post("/api/payments/paytm/webhook").type("form").send({ ORDERID: id, STATUS: "TXN_SUCCESS" });
    expect(real.body).toEqual({ status: "paid" });
    expect((await Order.findById(seat.orderId).lean())!.payments[0]).toMatchObject({ reference: "TXN2", receivedByName: "Paytm" });
    expect((await api().post("/api/payments/paytm/webhook").send({})).body).toEqual({ status: "ignored" });
  });

  it("flags a payment for a bill that changed, and keeps Razorpay and Paytm apart", async () => {
    const seat = await guestWithDosa(3);
    const checkout = await api().post(`/api/payments/orders/${seat.orderId}/checkout`).set(bearer(seat.token));
    await api()
      .post(`/api/orders/${seat.orderId}/items`)
      .set(bearer(seat.token))
      .send({ items: [{ foodItemId: world.food.vada, quantity: 1 }] });
    statuses.set(checkout.body.gatewayOrderId, {
      resultStatus: "TXN_SUCCESS",
      txnId: "TXN3",
      txnAmount: (checkout.body.amount / 100).toFixed(2),
      paymentMode: "UPI",
    });
    const res = await api().post("/api/payments/paytm/confirm").set(bearer(seat.token)).send({ orderId: checkout.body.gatewayOrderId });
    expect(res.body).toEqual({ status: "mismatch" });
    const attention = await api().get("/api/payments/attention").set(bearer(owner));
    expect(attention.body.some((a: { paymentId?: string }) => a.paymentId === "TXN3")).toBe(true);

    // Razorpay's endpoint refuses while Paytm is the chosen provider.
    const razorpay = await api()
      .post("/api/payments/razorpay/confirm")
      .set(bearer(seat.token))
      .send({ razorpay_order_id: "order_1", razorpay_payment_id: "pay_1", razorpay_signature: "x" });
    expect([404, 409]).toContain(razorpay.status);
  });
});
