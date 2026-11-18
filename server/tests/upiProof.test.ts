import { beforeAll, describe, expect, it } from "vitest";

import Order from "../src/models/Order";
import { api, bearer, counterOrder, createWorld, loginAdmin, World } from "./fixtures";

let world: World;
let owner: string;

beforeAll(async () => {
  world = await createWorld();
  owner = await loginAdmin();
});

const newOrder = () => counterOrder(owner, [{ foodItemId: world.food.dosa, quantity: 1 }]);
const pay = (orderId: string, body: object) =>
  api().patch(`/api/orders/${orderId}/pay`).set(bearer(owner)).send(body);
const upload = (orderId: string) =>
  api()
    .post(`/api/orders/${orderId}/payment-proof`)
    .set(bearer(owner))
    .attach("image", Buffer.from("not really a photo"), { filename: "pay.png", contentType: "image/png" });

describe("UPI payment proof", () => {
  it("refuses a UPI payment with no mobile number or screenshot, but not other methods", async () => {
    const id = await newOrder();
    const refused = await pay(id, { paymentMethod: "upi" });
    expect(refused.status).toBe(400);
    expect(refused.body.message).toMatch(/mobile number or a screenshot/);
    expect((await pay(id, { payments: [{ method: "upi", amount: 1 }] })).status).toBe(400);
    expect((await Order.findById(id))!.status).not.toBe("closed");

    const cash = await newOrder();
    expect((await pay(cash, { paymentMethod: "cash" })).status).toBe(200);
  });

  it("accepts the payer's mobile number and keeps it on the payment", async () => {
    const id = await newOrder();
    expect((await pay(id, { paymentMethod: "upi", payerPhone: "12345" })).status).toBe(400);
    const paid = await pay(id, { paymentMethod: "upi", payerPhone: "98765 43210" });
    expect(paid.status).toBe(200);
    expect(paid.body.payments[0]).toEqual(expect.objectContaining({ method: "upi", payerPhone: "919876543210" }));
  });

  it("uses the customer's mobile number already on the order", async () => {
    const id = await newOrder();
    await Order.updateOne({ _id: id }, { $set: { customerPhone: "98450 11111" } });
    const paid = await pay(id, { paymentMethod: "upi" });
    expect(paid.status).toBe(200);
    expect(paid.body.payments[0]).toEqual(expect.objectContaining({ method: "upi", payerPhone: "919845011111" }));

    // A number typed for the payment wins over the one on the order.
    const other = await newOrder();
    await Order.updateOne({ _id: other }, { $set: { customerPhone: "98450 11111" } });
    const typed = await pay(other, { paymentMethod: "upi", payerPhone: "9123456789" });
    expect(typed.body.payments[0].payerPhone).toBe("919123456789");
  });

  it("accepts an uploaded screenshot, which only staff can open, and only for its own order", async () => {
    const id = await newOrder();
    const other = await newOrder();
    const uploaded = await upload(id);
    expect(uploaded.status).toBe(201);
    const { proofKey } = uploaded.body as { proofKey: string };
    expect(proofKey.startsWith(`${id}-`)).toBe(true);

    const view = await api().get(`/api/orders/${id}/payment-proof/${proofKey}`).set(bearer(owner));
    expect(view.status).toBe(200);
    expect(view.headers["content-type"]).toContain("image/png");
    expect((await api().get(`/api/orders/${id}/payment-proof/${proofKey}`)).status).toBe(401);
    expect((await api().get(`/api/orders/${other}/payment-proof/${proofKey}`).set(bearer(owner))).status).toBe(404);
    expect((await pay(other, { paymentMethod: "upi", proofKey })).status).toBe(400);

    const paid = await pay(id, { paymentMethod: "upi", proofKey });
    expect(paid.status).toBe(200);
    expect(paid.body.payments[0].proofKey).toBe(proofKey);
  });
});
