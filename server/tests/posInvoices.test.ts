import { Types } from "mongoose";
import { beforeAll, describe, expect, it } from "vitest";

import PrintJob from "../src/models/PrintJob";
import { api, bearer, createWorld, loginAdmin, World } from "./fixtures";

let world: World;
let owner: string;
let agentId: string;

beforeAll(async () => {
  world = await createWorld();
  owner = await loginAdmin();
});

const posOrder = (body: object) => api().post("/api/pos/orders").set(bearer(owner)).send(body);
const today = async () => (await api().get("/api/pos/today").set(bearer(owner))).body;
const row = async (id: string) => (await today()).orders.find((o: { _id: string }) => o._id === id);

/** A takeaway that went to the kitchen and was paid in cash, so it has an invoice. */
async function paidTakeaway(name: string) {
  const res = await posOrder({
    orderType: "takeaway",
    customerName: name,
    customerPhone: "9876543210",
    items: [{ foodItemId: world.food.dosa, quantity: 1 }],
  });
  expect(res.status).toBe(201);
  const id = res.body.order._id as string;
  const paid = await api().patch(`/api/orders/${id}/pay`).set(bearer(owner)).send({ paymentMethod: "cash" });
  expect(paid.status).toBe(200);
  return id;
}

describe("today's orders in the cashier section", () => {
  it("lists every order of the day with its invoice, whether it was printed, and how far its dishes got", async () => {
    const paid = await paidTakeaway("Asha");
    const running = await posOrder({ orderType: "takeaway", sendToKitchen: false, items: [{ foodItemId: world.food.vada, quantity: 1 }] });

    const list = await today();
    const found = list.orders.find((o: { _id: string }) => o._id === paid);
    expect(found).toMatchObject({
      customerName: "Asha",
      status: "closed",
      total: 126,
      paymentMethod: "cash",
      hasPhone: true,
      invoicePrintedAt: null,
      invoicePrintCount: 0,
      invoiceNumber: expect.any(String),
      lastKotRound: 1,
      items: { total: 1, unsent: 0 },
    });
    // A running order is in the list too: no invoice yet, and its dish has not gone to the kitchen.
    const open = list.orders.find((o: { _id: string }) => o._id === running.body.order._id);
    expect(open).toMatchObject({ status: "open", invoiceNumber: null, total: 60, lastKotRound: null, items: { total: 1, unsent: 1 } });
    // Only an order with an invoice can be "not printed".
    expect(list.notPrinted).toBe(list.orders.filter((o: { invoiceNumber: string | null; status: string; invoicePrintedAt: unknown }) => o.invoiceNumber && !o.invoicePrintedAt && o.status !== "open" && o.status !== "cancelled").length);
  });

  it("shows the KOT token and each dish with what was chosen for it", async () => {
    const res = await posOrder({
      orderType: "takeaway",
      customerName: "Esha",
      items: [
        {
          foodItemId: world.food.coffee,
          quantity: 2,
          isJain: true,
          isPacked: true,
          note: "Less spicy · no sugar",
          modifiers: [{ groupName: "Size", label: "Large" }],
        },
        { foodItemId: world.food.vada, quantity: 1 },
      ],
    });
    expect(res.status).toBe(201);
    const found = await row(res.body.order._id);
    expect(found.tokens).toEqual([expect.any(Number)]);
    const coffee = found.lines.find((l: { name: string }) => l.name === "Filter Coffee");
    expect(coffee).toMatchObject({
      quantity: 2,
      jain: true,
      pack: true,
      options: ["Large"],
      note: "Less spicy · no sugar",
      sent: true,
      token: found.tokens[0],
      status: "pending",
    });
    expect(found.lines.find((l: { name: string }) => l.name === "Medu Vada")).toMatchObject({ jain: false, pack: false, options: [], note: "" });
  });

  it("keeps a cancelled dish in the list, counted and crossed out, and shows the dishes of a cancelled order", async () => {
    const res = await posOrder({
      orderType: "takeaway",
      sendToKitchen: false,
      items: [
        { foodItemId: world.food.dosa, quantity: 1 },
        { foodItemId: world.food.vada, quantity: 2 },
      ],
    });
    const id = res.body.order._id as string;
    const detail = await api().get(`/api/orders/${id}`).set(bearer(owner));
    const vada = detail.body.items.find((i: { foodName: string }) => i.foodName === "Medu Vada");
    await api().patch(`/api/orders/items/${vada._id}/cancel`).set(bearer(owner)).send({});

    const found = await row(id);
    expect(found.items).toMatchObject({ total: 1, cancelled: 2 });
    expect(found.lines.map((l: { name: string; status: string }) => [l.name, l.status])).toEqual([
      ["Masala Dosa", "pending"],
      ["Medu Vada", "cancelled"],
    ]);

    await api().patch(`/api/orders/${id}/cancel`).set(bearer(owner)).send({});
    const gone = await row(id);
    expect(gone.status).toBe("cancelled");
    expect(gone.lines).toHaveLength(2);
    expect(gone.items.cancelled).toBeGreaterThanOrEqual(2);
  });

  it("shows the state of the table and of an order that was cancelled", async () => {
    const seated = await posOrder({
      orderType: "dine-in",
      tableId: world.tableIds[0],
      sendToKitchen: false,
      items: [{ foodItemId: world.food.dosa, quantity: 1 }],
    });
    expect(seated.status).toBe(201);
    const withTable = await row(seated.body.order._id);
    expect(withTable).toMatchObject({ status: "open", tableStatus: "occupied", tableCode: expect.any(String) });

    const cancelled = await posOrder({ orderType: "takeaway", sendToKitchen: false, items: [{ foodItemId: world.food.vada, quantity: 1 }] });
    await api().patch(`/api/orders/${cancelled.body.order._id}/cancel`).set(bearer(owner)).send({});
    expect(await row(cancelled.body.order._id)).toMatchObject({ status: "cancelled", tableStatus: null });
  });

  it("is for staff with Orders access only", async () => {
    expect((await api().get("/api/pos/today")).status).toBe(401);
  });
});

describe("printing the KOT and the invoice as two slips", () => {
  it("says there is no printer, and refuses an order that has no invoice yet", async () => {
    const id = await paidTakeaway("Bala");
    const none = await api().post(`/api/pos/orders/${id}/print-both`).set(bearer(owner));
    expect(none.status).toBe(409);
    expect(none.body.message).toBe("No printer is set up for these slips");
    expect((await row(id)).invoicePrintCount).toBe(0);

    const open = await posOrder({ orderType: "takeaway", sendToKitchen: false, items: [{ foodItemId: world.food.vada, quantity: 1 }] });
    const early = await api().post(`/api/pos/orders/${open.body.order._id}/print-both`).set(bearer(owner));
    expect(early.status).toBe(409);
    expect(early.body.message).toMatch(/Generate the bill first/);
  });

  it("queues one KOT slip per round and one invoice slip, each its own print job", async () => {
    const created = await api().post("/api/printing/agents").set(bearer(owner)).send({ name: "Counter PC" });
    agentId = created.body.agentId;
    const printer = await api()
      .post("/api/printing/printers")
      .set(bearer(owner))
      .send({
        name: "Counter",
        agentId,
        connection: { type: "network", host: "127.0.0.1", port: 9100 },
        printsBills: true,
        printsUnroutedKots: true,
      });
    expect(printer.status).toBe(201);

    const id = await paidTakeaway("Chitra");
    await PrintJob.deleteMany({ orderId: id });
    const res = await api().post(`/api/pos/orders/${id}/print-both`).set(bearer(owner));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ kots: 1, invoices: 1, rounds: 1 });

    const jobs = await PrintJob.find({ orderId: id }).lean();
    expect(jobs.map((j) => j.kind).sort()).toEqual(["bill", "kot"]);
    expect(new Set(jobs.map((j) => String(j._id))).size).toBe(2);
    const found = await row(id);
    expect(found.invoicePrintCount).toBe(1);
    expect(found.invoicePrintedAt).toBeTruthy();
  });

  it("does not print the KOT twice when it was sent to the kitchen a moment ago", async () => {
    const id = await paidTakeaway("Esha");
    // The KOT came out when the order was sent; KOT + invoice right after must only add the invoice.
    const first = await PrintJob.countDocuments({ orderId: id, kind: "kot" });
    expect(first).toBe(1);
    const res = await api().post(`/api/pos/orders/${id}/print-both`).set(bearer(owner));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ kots: 1, rounds: 1 });
    expect(await PrintJob.countDocuments({ orderId: id, kind: "kot" })).toBe(1);

    // A reprint later (after a minute) prints the KOT again.
    const aged = await PrintJob.collection.updateMany({ orderId: new Types.ObjectId(id), kind: "kot" }, { $set: { createdAt: new Date(Date.now() - 5 * 60_000) } });
    expect(aged.modifiedCount).toBe(1);
    await api().post(`/api/pos/orders/${id}/print-both`).set(bearer(owner));
    expect(await PrintJob.countDocuments({ orderId: id, kind: "kot" })).toBe(2);
  });

  it("counts an invoice opened as a PDF, and a bill sent from the order page, as printed", async () => {
    const id = await paidTakeaway("Dev");
    expect((await row(id)).invoicePrintedAt).toBeNull();
    // The order the panel loads says whether its invoice was printed (the cashier shows Print invoice only if not).
    const before = await api().get(`/api/orders/${id}`).set(bearer(owner));
    expect(before.body.order.invoicePrintedAt ?? null).toBeNull();
    const noted = await api().post(`/api/pos/orders/${id}/invoice-printed`).set(bearer(owner));
    expect(noted.status).toBe(200);
    expect((await row(id)).invoicePrintCount).toBe(1);
    const after = await api().get(`/api/orders/${id}`).set(bearer(owner));
    expect(after.body.order.invoicePrintedAt).toBeTruthy();
    expect(after.body.order.invoicePrintCount).toBe(1);

    const viaOrders = await api().post(`/api/orders/${id}/bill/print`).set(bearer(owner));
    expect(viaOrders.status).toBe(200);
    expect((await row(id)).invoicePrintCount).toBe(2);
  });

  it("will not mark an order that has no invoice", async () => {
    const open = await posOrder({ orderType: "takeaway", sendToKitchen: false, items: [{ foodItemId: world.food.vada, quantity: 1 }] });
    const res = await api().post(`/api/pos/orders/${open.body.order._id}/invoice-printed`).set(bearer(owner));
    expect(res.status).toBe(409);
  });
});
