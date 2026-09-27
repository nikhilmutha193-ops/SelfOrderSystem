import { Server as HttpServer } from "http";
import { AddressInfo, createServer, Server } from "net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AgentConfig, pair, pollOnce } from "../../print-agent/agent";
import app from "../src/app";
import Category from "../src/models/Category";
import FoodItem from "../src/models/FoodItem";
import Order from "../src/models/Order";
import OrderItem from "../src/models/OrderItem";
import PrintJob from "../src/models/PrintJob";
import { api, bearer, counterOrder, createWorld, loginAdmin, loginChef, seatTable, World } from "./fixtures";

interface FakePrinter {
  server: Server;
  port: number;
  received: Buffer[];
}

let world: World;
let owner: string;
let http: HttpServer;
let agent: AgentConfig;
let agentId: string;
let kitchenPrinter: FakePrinter;
let barPrinter: FakePrinter;
const stations: Record<string, string> = {};
const printers: Record<string, string> = {};

function fakePrinter(): Promise<FakePrinter> {
  const received: Buffer[] = [];
  const server = createServer((socket) => {
    const chunks: Buffer[] = [];
    socket.on("data", (chunk) => chunks.push(chunk));
    socket.on("end", () => received.push(Buffer.concat(chunks)));
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve({ server, port: (server.address() as AddressInfo).port, received }))
  );
}

const printed = (printer: FakePrinter) => printer.received.map((b) => b.toString("latin1")).join("\n---\n");
const waitForPrints = async (printer: FakePrinter, count: number) => {
  for (let i = 0; i < 50 && printer.received.length < count; i++) await new Promise((r) => setTimeout(r, 20));
};
const setSettings = (body: object) => api().put("/api/restaurant/settings").set(bearer(owner)).send(body);

beforeAll(async () => {
  world = await createWorld();
  owner = await loginAdmin();
  http = app.listen(0, "127.0.0.1");
  kitchenPrinter = await fakePrinter();
  barPrinter = await fakePrinter();
});

afterAll(async () => {
  http.close();
  kitchenPrinter.server.close();
  barPrinter.server.close();
});

describe("print computers", () => {
  it("pairs a computer once with its code and rejects unknown tokens", async () => {
    const created = await api().post("/api/printing/agents").set(bearer(owner)).send({ name: "Counter PC" });
    expect(created.status).toBe(201);
    expect(created.body.pairingCode).toMatch(/^[A-Z2-9]{8}$/);
    agentId = created.body.agentId;

    const wrong = await api().post("/api/print-agent/pair").send({ code: "ZZZZ2222" });
    expect(wrong.status).toBe(404);
    expect(wrong.body.message).toBe("That pairing code is wrong or has expired");

    const server = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
    agent = await pair(server, created.body.pairingCode.toLowerCase());
    expect(agent).toMatchObject({ name: "Counter PC", restaurantName: "Test Kaffi" });

    const reused = await api().post("/api/print-agent/pair").send({ code: created.body.pairingCode });
    expect(reused.status).toBe(404);

    const stranger = await api().get("/api/print-agent/jobs").set({ Authorization: "Agent not-a-real-token" });
    expect(stranger.status).toBe(401);

    const listed = await api().get("/api/printing/agents").set(bearer(owner));
    expect(listed.body[0]).toMatchObject({ name: "Counter PC", paired: true });
    expect(listed.body[0].tokenHash).toBeUndefined();
    expect(listed.body[0].pairingCodeHash).toBeUndefined();
  });

  it("keeps printing setup to admins with the printing permission", async () => {
    const manager = await loginAdmin("manager", "Manager@123");
    expect((await api().get("/api/printing/printers").set(bearer(manager))).status).toBe(403);
    const chef = await loginChef();
    expect((await api().get("/api/printing/printers").set(bearer(chef))).status).toBe(403);
  });
});

describe("routing KOTs by station", () => {
  it("returns a clear error when no printer is set up", async () => {
    const orderId = await counterOrder(owner, [{ foodItemId: world.food.vada, quantity: 1 }]);
    const reprint = await api().post(`/api/orders/${orderId}/kot/1/reprint`).set(bearer(owner));
    expect(reprint.status).toBe(409);
    expect(reprint.body.message).toBe("No printer is set up for this ticket");
  });

  it("splits one KOT across station printers and sends unrouted items to the fallback printer", async () => {
    for (const name of ["Hot Kitchen", "Bar", "Tandoor"]) {
      const res = await api().post("/api/printing/stations").set(bearer(owner)).send({ name });
      expect(res.status).toBe(201);
      stations[name] = res.body._id;
    }
    const duplicate = await api().post("/api/printing/stations").set(bearer(owner)).send({ name: "Bar" });
    expect(duplicate.status).toBe(409);

    const category = await Category.findOne({ restaurantId: world.restaurantId });
    await Category.updateOne({ _id: category!._id }, { defaultStationId: stations["Hot Kitchen"] });
    await FoodItem.updateOne({ _id: world.food.coffee }, { stationId: stations.Bar });
    await FoodItem.updateOne({ _id: world.food.vada }, { stationId: stations.Tandoor });

    const kitchen = await api()
      .post("/api/printing/printers")
      .set(bearer(owner))
      .send({
        name: "Kitchen",
        agentId,
        connection: { type: "network", host: "127.0.0.1", port: kitchenPrinter.port },
        stationIds: [stations["Hot Kitchen"]],
      });
    expect(kitchen.status).toBe(201);
    printers.kitchen = kitchen.body._id;
    const bar = await api()
      .post("/api/printing/printers")
      .set(bearer(owner))
      .send({
        name: "Bar & Counter",
        agentId,
        connection: { type: "network", host: "127.0.0.1", port: barPrinter.port },
        paperWidth: 58,
        stationIds: [stations.Bar],
        printsUnroutedKots: true,
        printsBills: true,
      });
    expect(bar.status).toBe(201);
    printers.bar = bar.body._id;

    const orderId = await counterOrder(owner, [
      { foodItemId: world.food.dosa, quantity: 2 },
      { foodItemId: world.food.coffee, quantity: 1 },
      { foodItemId: world.food.vada, quantity: 3 },
    ]);
    const items = await OrderItem.find({ orderId }).lean();
    const stationOf = (foodItemId: string) =>
      items.find((i) => i.foodItemId?.toString() === foodItemId)?.stationId?.toString();
    expect(stationOf(world.food.dosa)).toBe(stations["Hot Kitchen"]);
    expect(stationOf(world.food.coffee)).toBe(stations.Bar);
    expect(stationOf(world.food.vada)).toBe(stations.Tandoor);

    const jobs = await PrintJob.find({ orderId, kind: "kot" }).lean();
    expect(jobs.filter((j) => j.printerId.toString() === printers.kitchen)).toHaveLength(1);
    expect(jobs.filter((j) => j.printerId.toString() === printers.bar)).toHaveLength(2);

    const results = await pollOnce(agent);
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.ok)).toBe(true);
    await waitForPrints(kitchenPrinter, 1);
    await waitForPrints(barPrinter, 2);

    expect(printed(kitchenPrinter)).toContain("HOT KITCHEN");
    expect(printed(kitchenPrinter)).toContain("Masala Dosa");
    expect(printed(kitchenPrinter)).not.toContain("Filter Coffee");
    expect(printed(barPrinter)).toContain("Filter Coffee");
    expect(printed(barPrinter)).toContain("Medu Vada");
    expect(printed(barPrinter)).not.toContain("Masala Dosa");

    const done = await PrintJob.find({ orderId }).lean();
    expect(done.every((j) => j.status === "printed")).toBe(true);
  });

  it("reprints a round through the printers and marks it as a reprint", async () => {
    const order = await Order.findOne({ restaurantId: world.restaurantId }).sort({ createdAt: -1 });
    const res = await api().post(`/api/orders/${order!._id}/kot/1/reprint`).set(bearer(owner));
    expect(res.status).toBe(200);
    expect(res.body.queued).toBe(3);
    await pollOnce(agent);
    await waitForPrints(kitchenPrinter, 2);
    expect(kitchenPrinter.received[1].toString("latin1")).toContain("*** REPRINT ***");
  });

  it("filters the kitchen queue by station and remembers a chef's station", async () => {
    const all = await api().get("/api/orders/kot/queue").set(bearer(owner));
    const bar = await api().get(`/api/orders/kot/queue?stationId=${stations.Bar}`).set(bearer(owner));
    const names = (groups: { items: { foodName: string }[] }[]) =>
      groups.flatMap((g) => g.items.map((i) => i.foodName));
    expect(names(all.body)).toContain("Masala Dosa");
    expect(names(bar.body)).toEqual(["Filter Coffee"]);

    const set = await api()
      .put(`/api/printing/chefs/${world.chefId}/station`)
      .set(bearer(owner))
      .send({ stationId: stations.Bar });
    expect(set.status).toBe(200);
    const chef = await loginChef();
    const mine = await api().get("/api/printing/my-station").set(bearer(chef));
    expect(mine.body.stationId).toBe(stations.Bar);
    expect(mine.body.stations).toHaveLength(3);
  });
});

describe("guest orders and the kitchen", () => {
  it("waits for staff in accept mode and sets the ready-by time only when the KOT is sent", async () => {
    const seat = await seatTable(1);
    await api()
      .post(`/api/orders/${seat.orderId}/items`)
      .set(bearer(seat.token))
      .send({ items: [{ foodItemId: world.food.dosa, quantity: 1 }] });
    expect((await OrderItem.findOne({ orderId: seat.orderId }))!.kotRound).toBeNull();
    expect((await Order.findById(seat.orderId))!.estimatedReadyAt ?? null).toBeNull();
    const detail = await api().get(`/api/orders/${seat.orderId}`).set(bearer(seat.token));
    expect(detail.body.guestOrderMode).toBe("accept");

    await api().post(`/api/orders/${seat.orderId}/kot/print`).set(bearer(owner));
    const estimate = (await Order.findById(seat.orderId))!.estimatedReadyAt!;
    const minutes = (estimate.getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(12);
    expect(minutes).toBeLessThan(15);
    await pollOnce(agent);
  });

  it("sends guest items to the kitchen by itself in auto mode", async () => {
    const bad = await setSettings({ kotSettings: { guestOrderMode: "sometimes" } });
    expect(bad.status).toBe(400);
    expect((await setSettings({ kotSettings: { guestOrderMode: "auto" } })).status).toBe(200);

    const seat = await seatTable(2);
    await api()
      .post(`/api/orders/${seat.orderId}/items`)
      .set(bearer(seat.token))
      .send({ items: [{ foodItemId: world.food.coffee, quantity: 2 }] });
    const item = await OrderItem.findOne({ orderId: seat.orderId });
    expect(item!.kotRound).toBe(1);
    expect(item!.tokenNumber).toEqual(expect.any(Number));
    expect((await Order.findById(seat.orderId))!.estimatedReadyAt).toBeInstanceOf(Date);
    expect(await PrintJob.countDocuments({ orderId: seat.orderId, kind: "kot" })).toBe(1);

    const staffOrder = await counterOrder(owner, [{ foodItemId: world.food.vada, quantity: 1 }], "Counter", {
      sendToKitchen: false,
    });
    expect((await OrderItem.findOne({ orderId: staffOrder }))!.kotRound).toBeNull();
    await pollOnce(agent);
  });
});

describe("bills and retries", () => {
  it("prints a bill on request and automatically when switched on", async () => {
    const orderId = await counterOrder(owner, [{ foodItemId: world.food.dosa, quantity: 1 }], "Bill test");
    await api().post(`/api/orders/${orderId}/bill`).set(bearer(owner)).send({});
    expect(await PrintJob.countDocuments({ orderId, kind: "bill" })).toBe(0);

    const res = await api().post(`/api/orders/${orderId}/bill/print`).set(bearer(owner));
    expect(res.status).toBe(200);
    expect(res.body.queued).toBe(1);
    const before = barPrinter.received.length;
    await pollOnce(agent);
    await waitForPrints(barPrinter, before + 1);
    const bill = barPrinter.received.map((b) => b.toString("latin1")).find((t) => t.includes("Bill test"));
    expect(bill).toBeDefined();
    expect(bill).toContain("Rs.");

    expect((await setSettings({ invoiceSettings: { autoPrintBill: "yes" } })).status).toBe(400);
    expect((await setSettings({ invoiceSettings: { autoPrintBill: true } })).status).toBe(200);
    const second = await counterOrder(owner, [{ foodItemId: world.food.coffee, quantity: 1 }], "Auto bill");
    await api().post(`/api/orders/${second}/bill`).set(bearer(owner)).send({});
    expect(await PrintJob.countDocuments({ orderId: second, kind: "bill" })).toBe(1);
    await pollOnce(agent);
  });

  it("opens the cash drawer only on a paid bill that took cash", async () => {
    const orderId = await counterOrder(owner, [{ foodItemId: world.food.vada, quantity: 2 }], "Drawer test");
    await api().post(`/api/orders/${orderId}/bill`).set(bearer(owner)).send({});
    await api().post(`/api/orders/${orderId}/bill/print`).set(bearer(owner));
    await api().patch(`/api/orders/${orderId}/pay`).set(bearer(owner)).send({ paymentMethod: "cash" });
    await api().post(`/api/orders/${orderId}/bill/print`).set(bearer(owner));
    const jobs = await PrintJob.find({ orderId, kind: "bill" }).sort({ createdAt: 1 }).lean();
    const kick = Buffer.from([0x1b, 0x70, 0x00]);
    expect(jobs).toHaveLength(3);
    expect(jobs.map((job) => Buffer.from(job.data, "base64").includes(kick))).toEqual([false, false, true]);
    await pollOnce(agent);
  });

  it("says so when no printer prints bills", async () => {
    await api()
      .put(`/api/printing/printers/${printers.bar}`)
      .set(bearer(owner))
      .send({
        name: "Bar & Counter",
        agentId,
        connection: { type: "network", host: "127.0.0.1", port: barPrinter.port },
        stationIds: [stations.Bar],
        printsUnroutedKots: true,
        printsBills: false,
      });
    const orderId = await counterOrder(owner, [{ foodItemId: world.food.vada, quantity: 1 }]);
    const res = await api().post(`/api/orders/${orderId}/bill/print`).set(bearer(owner));
    expect(res.status).toBe(409);
    expect(res.body.message).toBe("No printer is set up to print bills");
    await pollOnce(agent);
  });

  it("retries a failed job three times, then waits for someone to retry it", async () => {
    const test = await api().post(`/api/printing/printers/${printers.kitchen}/test`).set(bearer(owner));
    expect(test.status).toBe(200);
    const broken = async () => {
      throw new Error("Paper out");
    };
    for (let i = 0; i < 3; i++) {
      const results = await pollOnce(agent, broken);
      expect(results).toEqual([expect.objectContaining({ ok: false, error: "Paper out" })]);
    }
    expect(await pollOnce(agent, broken)).toEqual([]);

    const failed = await api().get("/api/printing/jobs?status=failed").set(bearer(owner));
    expect(failed.body).toHaveLength(1);
    expect(failed.body[0]).toMatchObject({ kind: "test", attempts: 3, lastError: "Paper out", printerName: "Kitchen" });
    expect(failed.body[0].data).toBeUndefined();

    const status = await api().get("/api/printing/status").set(bearer(owner));
    expect(status.body).toMatchObject({ printersConfigured: true, agentsOnline: 1, failedToday: 1 });

    await api().post(`/api/printing/jobs/${failed.body[0]._id}/retry`).set(bearer(owner));
    const results = await pollOnce(agent);
    expect(results).toEqual([expect.objectContaining({ ok: true })]);
    await waitForPrints(kitchenPrinter, 3);
    expect(printed(kitchenPrinter)).toContain("TEST PRINT");
  });

  it("stops a removed computer from reading jobs", async () => {
    await api().delete(`/api/printing/agents/${agentId}`).set(bearer(owner));
    await expect(pollOnce(agent)).rejects.toThrow("This print computer was removed or needs to be paired again");
  });
});
