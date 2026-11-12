import { beforeAll, describe, expect, it } from "vitest";

import FoodItem from "../src/models/FoodItem";
import OrderItem from "../src/models/OrderItem";
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
  world = await createWorld();
  owner = await loginAdmin();
  await FoodItem.updateOne({ _id: world.food.dosa }, { packagingCharge: 10 });
});

const dineIn = (lines: object[]) =>
  counterOrder(
    owner,
    lines as { foodItemId: string; quantity: number }[],
    "Asha",
    {
      sendToKitchen: true,
      tableId: undefined,
    },
  );

describe("marking a dish to be packed", () => {
  it("adds the dish's packaging charge to a dine-in order when staff mark the line", async () => {
    const order = await api()
      .post("/api/orders/counter")
      .set(bearer(owner))
      .send({ customerName: "Ravi", tableId: world.tableIds[0] });
    expect(order.status).toBe(201);
    const id = order.body._id as string;
    await api()
      .post(`/api/orders/${id}/items`)
      .set(bearer(owner))
      .send({
        items: [
          { foodItemId: world.food.dosa, quantity: 2, isPacked: true },
          { foodItemId: world.food.vada, quantity: 1 },
        ],
      });
    const items = await OrderItem.find({ orderId: id }).lean();
    const dosa = items.find(
      (i) => i.foodItemId?.toString() === world.food.dosa,
    )!;
    const vada = items.find(
      (i) => i.foodItemId?.toString() === world.food.vada,
    )!;
    expect(dosa).toMatchObject({ isPacked: true, packagingCharge: 10 });
    expect(vada).toMatchObject({ isPacked: false, packagingCharge: 0 });

    const detail = await api().get(`/api/orders/${id}`).set(bearer(owner));
    expect(detail.body.totals.packagingCharge).toBe(20);

    // Unmark it on the open order and the charge goes.
    const off = await api()
      .patch(`/api/orders/items/${dosa._id}/packed`)
      .set(bearer(owner))
      .send({ packed: false });
    expect(off.status).toBe(200);
    expect(off.body).toMatchObject({ isPacked: false, packagingCharge: 0 });
    expect(
      (await api().get(`/api/orders/${id}`).set(bearer(owner))).body.totals
        .packagingCharge,
    ).toBe(0);

    const on = await api()
      .patch(`/api/orders/items/${dosa._id}/packed`)
      .set(bearer(owner))
      .send({ packed: true });
    expect(on.body).toMatchObject({ isPacked: true, packagingCharge: 10 });
  });

  it("lets a guest ask for a dish to be packed, but only staff change it later, and a billed order is locked", async () => {
    const seat = await seatTable(2);
    await api()
      .post(`/api/orders/${seat.orderId}/items`)
      .set(bearer(seat.token))
      .send({
        items: [{ foodItemId: world.food.dosa, quantity: 1, isPacked: true }],
      });
    const item = await OrderItem.findOne({ orderId: seat.orderId }).lean();
    expect(item).toMatchObject({ isPacked: true, packagingCharge: 10 });
    expect(
      (
        await api()
          .patch(`/api/orders/items/${item!._id}/packed`)
          .set(bearer(seat.token))
          .send({ packed: true })
      ).status,
    ).toBe(403);

    const id = await dineIn([{ foodItemId: world.food.dosa, quantity: 1 }]);
    await api().post(`/api/orders/${id}/bill`).set(bearer(owner));
    const billedItem = await OrderItem.findOne({ orderId: id }).lean();
    expect(
      (
        await api()
          .patch(`/api/orders/items/${billedItem!._id}/packed`)
          .set(bearer(owner))
          .send({ packed: true })
      ).status,
    ).toBe(409);
  });
});
