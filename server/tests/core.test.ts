import { beforeAll, describe, expect, it } from "vitest";

import { emit, on } from "../src/core/events";
import { withTransaction } from "../src/core/transaction";
import Coupon from "../src/models/Coupon";
import { createWorld, World } from "./fixtures";

let world: World;

beforeAll(async () => {
  world = await createWorld();
});

describe("event bus", () => {
  it("keeps running other handlers when one throws", async () => {
    const received: string[] = [];
    const stops = [
      on("order.cancelled", () => {
        throw new Error("boom");
      }),
      on("order.cancelled", (event) => void received.push(event.orderId)),
    ];
    await emit("order.cancelled", { restaurantId: world.restaurantId, orderId: "o1" });
    stops.forEach((stop) => stop());
    await emit("order.cancelled", { restaurantId: world.restaurantId, orderId: "o2" });
    expect(received).toEqual(["o1"]);
  });
});

describe("transactions", () => {
  it("commits all writes together", async () => {
    await withTransaction(async (session) => {
      await Coupon.updateOne({ code: "SAVE10" }, { $inc: { usedCount: 1 } }, { session });
      await Coupon.updateOne({ code: "BIG50" }, { $inc: { usedCount: 1 } }, { session });
    });
    const coupons = await Coupon.find({ code: { $in: ["SAVE10", "BIG50"] } });
    expect(coupons.map((c) => c.usedCount)).toEqual([1, 1]);
  });

  it("rolls back every write when the work fails", async () => {
    await expect(
      withTransaction(async (session) => {
        await Coupon.updateOne({ code: "SAVE10" }, { $inc: { usedCount: 5 } }, { session });
        throw new Error("payment failed");
      })
    ).rejects.toThrow("payment failed");
    expect((await Coupon.findOne({ code: "SAVE10" }))!.usedCount).toBe(1);
  });
});
