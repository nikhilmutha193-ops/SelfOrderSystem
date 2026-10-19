import { beforeAll, describe, expect, it } from "vitest";

import Category from "../src/models/Category";
import FoodItem from "../src/models/FoodItem";
import OrderItem from "../src/models/OrderItem";
import PrintJob from "../src/models/PrintJob";
import { api, bearer, counterOrder, createWorld, decodeToken, loginAdmin, World } from "./fixtures";

let world: World;
let owner: string;

beforeAll(async () => {
  world = await createWorld({ guestOrderMode: "accept" });
  owner = await loginAdmin();
});

const setKot = (kotSettings: object) =>
  api().put("/api/restaurant/settings").set(bearer(owner)).send({ kotSettings });
const tokensOf = async (orderId: string) =>
  (await OrderItem.find({ orderId }).lean()).map((i) => i.tokenNumber);

describe("KOT token start number", () => {
  it("counts up from the number the admin sets", async () => {
    expect((await setKot({ tokenStart: 0 })).status).toBe(400);
    expect((await setKot({ tokenStart: 1.5 })).status).toBe(400);
    expect((await setKot({ tokenStart: 100 })).status).toBe(200);

    const first = await counterOrder(owner, [{ foodItemId: world.food.dosa, quantity: 1 }]);
    const second = await counterOrder(owner, [{ foodItemId: world.food.vada, quantity: 1 }]);
    expect((await tokensOf(first))[0]).toBeGreaterThanOrEqual(100);
    expect((await tokensOf(second))[0]).toBe((await tokensOf(first))[0]! + 1);

    await setKot({ tokenStart: 1 });
  });
});

describe("one ticket per category with a shared token", () => {
  it("snapshots the category on each item and splits the printed tickets", async () => {
    const drinks = await Category.create({ restaurantId: world.restaurantId, name: "Drinks", isActive: true });
    await FoodItem.updateOne({ _id: world.food.coffee }, { categoryId: drinks._id });

    const agent = await api().post("/api/printing/agents").set(bearer(owner)).send({ name: "PC" });
    await api()
      .post("/api/printing/printers")
      .set(bearer(owner))
      .send({
        name: "All",
        agentId: agent.body.agentId,
        connection: { type: "network", host: "127.0.0.1", port: 9 },
        printsUnroutedKots: true,
      });

    const lines = [
      { foodItemId: world.food.dosa, quantity: 1 },
      { foodItemId: world.food.coffee, quantity: 1 },
    ];

    const together = await counterOrder(owner, lines);
    expect(await PrintJob.countDocuments({ orderId: together, kind: "kot" })).toBe(1);

    await setKot({ splitByCategory: true });
    const split = await counterOrder(owner, lines);
    const items = await OrderItem.find({ orderId: split }).lean();
    expect(items.map((i) => i.categoryName).sort()).toEqual(["Breakfast", "Drinks"]);
    const jobs = await PrintJob.find({ orderId: split, kind: "kot" }).lean();
    expect(jobs).toHaveLength(2);
    expect(new Set(items.map((i) => i.tokenNumber)).size).toBe(1);
    expect(jobs.every((j) => j.title.includes(`T${items[0].tokenNumber}`))).toBe(true);
  });
});

describe("table guest access by sign-in method", () => {
  const login = (via: "qr" | "code") =>
    api()
      .post("/api/auth/table/login")
      .send(via === "code" ? { code: "tbl3", password: "pass3", startNewOrder: true } : { code: "tbl3", password: "pass3" });

  it("lets the admin turn off ordering for code sign-in only", async () => {
    const saved = await api()
      .put("/api/tables/settings")
      .set(bearer(owner))
      .send({ manual: { placeOrder: false } });
    expect(saved.body.manual).toEqual({ placeOrder: false, showMenu: true, showFeedback: true });
    expect(saved.body.qr).toEqual({ placeOrder: true, showMenu: true, showFeedback: true });

    const session = await login("code");
    expect(decodeToken(session.body.token).via).toBe("code");
    const blocked = await api()
      .post("/api/orders/dine-in")
      .set(bearer(session.body.token))
      .send({ customerName: "Asha", members: 2 });
    expect(blocked.status).toBe(403);

    await api()
      .put("/api/tables/settings")
      .set(bearer(owner))
      .send({ manual: { placeOrder: true } });
    const allowed = await api()
      .post("/api/orders/dine-in")
      .set(bearer(session.body.token))
      .send({ customerName: "Asha", members: 2 });
    expect(allowed.status).toBe(201);
    expect(decodeToken(allowed.body.token).via).toBe("code");
  });

  it("turns ordering off when the menu is hidden", async () => {
    const saved = await api()
      .put("/api/tables/settings")
      .set(bearer(owner))
      .send({ qr: { showMenu: false } });
    expect(saved.body.qr).toMatchObject({ showMenu: false, placeOrder: false });
  });

  it("requires only the details the admin ticked", async () => {
    const saved = await api()
      .put("/api/tables/settings")
      .set(bearer(owner))
      .send({ requiredDetails: { phone: true } });
    expect(saved.body.requiredDetails).toEqual({ name: true, phone: true, members: true, birthday: false });

    const session = await login("code");
    const missing = await api()
      .post("/api/orders/dine-in")
      .set(bearer(session.body.token))
      .send({ customerName: "Asha", members: 2 });
    expect(missing.status).toBe(400);
    const given = await api()
      .post("/api/orders/dine-in")
      .set(bearer(session.body.token))
      .send({ customerName: "Asha", members: 2, customerPhone: "+91 98450 00000" });
    expect(given.status).toBe(201);

    await api().put("/api/tables/settings").set(bearer(owner)).send({ requiredDetails: { phone: false } });
  });

  it("stores the marketing consent the guest ticked next to their phone number", async () => {
    const session = await login("code");
    const res = await api()
      .post("/api/orders/dine-in")
      .set(bearer(session.body.token))
      .send({
        customerName: "Asha",
        members: 2,
        customerPhone: "+91 98450 00000",
        customerMarketingConsent: true,
      });
    expect(res.status).toBe(201);
    expect(res.body.order).toMatchObject({ customerMarketingConsent: true });
  });
});
