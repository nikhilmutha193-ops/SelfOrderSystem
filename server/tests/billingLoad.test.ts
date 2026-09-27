import { beforeAll, describe, expect, it } from "vitest";

import Order from "../src/models/Order";
import OrderItem from "../src/models/OrderItem";
import Restaurant from "../src/models/Restaurant";
import { api, bearer, createWorld, loginAdmin, World } from "./fixtures";

let world: World;
let owner: string;

beforeAll(async () => {
  world = await createWorld();
  owner = await loginAdmin();
});

async function seedOpenOrders(count: number, price: number): Promise<string[]> {
  const orders = await Order.insertMany(
    Array.from({ length: count }, (_, n) => ({
      restaurantId: world.restaurantId,
      orderType: "takeaway",
      source: "counter",
      customerName: `Load ${n}`,
      status: "open",
    }))
  );
  await OrderItem.insertMany(
    orders.map((order) => ({
      restaurantId: world.restaurantId,
      orderId: order._id,
      foodItemId: world.food.dosa,
      foodName: "Masala Dosa",
      unitPrice: price,
      quantity: 1,
      total: price,
      status: "pending",
      kotRound: 1,
    }))
  );
  return orders.map((o) => o._id.toString());
}

function csvTotal(csv: string): string {
  return csv.trim().split("\r\n").pop()!;
}

describe("billing under load", () => {
  it("gives 100 simultaneous bills 100 consecutive numbers", async () => {
    const orderIds = await seedOpenOrders(100, 120);
    const results = await Promise.all(
      orderIds.map((id) => api().post(`/api/orders/${id}/bill`).set(bearer(owner)).send({}))
    );
    expect(results.filter((r) => r.status !== 200).map((r) => r.body.message)).toEqual([]);
    const seqs = results.map((r) => Number(r.body.invoiceNumber.split("/")[2])).sort((a, b) => a - b);
    expect(new Set(seqs).size).toBe(100);
    expect(seqs[99] - seqs[0]).toBe(99);
  });

  it("keeps the CSV report and analytics unchanged when tax rates change", async () => {
    const [orderId] = await seedOpenOrders(1, 200);
    await api().patch(`/api/orders/${orderId}/pay`).set(bearer(owner)).send({ paymentMethod: "cash" });

    const read = async () => ({
      csv: csvTotal(
        (
          await api()
            .get("/api/orders/report.csv")
            .set(bearer(owner))
            .buffer(true)
            .parse((res, cb) => {
              let text = "";
              res.on("data", (c: Buffer) => (text += c.toString("utf8")));
              res.on("end", () => cb(null, text));
            })
        ).body as string
      ),
      revenue: (await api().get("/api/analytics/sales").set(bearer(owner))).body.totalRevenue,
    });

    const before = await read();
    await Restaurant.updateOne({ _id: world.restaurantId }, { $set: { taxRates: [{ name: "GST", percent: 18 }] } });
    expect(await read()).toEqual(before);
  });
});
