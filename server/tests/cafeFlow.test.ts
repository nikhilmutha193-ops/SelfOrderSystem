import { beforeAll, describe, expect, it } from "vitest";

import OrderItem from "../src/models/OrderItem";
import TableModel from "../src/models/Table";
import { encryptTableToken } from "../src/utils/tableToken";
import {
  api,
  bearer,
  counterOrder,
  createWorld,
  loginAdmin,
  seatTable,
  World,
} from "./fixtures";

let world: World;
let owner: string;

beforeAll(async () => {
  // Guest items go to the kitchen by themselves in the restaurant flow, so the cafe flow has to stop that.
  world = await createWorld({ guestOrderMode: "auto" });
  owner = await loginAdmin();
});

const setFlow = (serviceFlow: string) =>
  api()
    .put("/api/restaurant/settings")
    .set(bearer(owner))
    .send({ serviceFlow });

const unsentOrder = (
  lines = [{ foodItemId: world.food.coffee, quantity: 1 }],
) => counterOrder(owner, lines, "Walk-in", { sendToKitchen: false });

const itemsOf = (orderId: string) => OrderItem.find({ orderId }).lean();

describe("service flow setting", () => {
  it("defaults to the restaurant flow, which bills only after the kitchen has the items", async () => {
    const id = await unsentOrder();
    const res = await api()
      .post(`/api/orders/${id}/bill`)
      .set(bearer(owner))
      .send({});
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/Send 1 item to the kitchen/);
  });

  it("only accepts the two known flows", async () => {
    expect((await setFlow("drive-through")).status).toBe(400);
    expect((await setFlow("cafe")).status).toBe(200);
    const pub = await api().get("/api/restaurant/public");
    expect(pub.body.serviceFlow).toBe("cafe");
    const menu = await api().get("/api/pos/menu").set(bearer(owner));
    expect(menu.body.billing.serviceFlow).toBe("cafe");
  });
});

describe("cafe flow: pay first, then the kitchen", () => {
  it("bills an order whose items have not been sent", async () => {
    await setFlow("cafe");
    const id = await unsentOrder();
    const res = await api()
      .post(`/api/orders/${id}/bill`)
      .set(bearer(owner))
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("billed");
    expect((await itemsOf(id)).every((i) => i.kotRound == null)).toBe(true);
  });

  it("sends the KOT, with a token, the moment the order is paid", async () => {
    await setFlow("cafe");
    const id = await unsentOrder([
      { foodItemId: world.food.dosa, quantity: 2 },
      { foodItemId: world.food.vada, quantity: 1 },
    ]);
    const before = await itemsOf(id);
    expect(
      before.every((i) => i.kotRound == null && i.tokenNumber == null),
    ).toBe(true);

    const paid = await api()
      .patch(`/api/orders/${id}/pay`)
      .set(bearer(owner))
      .send({ paymentMethod: "upi" });
    expect(paid.status).toBe(200);
    expect(paid.body.status).toBe("closed");

    const after = await itemsOf(id);
    expect(after.every((i) => i.kotRound === 1 && i.tokenNumber != null)).toBe(
      true,
    );
    expect(new Set(after.map((i) => i.tokenNumber)).size).toBe(1);

    const queue = await api().get("/api/orders/kot/queue").set(bearer(owner));
    expect(
      queue.body.some((g: { order: { _id: string } }) => g.order._id === id),
    ).toBe(true);
  });

  it("still refuses a hand-made KOT on a closed order", async () => {
    await setFlow("cafe");
    const id = await unsentOrder();
    await api()
      .patch(`/api/orders/${id}/pay`)
      .set(bearer(owner))
      .send({ paymentMethod: "cash" });
    const res = await api()
      .post(`/api/orders/${id}/kot/print`)
      .set(bearer(owner));
    expect(res.status).toBe(409);
  });

  it("makes the receipt carry the token", async () => {
    await setFlow("cafe");
    const id = await unsentOrder();
    await api()
      .patch(`/api/orders/${id}/pay`)
      .set(bearer(owner))
      .send({ paymentMethod: "cash" });
    const token = (await itemsOf(id))[0].tokenNumber;
    const share = await api()
      .post(`/api/bills/${id}/share`)
      .set(bearer(owner))
      .send({});
    const link = share.body.url.split("/bill/")[1];
    const pub = await api().get(`/api/bills/public/${link}`);
    expect(pub.body.order.token).toBe(`Token ${token}`);
  });

  it("keeps guest orders waiting for payment instead of sending them to the kitchen", async () => {
    await setFlow("cafe");
    const seat = await seatTable(1);
    await api()
      .post(`/api/orders/${seat.orderId}/items`)
      .set(bearer(seat.token))
      .send({ items: [{ foodItemId: world.food.dosa, quantity: 1 }] });
    expect((await itemsOf(seat.orderId)).every((i) => i.kotRound == null)).toBe(
      true,
    );

    await api()
      .patch(`/api/orders/${seat.orderId}/pay`)
      .set(bearer(owner))
      .send({ paymentMethod: "cash" });
    expect((await itemsOf(seat.orderId)).every((i) => i.kotRound === 1)).toBe(
      true,
    );
  });
});

describe("tracking an order by its token number", () => {
  it("signs a guest in to just their paid order, read-only", async () => {
    await setFlow("cafe");
    const id = await unsentOrder([
      { foodItemId: world.food.dosa, quantity: 1 },
    ]);
    await api()
      .patch(`/api/orders/${id}/pay`)
      .set(bearer(owner))
      .send({ paymentMethod: "cash" });
    const token = (await itemsOf(id))[0].tokenNumber;

    const login = await api()
      .post("/api/auth/table/token-login")
      .send({ token });
    expect(login.status).toBe(200);
    const mine = await api()
      .get(`/api/orders/${id}`)
      .set(bearer(login.body.token));
    expect(mine.status).toBe(200);
    expect(mine.body.items[0]).toMatchObject({ tokenNumber: token });

    // It cannot see another order, and it cannot order more.
    const other = await unsentOrder();
    expect(
      (await api().get(`/api/orders/${other}`).set(bearer(login.body.token)))
        .status,
    ).toBe(403);
    const more = await api()
      .post(`/api/orders/${id}/items`)
      .set(bearer(login.body.token))
      .send({ items: [{ foodItemId: world.food.dosa, quantity: 1 }] });
    expect(more.status).toBe(403);
  });

  it("refuses a token nobody was given, and is only for the cafe flow", async () => {
    await setFlow("cafe");
    expect(
      (await api().post("/api/auth/table/token-login").send({ token: 9876 }))
        .status,
    ).toBe(404);
    expect(
      (await api().post("/api/auth/table/token-login").send({ token: "abc" }))
        .status,
    ).toBe(400);
    await setFlow("restaurant");
    expect(
      (await api().post("/api/auth/table/token-login").send({ token: 1 }))
        .status,
    ).toBe(404);
  });
});

describe("token sign-in switch and picking a table", () => {
  const setTokenLogin = (allowTokenLogin: boolean) =>
    api()
      .put("/api/tables/settings")
      .set(bearer(owner))
      .send({ allowTokenLogin });

  it("follows the admin switch in either flow", async () => {
    await setFlow("restaurant");
    const id = await unsentOrder();
    await api().post(`/api/orders/${id}/kot/print`).set(bearer(owner));
    const token = (await itemsOf(id))[0].tokenNumber;

    await setTokenLogin(true);
    const pub = await api().get("/api/restaurant/public");
    expect(pub.body.tableLoginSettings.allowTokenLogin).toBe(true);
    expect(
      (await api().post("/api/auth/table/token-login").send({ token })).status,
    ).toBe(200);

    await setFlow("cafe");
    await setTokenLogin(false);
    expect(
      (await api().post("/api/auth/table/token-login").send({ token })).status,
    ).toBe(404);
    await setTokenLogin(true);
  });

  it("lets a token guest pick a free table and order from it", async () => {
    await setFlow("restaurant");
    await setTokenLogin(true);
    const id = await unsentOrder();
    await api().post(`/api/orders/${id}/kot/print`).set(bearer(owner));
    const token = (await itemsOf(id))[0].tokenNumber;
    const login = await api()
      .post("/api/auth/table/token-login")
      .send({ token });

    expect(
      (await api().post("/api/auth/table/token-seat").send({ code: "tbl3" }))
        .status,
    ).toBe(401);
    expect(
      (
        await api()
          .post("/api/auth/table/token-seat")
          .set(bearer(login.body.token))
          .send({ code: "nope" })
      ).status,
    ).toBe(404);
    const seat = await api()
      .post("/api/auth/table/token-seat")
      .set(bearer(login.body.token))
      .send({ code: "TBL3" });
    expect(seat.status).toBe(200);
    expect(seat.body.table.code).toBe("tbl3");

    const more = await api()
      .post(`/api/orders/${id}/items`)
      .set(bearer(seat.body.token))
      .send({ items: [{ foodItemId: world.food.dosa, quantity: 1 }] });
    expect(more.status).toBeLessThan(300);

    // The table is taken now.
    const second = await api()
      .post("/api/auth/table/token-login")
      .send({ token });
    expect(
      (
        await api()
          .post("/api/auth/table/token-seat")
          .set(bearer(second.body.token))
          .send({ code: "tbl3" })
      ).status,
    ).toBe(409);
  });
});

describe("scanning a table QR with a token session", () => {
  it("gives a free table to the token's order, and refuses an occupied one", async () => {
    await setFlow("restaurant");
    await api()
      .put("/api/tables/settings")
      .set(bearer(owner))
      .send({ allowTokenLogin: true });
    const tokenSession = async () => {
      const id = await unsentOrder();
      await api().post(`/api/orders/${id}/kot/print`).set(bearer(owner));
      const token = (await itemsOf(id))[0].tokenNumber;
      return (await api().post("/api/auth/table/token-login").send({ token }))
        .body.token as string;
    };
    const table = await TableModel.findOne({ code: "tbl2" });
    const qr = encryptTableToken(
      table!._id.toString(),
      table!.restaurantId.toString(),
    );

    const first = await api()
      .post("/api/auth/table/token-seat")
      .set(bearer(await tokenSession()))
      .send({ token: qr });
    expect(first.status).toBe(200);
    expect(first.body.table.code).toBe("tbl2");

    const second = await api()
      .post("/api/auth/table/token-seat")
      .set(bearer(await tokenSession()))
      .send({ token: qr });
    expect(second.status).toBe(409);
  });
});

describe("tracking a token from a table session", () => {
  it("keeps the table session and points it at the token's order", async () => {
    await setFlow("restaurant");
    await api()
      .put("/api/tables/settings")
      .set(bearer(owner))
      .send({ allowTokenLogin: true });
    const id = await unsentOrder();
    await api().post(`/api/orders/${id}/kot/print`).set(bearer(owner));
    const token = (await itemsOf(id))[0].tokenNumber;

    const table = await TableModel.findOne({ code: "tbl1" });
    await TableModel.updateOne(
      { _id: table!._id },
      { $set: { status: "available" }, $unset: { sessionId: "" } },
    );
    const login = await api()
      .post("/api/auth/table/login")
      .send({ code: "tbl1", password: "pass1", startNewOrder: true });
    const link = await api()
      .post("/api/auth/table/token-link")
      .set(bearer(login.body.token))
      .send({ token });
    expect(link.status).toBe(200);
    expect(
      (await api().get(`/api/orders/${id}`).set(bearer(link.body.token)))
        .status,
    ).toBe(200);

    expect(
      (
        await api()
          .post("/api/auth/table/token-link")
          .set(bearer(login.body.token))
          .send({ token: 9876 })
      ).status,
    ).toBe(404);
  });
});

describe("restaurant flow is unchanged", () => {
  it("auto-sends guest items and prints no token on the bill", async () => {
    await setFlow("restaurant");
    const seat = await seatTable(2);
    await api()
      .post(`/api/orders/${seat.orderId}/items`)
      .set(bearer(seat.token))
      .send({ items: [{ foodItemId: world.food.dosa, quantity: 1 }] });
    expect((await itemsOf(seat.orderId)).every((i) => i.kotRound === 1)).toBe(
      true,
    );

    await api()
      .patch(`/api/orders/${seat.orderId}/pay`)
      .set(bearer(owner))
      .send({ paymentMethod: "cash" });
    const share = await api()
      .post(`/api/bills/${seat.orderId}/share`)
      .set(bearer(owner))
      .send({});
    const pub = await api().get(
      `/api/bills/public/${share.body.url.split("/bill/")[1]}`,
    );
    expect(pub.body.order.token).toBe("");
  });
});
