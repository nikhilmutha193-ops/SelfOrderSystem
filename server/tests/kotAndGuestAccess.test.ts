import { beforeAll, describe, expect, it } from "vitest";

import Category from "../src/models/Category";
import FoodItem from "../src/models/FoodItem";
import OrderItem from "../src/models/OrderItem";
import PrintJob from "../src/models/PrintJob";
import {
  api,
  bearer,
  counterOrder,
  createWorld,
  decodeToken,
  loginAdmin,
  World,
} from "./fixtures";

let world: World;
let owner: string;

beforeAll(async () => {
  world = await createWorld({ guestOrderMode: "accept" });
  owner = await loginAdmin();
});

const setKot = (kotSettings: object) =>
  api()
    .put("/api/restaurant/settings")
    .set(bearer(owner))
    .send({ kotSettings });
const tokensOf = async (orderId: string) =>
  (await OrderItem.find({ orderId }).lean()).map((i) => i.tokenNumber);

describe("KOT token start number", () => {
  it("counts up from the number the admin sets", async () => {
    expect((await setKot({ tokenStart: 0 })).status).toBe(400);
    expect((await setKot({ tokenStart: 1.5 })).status).toBe(400);
    expect((await setKot({ tokenStart: 100 })).status).toBe(200);

    const first = await counterOrder(owner, [
      { foodItemId: world.food.dosa, quantity: 1 },
    ]);
    const second = await counterOrder(owner, [
      { foodItemId: world.food.vada, quantity: 1 },
    ]);
    expect((await tokensOf(first))[0]).toBeGreaterThanOrEqual(100);
    expect((await tokensOf(second))[0]).toBe((await tokensOf(first))[0]! + 1);

    await setKot({ tokenStart: 1 });
  });
});

describe("one ticket per category with a shared token", () => {
  it("snapshots the category on each item and splits the printed tickets", async () => {
    const drinks = await Category.create({
      restaurantId: world.restaurantId,
      name: "Drinks",
      isActive: true,
    });
    await FoodItem.updateOne(
      { _id: world.food.coffee },
      { categoryId: drinks._id },
    );

    const agent = await api()
      .post("/api/printing/agents")
      .set(bearer(owner))
      .send({ name: "PC" });
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
    expect(
      await PrintJob.countDocuments({ orderId: together, kind: "kot" }),
    ).toBe(1);

    await setKot({ splitByCategory: true });
    const split = await counterOrder(owner, lines);
    const items = await OrderItem.find({ orderId: split }).lean();
    expect(items.map((i) => i.categoryName).sort()).toEqual([
      "Breakfast",
      "Drinks",
    ]);
    const jobs = await PrintJob.find({ orderId: split, kind: "kot" }).lean();
    expect(jobs).toHaveLength(2);
    expect(new Set(items.map((i) => i.tokenNumber)).size).toBe(1);
    expect(
      jobs.every((j) => j.title.includes(`T${items[0].tokenNumber}`)),
    ).toBe(true);

    // The PDF ticket (no printer) is one page per category, each carrying the same token.
    const pagesOf = async (id: string) => {
      const res = await api()
        .get(`/api/orders/${id}/kot/1/pdf`)
        .set(bearer(owner))
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on("data", (c: Buffer) => chunks.push(c));
          r.on("end", () => cb(null, Buffer.concat(chunks)));
        });
      expect(res.status).toBe(200);
      const text = (res.body as Buffer).toString("latin1");
      return (text.match(/MediaBox/g) || []).length;
    };
    expect(await pagesOf(split)).toBe(2);
    // The PDF follows the setting as it is now, so switch the split off for the single-ticket order.
    await setKot({ splitByCategory: false });
    expect(await pagesOf(together)).toBe(1);
  });
});

describe("merging categories onto one ticket", () => {
  it("prints merged categories together and every other category on its own ticket", async () => {
    const breakfast = await Category.findOne({
      restaurantId: world.restaurantId,
      name: "Breakfast",
    });
    const drinks = await Category.findOne({
      restaurantId: world.restaurantId,
      name: "Drinks",
    });
    const desserts = await Category.create({
      restaurantId: world.restaurantId,
      name: "Desserts",
      isActive: true,
    });
    const sweet = await FoodItem.create({
      restaurantId: world.restaurantId,
      categoryId: desserts._id,
      subcategoryId: (await FoodItem.findById(world.food.dosa))!.subcategoryId,
      name: "Kesari Bath",
      price: 50,
      isActive: true,
    });
    const ids = (c: { _id: unknown } | null) => String(c!._id);

    // A group needs two categories, and a category can be in one group only.
    expect(
      (await setKot({ categoryGroups: [{ categoryIds: [ids(breakfast)] }] }))
        .status,
    ).toBe(400);
    expect(
      (
        await setKot({
          categoryGroups: [
            { categoryIds: [ids(breakfast), ids(drinks)] },
            { categoryIds: [ids(drinks), ids(desserts)] },
          ],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await setKot({
          categoryGroups: [{ categoryIds: ["nope", ids(drinks)] }],
        })
      ).status,
    ).toBe(400);

    expect(
      (
        await setKot({
          splitByCategory: true,
          categoryGroups: [{ categoryIds: [ids(breakfast), ids(drinks)] }],
        })
      ).status,
    ).toBe(200);
    const order = await counterOrder(owner, [
      { foodItemId: world.food.dosa, quantity: 1 },
      { foodItemId: world.food.coffee, quantity: 1 },
      { foodItemId: String(sweet._id), quantity: 1 },
    ]);
    const jobs = await PrintJob.find({ orderId: order, kind: "kot" }).lean();
    expect(jobs).toHaveLength(2);
    expect(jobs.some((j) => j.title.includes("Breakfast + Drinks"))).toBe(true);
    expect(jobs.some((j) => j.title.includes("Desserts"))).toBe(true);
    expect(new Set((await tokensOf(order)).map(String)).size).toBe(1);

    // Clearing the groups goes back to one ticket per category.
    await setKot({ categoryGroups: [] });
    const separate = await counterOrder(owner, [
      { foodItemId: world.food.dosa, quantity: 1 },
      { foodItemId: world.food.coffee, quantity: 1 },
    ]);
    expect(
      await PrintJob.countDocuments({ orderId: separate, kind: "kot" }),
    ).toBe(2);
  });
});

describe("table guest access by sign-in method", () => {
  const login = (via: "qr" | "code") =>
    api()
      .post("/api/auth/table/login")
      .send(
        via === "code"
          ? { code: "tbl3", password: "pass3", startNewOrder: true }
          : { code: "tbl3", password: "pass3" },
      );

  it("lets the admin turn off ordering for code sign-in only", async () => {
    const saved = await api()
      .put("/api/tables/settings")
      .set(bearer(owner))
      .send({ manual: { placeOrder: false } });
    expect(saved.body.manual).toEqual({
      placeOrder: false,
      showMenu: true,
      showFeedback: true,
    });
    expect(saved.body.qr).toEqual({
      placeOrder: true,
      showMenu: true,
      showFeedback: true,
    });

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

  it("never blocks an order for a missing phone number or birthday, even when they are asked", async () => {
    const saved = await api()
      .put("/api/tables/settings")
      .set(bearer(owner))
      .send({ requiredDetails: { phone: true, birthday: true } });
    expect(saved.body.requiredDetails).toEqual({
      name: true,
      phone: true,
      members: true,
      birthday: true,
    });

    const session = await login("code");
    const res = await api()
      .post("/api/orders/dine-in")
      .set(bearer(session.body.token))
      .send({ customerName: "Asha", members: 2 });
    expect(res.status).toBe(201);

    await api()
      .put("/api/tables/settings")
      .set(bearer(owner))
      .send({ requiredDetails: { phone: false, birthday: false } });
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
