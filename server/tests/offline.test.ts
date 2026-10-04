import { beforeAll, describe, expect, it } from "vitest";

import Order from "../src/models/Order";
import OrderItem from "../src/models/OrderItem";
import PrintJob from "../src/models/PrintJob";
import TableModel from "../src/models/Table";
import { api, bearer, createWorld, loginAdmin, World } from "./fixtures";

let world: World;
let owner: string;

beforeAll(async () => {
  world = await createWorld();
  owner = await loginAdmin();
  const agent = await api().post("/api/printing/agents").set(bearer(owner)).send({ name: "Counter PC" });
  await api()
    .post("/api/printing/printers")
    .set(bearer(owner))
    .send({
      name: "Counter",
      agentId: agent.body.agentId,
      connection: { type: "network", host: "127.0.0.1", port: 9100 },
      printsUnroutedKots: true,
    })
    .expect(201);
});

const sync = (body: object) => api().post("/api/pos/offline-orders").set(bearer(owner)).send(body);

const coffeeLine = (quantity: number) => ({ foodItemId: world.food.coffee, quantity });

describe("offline POS sync", () => {
  it("creates, bills and settles an offline takeaway sale once, without printing", async () => {
    const createdAt = new Date(Date.now() - 20 * 60_000).toISOString();
    const body = {
      clientId: "off-takeaway-0001",
      createdAt,
      orderType: "takeaway",
      customerName: "Asha",
      items: [coffeeLine(2)],
      clientTotal: 210,
      payments: [{ method: "cash", amount: 210, tendered: 500 }],
    };
    const res = await sync(body);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: "closed", grandTotal: 210, clientTotal: 210, mismatch: false });
    expect(res.body.invoiceNumber).toMatch(/\/\d{6}$/);

    const order = await Order.findById(res.body.orderId).lean();
    expect(order?.offline).toMatchObject({ clientId: "off-takeaway-0001", clientTotal: 210 });
    expect(order?.checkinTime.toISOString()).toBe(createdAt);
    expect(order?.payments[0]).toMatchObject({ method: "cash", amount: 210, change: 290 });

    const items = await OrderItem.find({ orderId: res.body.orderId }).lean();
    expect(items.every((i) => i.status === "served" && i.kotRound === 1)).toBe(true);
    expect(await PrintJob.countDocuments({ orderId: res.body.orderId })).toBe(0);

    const again = await sync(body);
    expect(again.status).toBe(201);
    expect(again.body.orderId).toBe(res.body.orderId);
    expect(await Order.countDocuments({ "offline.clientId": "off-takeaway-0001" })).toBe(1);
  });

  it("leaves a dine-in bill unpaid and flagged when the totals differ", async () => {
    const tableId = world.tableIds[1];
    const res = await sync({
      clientId: "off-dinein-0002",
      createdAt: new Date().toISOString(),
      orderType: "dine-in",
      tableId,
      items: [coffeeLine(1)],
      clientTotal: 99,
      payments: [{ method: "upi", amount: 99 }],
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: "billed", grandTotal: 105, clientTotal: 99, mismatch: true });
    expect(res.body.note).toBe("Offline bill was ₹99.00, the server bill is ₹105.00. Settle it from Orders.");
    expect((await TableModel.findById(tableId).lean())?.status).toBe("awaiting_payment");

    const settle = await api()
      .patch(`/api/orders/${res.body.orderId}/pay`)
      .set(bearer(owner))
      .send({ paymentMethod: "upi" });
    expect(settle.status).toBe(200);
    expect((await TableModel.findById(tableId).lean())?.status).toBe("available");
  });

  it("joins an occupied table and keeps a billed order unpaid when no payment was taken", async () => {
    const tableId = world.tableIds[2];
    await api()
      .post("/api/pos/orders")
      .set(bearer(owner))
      .send({ orderType: "dine-in", tableId, items: [coffeeLine(1)] })
      .expect(201);
    const res = await sync({
      clientId: "off-dinein-0003",
      createdAt: new Date().toISOString(),
      orderType: "dine-in",
      tableId,
      items: [{ foodItemId: world.food.vada, quantity: 1 }],
      clientTotal: 63,
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: "billed", grandTotal: 63, mismatch: false });
    expect(await Order.countDocuments({ tableId, status: { $in: ["open", "billed"] } })).toBe(2);
  });

  it("rejects dishes that are off the menu and bad input", async () => {
    const hidden = await sync({
      clientId: "off-hidden-0004",
      createdAt: new Date().toISOString(),
      orderType: "takeaway",
      items: [{ foodItemId: world.food.hidden, quantity: 1 }],
      clientTotal: 210,
    });
    expect(hidden.status).toBe(409);
    expect(hidden.body.message).toBe(
      "A dish on this offline bill is no longer on the menu. Turn it back on, then sync again."
    );
    expect(await Order.countDocuments({ "offline.clientId": "off-hidden-0004" })).toBe(0);

    const bad = await sync({ clientId: "x", createdAt: "soon", orderType: "takeaway", items: [], clientTotal: 0 });
    expect(bad.status).toBe(400);
  });
});
