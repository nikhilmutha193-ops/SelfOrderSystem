import { beforeAll, describe, expect, it } from "vitest";

import PrintJob from "../src/models/PrintJob";
import Restaurant from "../src/models/Restaurant";
import { decodeEscPos } from "../src/utils/escposPreview";
import { api, bearer, createWorld, loginAdmin, seatTable, World } from "./fixtures";

let world: World;
let owner: string;

beforeAll(async () => {
  world = await createWorld();
  owner = await loginAdmin();
});

describe("complimentary dishes in a new order", () => {
  it("lets staff add a dish as complimentary: it costs nothing and its value is kept", async () => {
    const res = await api()
      .post("/api/pos/orders")
      .set(bearer(owner))
      .send({
        orderType: "takeaway",
        sendToKitchen: false,
        items: [
          { foodItemId: world.food.dosa, quantity: 1 },
          { foodItemId: world.food.vada, quantity: 1, complimentary: true, complimentaryReason: "Birthday treat" },
          { foodItemId: world.food.vada, quantity: 2 },
        ],
      });
    expect(res.status).toBe(201);
    const [paid, free, rest] = res.body.items;
    expect(paid).toMatchObject({ complimentary: false });
    expect(paid.total).toBeGreaterThan(0);
    expect(free).toMatchObject({ complimentary: true, total: 0, complimentaryReason: "Birthday treat", quantity: 1 });
    expect(free.unitPrice).toBeGreaterThan(0);
    // Of three plates, one is free and two are paid for.
    expect(rest).toMatchObject({ complimentary: false, total: free.unitPrice * 2 });

    const detail = await api().get(`/api/orders/${res.body.order._id}`).set(bearer(owner));
    expect(detail.body.totals.subtotal).toBe(paid.total + rest.total);
  });

  it("still makes the invoice PDF and the public bill for an order with a free dish", async () => {
    const res = await api()
      .post("/api/pos/orders")
      .set(bearer(owner))
      .send({
        orderType: "takeaway",
        sendToKitchen: true,
        items: [
          { foodItemId: world.food.dosa, quantity: 1 },
          { foodItemId: world.food.vada, quantity: 1, complimentary: true, complimentaryReason: "Chef's gift" },
        ],
      });
    const id = res.body.order._id as string;
    await api().patch(`/api/orders/${id}/pay`).set(bearer(owner)).send({ paymentMethod: "cash" });
    const pdf = await api().get(`/api/orders/${id}/invoice/pdf`).set(bearer(owner));
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toMatch(/pdf/);
  });

  it("allows only one plate of a dish to be free in an order", async () => {
    const two = await api()
      .post("/api/pos/orders")
      .set(bearer(owner))
      .send({
        orderType: "takeaway",
        sendToKitchen: false,
        items: [{ foodItemId: world.food.vada, quantity: 2, complimentary: true, complimentaryReason: "Regular guest" }],
      });
    expect(two.status).toBe(400);
    expect(two.body.message).toMatch(/Only one .* can be complimentary/);

    const first = await api()
      .post("/api/pos/orders")
      .set(bearer(owner))
      .send({
        orderType: "takeaway",
        sendToKitchen: false,
        items: [{ foodItemId: world.food.vada, quantity: 1, complimentary: true, complimentaryReason: "Regular guest" }],
      });
    expect(first.status).toBe(201);
    const again = await api()
      .post(`/api/orders/${first.body.order._id}/items`)
      .set(bearer(owner))
      .send({ items: [{ foodItemId: world.food.vada, quantity: 1, complimentary: true, complimentaryReason: "Again" }] });
    expect(again.status).toBe(400);
  });

  it("needs a reason to make a dish complimentary, and refuses a guest who tries to get one", async () => {
    const noReason = await api()
      .post("/api/pos/orders")
      .set(bearer(owner))
      .send({
        orderType: "takeaway",
        sendToKitchen: false,
        items: [{ foodItemId: world.food.vada, quantity: 1, complimentary: true }],
      });
    expect(noReason.status).toBe(400);
    expect(noReason.body.message).toBe("A reason is required to make a dish complimentary");
    const tooShort = await api()
      .post("/api/pos/orders")
      .set(bearer(owner))
      .send({
        orderType: "takeaway",
        sendToKitchen: false,
        items: [{ foodItemId: world.food.vada, quantity: 1, complimentary: true, complimentaryReason: "  ok " }],
      });
    expect(tooShort.status).toBe(400);

    const guest = await seatTable(1);
    const refused = await api()
      .post(`/api/orders/${guest.orderId}/items`)
      .set(bearer(guest.token))
      .send({ items: [{ foodItemId: world.food.dosa, quantity: 1, complimentary: true, complimentaryReason: "Please" }] });
    expect(refused.status).toBe(403);
    expect(refused.body.message).toBe("Only staff can make a dish complimentary");
  });
});

describe("a bill where every dish is complimentary", () => {
  const free = (foodItemId: string) => ({ foodItemId, quantity: 1, complimentary: true, complimentaryReason: "Owner's guest" });

  it("is settled with a payment of zero, and in the cafe flow that sends the KOT", async () => {
    await Restaurant.updateOne({}, { $set: { serviceFlow: "cafe" } });
    try {
      const res = await api()
        .post("/api/pos/orders")
        .set(bearer(owner))
        .send({ orderType: "takeaway", sendToKitchen: false, items: [free(world.food.dosa)] });
      expect(res.status).toBe(201);
      const id = res.body.order._id as string;
      // Nothing has gone to the kitchen yet: the cafe flow sends it when the order is paid.
      expect((await api().get(`/api/orders/${id}`).set(bearer(owner))).body.items[0].kotRound).toBeNull();

      const pay = await api().patch(`/api/orders/${id}/pay`).set(bearer(owner)).send({ payments: [{ method: "cash", amount: 0 }] });
      expect(pay.status).toBe(200);
      expect(pay.body).toMatchObject({ status: "closed" });
      const after = (await api().get(`/api/orders/${id}`).set(bearer(owner))).body;
      expect(after.totals.grandTotal).toBe(0);
      expect(after.items[0].kotRound).toBe(1);
      expect(after.items[0].tokenNumber).toBeGreaterThan(0);
      expect((await api().get(`/api/orders/${id}/invoice/pdf`).set(bearer(owner))).status).toBe(200);
    } finally {
      await Restaurant.updateOne({}, { $set: { serviceFlow: "restaurant" } });
    }
  });

  it("still refuses a zero payment on a bill that has something to pay", async () => {
    const res = await api()
      .post("/api/pos/orders")
      .set(bearer(owner))
      .send({ orderType: "takeaway", items: [{ foodItemId: world.food.dosa, quantity: 1 }] });
    const id = res.body.order._id as string;
    const zero = await api().patch(`/api/orders/${id}/pay`).set(bearer(owner)).send({ payments: [{ method: "cash", amount: 0 }] });
    expect(zero.status).toBe(400);
    const split = await api()
      .patch(`/api/orders/${id}/pay`)
      .set(bearer(owner))
      .send({ payments: [{ method: "cash", amount: 0 }, { method: "upi", amount: 126, payerPhone: "9876543210" }] });
    expect(split.status).toBe(400);
    expect(split.body.message).toMatch(/more than zero/);
  });
});

describe("the payment QR on an unpaid invoice", () => {
  const billPrint = async (items: object[]) => {
    const res = await api().post("/api/pos/orders").set(bearer(owner)).send({ orderType: "takeaway", items });
    const id = res.body.order._id as string;
    expect((await api().post(`/api/orders/${id}/bill`).set(bearer(owner)).send({})).status).toBeLessThan(300);
    await PrintJob.deleteMany({ orderId: id });
    expect((await api().post(`/api/orders/${id}/bill/print`).set(bearer(owner))).status).toBe(200);
    const [job] = await PrintJob.find({ orderId: id, kind: "bill" }).lean();
    return decodeEscPos(Buffer.from(job.data, "base64"));
  };
  const text = (lines: ReturnType<typeof decodeEscPos>) =>
    lines.flatMap((l) => (l.kind === "text" ? [l.runs.map((r) => r.text).join("")] : []));

  it("prints for an amount to pay, and not when every dish is complimentary", async () => {
    await Restaurant.updateOne({}, { $set: { "billingSettings.upiVpa": "cafe@okicici" } });
    const agent = await api().post("/api/printing/agents").set(bearer(owner)).send({ name: "Counter PC" });
    await api()
      .post("/api/printing/printers")
      .set(bearer(owner))
      .send({
        name: "Counter",
        agentId: agent.body.agentId,
        connection: { type: "network", host: "127.0.0.1", port: 9100 },
        printsBills: true,
        printsUnroutedKots: true,
      });

    const normal = await billPrint([{ foodItemId: world.food.dosa, quantity: 1 }]);
    expect(text(normal).some((t) => t.startsWith("Scan to pay Rs."))).toBe(true);
    expect(normal.some((l) => l.kind === "image")).toBe(true);
    expect(text(normal).some((t) => t.includes("Amount Payable"))).toBe(true);

    const nothing = await billPrint([
      { foodItemId: world.food.vada, quantity: 1, complimentary: true, complimentaryReason: "Owner's guest" },
    ]);
    expect(text(nothing).some((t) => t.startsWith("Scan to pay"))).toBe(false);
    expect(nothing.some((l) => l.kind === "image")).toBe(false);
    expect(text(nothing).some((t) => t.includes("Grand Total"))).toBe(true);
    expect(text(nothing).some((t) => t.includes("Amount Payable"))).toBe(false);
    // The complimentary mark is on the dish's own line, not on a line of its own below it.
    expect(text(nothing).some((t) => t.includes("(Complimentary)"))).toBe(true);
    expect(text(nothing).some((t) => t.trim() === "Complimentary")).toBe(false);
  });
});
