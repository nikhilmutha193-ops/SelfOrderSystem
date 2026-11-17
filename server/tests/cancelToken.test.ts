import { beforeAll, describe, expect, it } from "vitest";

import Order from "../src/models/Order";
import OrderItem from "../src/models/OrderItem";
import TableModel from "../src/models/Table";
import { api, bearer, createWorld, loginAdmin, seatTable, World } from "./fixtures";

let world: World;
let owner: string;

beforeAll(async () => {
  world = await createWorld();
  owner = await loginAdmin();
});

describe("cancelling one token's dishes", () => {
  it("keeps the order open and the table seated while another token is still on it", async () => {
    const seat = await seatTable(3);
    const add = (foodItemId: string) =>
      api().post(`/api/orders/${seat.orderId}/items`).set(bearer(owner)).send({ items: [{ foodItemId, quantity: 1 }] });
    const send = () => api().post(`/api/orders/${seat.orderId}/kot/print`).set(bearer(owner));

    await add(world.food.dosa);
    await send();
    await add(world.food.vada);
    await send();

    const items = await OrderItem.find({ orderId: seat.orderId }).sort({ kotRound: 1 });
    expect(items.map((i) => i.kotRound)).toEqual([1, 2]);

    const cancelled = await api()
      .patch(`/api/orders/items/${items[1]._id}/cancel`)
      .set(bearer(owner))
      .send({ reason: "wrong_item" });
    expect(cancelled.status).toBe(200);

    expect((await Order.findById(seat.orderId))!.status).toBe("open");
    expect((await OrderItem.findById(items[0]._id))!.status).not.toBe("cancelled");
    expect((await TableModel.findOne({ _id: world.tableIds[2] }))!.status).toBe("occupied");
  });
});
