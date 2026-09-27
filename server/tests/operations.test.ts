import { beforeAll, describe, expect, it } from "vitest";

import Order from "../src/models/Order";
import OrderItem from "../src/models/OrderItem";
import TableModel from "../src/models/Table";
import { api, bearer, counterOrder, createWorld, loginAdmin, World } from "./fixtures";

let world: World;
let owner: string;
let manager: string;

beforeAll(async () => {
  world = await createWorld();
  owner = await loginAdmin();
  manager = await loginAdmin("manager", "Manager@123");
});

const detail = (orderId: string) => api().get(`/api/orders/${orderId}`).set(bearer(owner));

describe("splitting and merging bills", () => {
  it("moves chosen items to a new bill on the same table", async () => {
    const orderId = await counterOrder(
      owner,
      [
        { foodItemId: world.food.dosa, quantity: 1 },
        { foodItemId: world.food.vada, quantity: 1 },
      ],
      "Split me",
      { tableId: world.tableIds[0] }
    );
    const items = (await detail(orderId)).body.items;
    const vada = items.find((i: { foodName: string }) => i.foodName === "Medu Vada");

    const all = await api()
      .post(`/api/orders/${orderId}/split`)
      .set(bearer(owner))
      .send({ itemIds: items.map((i: { _id: string }) => i._id) });
    expect(all.body.message).toBe("Leave at least one item on the original bill");

    const res = await api()
      .post(`/api/orders/${orderId}/split`)
      .set(bearer(owner))
      .send({ itemIds: [vada._id] });
    expect(res.status).toBe(201);
    expect(res.body.created).toMatchObject({ tableId: world.tableIds[0], splitFrom: orderId, status: "open" });
    expect((await detail(orderId)).body.totals.subtotal).toBe(120);
    expect((await detail(res.body.created._id)).body.totals.subtotal).toBe(60);
  });

  it("merges one open order into another and marks the source", async () => {
    const a = await counterOrder(owner, [{ foodItemId: world.food.dosa, quantity: 1 }], "Merge A");
    const b = await counterOrder(owner, [{ foodItemId: world.food.vada, quantity: 2 }], "Merge B");
    const res = await api().post(`/api/orders/${a}/merge`).set(bearer(owner)).send({ intoOrderId: b });
    expect(res.status).toBe(200);
    expect((await detail(b)).body.totals.subtotal).toBe(240);
    const source = await Order.findById(a);
    expect(source).toMatchObject({ status: "cancelled", cancelReason: "Merged into Merge B" });
    expect(source!.mergedInto!.toString()).toBe(b);
    expect(await OrderItem.countDocuments({ orderId: a })).toBe(0);
  });
});

describe("moving tables", () => {
  it("moves a dine-in order to a free table and frees the old one", async () => {
    const orderId = await counterOrder(owner, [{ foodItemId: world.food.dosa, quantity: 1 }], "Mover", {
      tableId: world.tableIds[1],
    });
    const busy = await api()
      .post(`/api/orders/${orderId}/transfer`)
      .set(bearer(owner))
      .send({ tableId: world.tableIds[0] });
    expect(busy.status).toBe(409);

    const res = await api()
      .post(`/api/orders/${orderId}/transfer`)
      .set(bearer(owner))
      .send({ tableId: world.tableIds[2] });
    expect(res.status).toBe(200);
    expect((await TableModel.findById(world.tableIds[1]))!.status).toBe("available");
    expect((await TableModel.findById(world.tableIds[2]))!.status).toBe("occupied");
  });
});

describe("discounts and complimentary items", () => {
  it("keeps staff within their discount limit and records the reason", async () => {
    const orderId = await counterOrder(owner, [{ foodItemId: world.food.dosa, quantity: 1 }]);
    const tooBig = await api()
      .put(`/api/orders/${orderId}/discount`)
      .set(bearer(manager))
      .send({ type: "percent", value: 25, reason: "Regular guest" });
    expect(tooBig.status).toBe(403);
    expect(tooBig.body.message).toBe("Your discount limit is 10%. Ask the owner to give a bigger discount.");

    const flatTooBig = await api()
      .put(`/api/orders/${orderId}/discount`)
      .set(bearer(manager))
      .send({ type: "flat", value: 20, reason: "Regular guest" });
    expect(flatTooBig.status).toBe(403);

    const ok = await api()
      .put(`/api/orders/${orderId}/discount`)
      .set(bearer(manager))
      .send({ type: "percent", value: 10, reason: "Regular guest" });
    expect(ok.status).toBe(200);
    expect((await detail(orderId)).body.totals).toMatchObject({
      manualDiscount: 12,
      taxableAmount: 108,
      grandTotal: 113,
    });

    const ownerBig = await api()
      .put(`/api/orders/${orderId}/discount`)
      .set(bearer(owner))
      .send({ type: "flat", value: 60, reason: "Birthday" });
    expect(ownerBig.status).toBe(200);
    const billed = await api().post(`/api/orders/${orderId}/bill`).set(bearer(owner)).send({});
    expect(billed.body.bill).toMatchObject({ manualDiscount: 60, discount: 60, grandTotal: 63 });
  });

  it("makes an item complimentary with a reason and keeps its value for reports", async () => {
    const orderId = await counterOrder(owner, [
      { foodItemId: world.food.dosa, quantity: 1 },
      { foodItemId: world.food.coffee, quantity: 1 },
    ]);
    const coffee = (await detail(orderId)).body.items.find((i: { foodName: string }) => i.foodName === "Filter Coffee");
    const noReason = await api().patch(`/api/orders/items/${coffee._id}/complimentary`).set(bearer(owner)).send({});
    expect(noReason.body.message).toBe("A reason is required");

    const res = await api()
      .patch(`/api/orders/items/${coffee._id}/complimentary`)
      .set(bearer(owner))
      .send({ reason: "Waited too long" });
    expect(res.body).toMatchObject({ complimentary: true, total: 0, unitPrice: 100 });
    expect((await detail(orderId)).body.totals.subtotal).toBe(120);
  });
});
