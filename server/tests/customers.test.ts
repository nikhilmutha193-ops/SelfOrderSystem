import jwt from "jsonwebtoken";
import { beforeAll, describe, expect, it } from "vitest";

import Customer from "../src/models/Customer";
import Order from "../src/models/Order";
import { loyaltyBalance } from "../src/modules/customers/loyalty";
import { api, bearer, createWorld, loginAdmin, seatTable, World } from "./fixtures";

let world: World;
let owner: string;

beforeAll(async () => {
  world = await createWorld();
  owner = await loginAdmin();
});

const RAVI = "98450 11111";

async function takeaway(items: { foodItemId: string; quantity: number }[], phone = RAVI, name = "Ravi") {
  const res = await api()
    .post("/api/pos/orders")
    .set(bearer(owner))
    .send({ orderType: "takeaway", customerName: name, customerPhone: phone, items });
  if (res.status !== 201) throw new Error(JSON.stringify(res.body));
  return res.body.order._id as string;
}

const pay = (orderId: string) =>
  api().patch(`/api/orders/${orderId}/pay`).set(bearer(owner)).send({ paymentMethod: "cash" });
const lookup = async (phone = RAVI) =>
  (
    await api()
      .get(`/api/customers/lookup?phone=${encodeURIComponent(phone)}`)
      .set(bearer(owner))
  ).body.customer;
const redeem = (orderId: string, points: number) =>
  api().post(`/api/customers/orders/${orderId}/redeem`).set(bearer(owner)).send({ points });

describe("recognising guests", () => {
  it("links a guest's dine-in order to a customer by phone", async () => {
    const seat = await seatTable(1, "Asha");
    const customer = await Customer.findOne({ phone: "919845000000" });
    expect(customer).toMatchObject({ name: "Asha", visitCount: 0 });
    expect((await Order.findById(seat.orderId))!.customerId!.toString()).toBe(customer!._id.toString());
  });

  it("fills in a new customer's birthday from the dine-in guest form, but never overwrites one already set", async () => {
    const login = await api()
      .post("/api/auth/table/login")
      .send({ code: "tbl1", password: "pass1", startNewOrder: true });
    expect(login.status).toBe(200);
    const order = await api()
      .post("/api/orders/dine-in")
      .set(bearer(login.body.token))
      .send({ customerName: "Deepa", customerPhone: "+91 99887 66554", members: 1, customerBirthday: "08-15" });
    expect(order.status).toBe(201);

    const customer = await Customer.findOne({ phone: "919988766554" });
    expect(customer).toMatchObject({ name: "Deepa", birthday: "08-15" });

    // A second dine-in order for the same phone, with a different birthday, must not overwrite it.
    const login2 = await api()
      .post("/api/auth/table/login")
      .send({ code: "tbl1", password: "pass1", startNewOrder: true });
    await api()
      .post("/api/orders/dine-in")
      .set(bearer(login2.body.token))
      .send({ customerName: "Deepa", customerPhone: "+91 99887 66554", members: 1, customerBirthday: "01-01" });
    expect((await Customer.findOne({ phone: "919988766554" }))!.birthday).toBe("08-15");
  });

  it("keeps a birthday given with no phone number on the order itself, and carries it over once a phone is added", async () => {
    const login = await api()
      .post("/api/auth/table/login")
      .send({ code: "tbl1", password: "pass1", startNewOrder: true });
    const order = await api()
      .post("/api/orders/dine-in")
      .set(bearer(login.body.token))
      .send({ customerName: "NoPhone", members: 1, customerBirthday: "04-20" });
    expect(order.status).toBe(201);
    expect((await Order.findById(order.body.order._id))!.customerId).toBeFalsy();
    expect((await Order.findById(order.body.order._id))!.customerBirthday).toBe("04-20");

    // Adding just a phone later (no birthday re-typed) still carries the birthday over.
    const updated = await api()
      .patch(`/api/orders/${order.body.order._id}/customer`)
      .set(bearer(order.body.token))
      .send({ customerPhone: "+91 99111 22334" });
    expect(updated.status).toBe(200);
    expect((await Customer.findOne({ phone: "919911122334" }))!.birthday).toBe("04-20");
  });

  it("sets marketing consent from the sign-in checkbox, and never turns it back off on a later visit", async () => {
    const login = await api()
      .post("/api/auth/table/login")
      .send({ code: "tbl1", password: "pass1", startNewOrder: true });
    await api()
      .post("/api/orders/dine-in")
      .set(bearer(login.body.token))
      .send({ customerName: "Consents", customerPhone: "+91 98111 22333", customerMarketingConsent: true });
    expect((await Customer.findOne({ phone: "919811122333" }))!.marketingConsent).toBe(true);

    // A later visit where the box isn't checked again doesn't withdraw consent.
    const login2 = await api()
      .post("/api/auth/table/login")
      .send({ code: "tbl1", password: "pass1", startNewOrder: true });
    await api()
      .post("/api/orders/dine-in")
      .set(bearer(login2.body.token))
      .send({ customerName: "Consents", customerPhone: "+91 98111 22333" });
    expect((await Customer.findOne({ phone: "919811122333" }))!.marketingConsent).toBe(true);
  });

  it("defaults marketing consent to false when the checkbox isn't ticked", async () => {
    const login = await api()
      .post("/api/auth/table/login")
      .send({ code: "tbl1", password: "pass1", startNewOrder: true });
    await api()
      .post("/api/orders/dine-in")
      .set(bearer(login.body.token))
      .send({ customerName: "No Consent", customerPhone: "+91 98222 33444" });
    expect((await Customer.findOne({ phone: "919822233444" }))!.marketingConsent).toBe(false);
  });

  it("keeps consent given with no phone number on the order, and carries it over once a phone is added", async () => {
    const login = await api()
      .post("/api/auth/table/login")
      .send({ code: "tbl1", password: "pass1", startNewOrder: true });
    const order = await api()
      .post("/api/orders/dine-in")
      .set(bearer(login.body.token))
      .send({ customerName: "LateConsent", members: 1, customerMarketingConsent: true });
    expect((await Order.findById(order.body.order._id))!.customerId).toBeFalsy();

    const updated = await api()
      .patch(`/api/orders/${order.body.order._id}/customer`)
      .set(bearer(order.body.token))
      .send({ customerPhone: "+91 98333 44555" });
    expect(updated.status).toBe(200);
    expect((await Customer.findOne({ phone: "919833344555" }))!.marketingConsent).toBe(true);
  });

  it("sets a new customer's birthday from a staff-created order too (POS/New Order), not just the guest form", async () => {
    const res = await api()
      .post("/api/orders/takeaway")
      .set(bearer(owner))
      .send({ customerName: "Staff Walk-in", customerPhone: "98001 55667", customerBirthday: "07-04" });
    expect(res.status).toBe(201);
    const customer = await Customer.findOne({ phone: "919800155667" });
    expect(customer).toMatchObject({ name: "Staff Walk-in", birthday: "07-04" });
  });

  it("rejects a birthday that isn't in MM-DD format", async () => {
    const login = await api()
      .post("/api/auth/table/login")
      .send({ code: "tbl1", password: "pass1", startNewOrder: true });
    const order = await api()
      .post("/api/orders/dine-in")
      .set(bearer(login.body.token))
      .send({ customerName: "Bad Date", members: 1, customerBirthday: "15-08" });
    expect(order.status).toBe(400);
  });

  it("counts a visit and spend when the bill is paid, with no points while loyalty is off", async () => {
    const orderId = await takeaway([{ foodItemId: world.food.vada, quantity: 1 }]);
    await pay(orderId);
    expect(await lookup()).toMatchObject({
      name: "Ravi",
      phone: "919845011111",
      visitCount: 1,
      totalSpend: 63,
      points: 0,
    });
  });
});

describe("guest self-service", () => {
  it("looks up a guest's own saved name/birthday by phone, without exposing visit history", async () => {
    const login = await api()
      .post("/api/auth/table/login")
      .send({ code: "tbl1", password: "pass1", startNewOrder: true });
    const token = login.body.token;

    const notFound = await api().get("/api/customers/guest-lookup?phone=9000000000").set(bearer(token));
    expect(notFound.status).toBe(200);
    expect(notFound.body).toBeNull();

    // "Deepa" was created earlier in "recognising guests" with birthday 08-15.
    const found = await api().get("/api/customers/guest-lookup?phone=9988766554").set(bearer(token));
    expect(found.status).toBe(200);
    expect(found.body).toEqual({ name: "Deepa", birthday: "08-15" });
  });

  it("rejects a guest-lookup attempt from an admin token (table-only route)", async () => {
    expect((await api().get("/api/customers/guest-lookup?phone=9988766554").set(bearer(owner))).status).toBe(403);
  });

  it("lets a guest fill in missing phone/birthday later, linking the order to a customer", async () => {
    const login = await api()
      .post("/api/auth/table/login")
      .send({ code: "tbl1", password: "pass1", startNewOrder: true });
    const token = login.body.token;
    const order = await api().post("/api/orders/dine-in").set(bearer(token)).send({ customerName: "Rahul", members: 1 });
    expect(order.status).toBe(201);
    expect((await Order.findById(order.body.order._id))!.customerId).toBeFalsy();

    const updated = await api()
      .patch(`/api/orders/${order.body.order._id}/customer`)
      .set(bearer(order.body.token))
      .send({ customerPhone: "+91 97001 23456", customerBirthday: "03-10" });
    expect(updated.status).toBe(200);

    const customer = await Customer.findOne({ phone: "919700123456" });
    expect(customer).toMatchObject({ name: "Rahul", birthday: "03-10" });
    expect((await Order.findById(order.body.order._id))!.customerId!.toString()).toBe(customer!._id.toString());
  });

  it("fills in the birthday on an already-linked customer later, without needing a new phone", async () => {
    const login = await api()
      .post("/api/auth/table/login")
      .send({ code: "tbl1", password: "pass1", startNewOrder: true });
    const order = await api()
      .post("/api/orders/dine-in")
      .set(bearer(login.body.token))
      .send({ customerName: "Priya", customerPhone: "+91 98001 11223", members: 1 });
    const customerId = (await Order.findById(order.body.order._id))!.customerId;
    expect(customerId).toBeTruthy();
    expect((await Customer.findById(customerId))!.birthday).toBeFalsy();

    const patched = await api()
      .patch(`/api/orders/${order.body.order._id}/customer`)
      .set(bearer(order.body.token))
      .send({ customerBirthday: "12-25" });
    expect(patched.status).toBe(200);
    expect((await Customer.findById(customerId))!.birthday).toBe("12-25");
  });

  it("gives marketing consent on an already-linked customer from the menu page's details dialog, never un-consenting", async () => {
    const login = await api()
      .post("/api/auth/table/login")
      .send({ code: "tbl1", password: "pass1", startNewOrder: true });
    const order = await api()
      .post("/api/orders/dine-in")
      .set(bearer(login.body.token))
      .send({ customerName: "Vikram", customerPhone: "+91 98001 99887", members: 1 });
    const customerId = (await Order.findById(order.body.order._id))!.customerId;
    expect((await Customer.findById(customerId))!.marketingConsent).toBe(false);

    const patched = await api()
      .patch(`/api/orders/${order.body.order._id}/customer`)
      .set(bearer(order.body.token))
      .send({ customerMarketingConsent: true });
    expect(patched.status).toBe(200);
    expect((await Customer.findById(customerId))!.marketingConsent).toBe(true);

    // Sending the box unchecked (false) afterwards never withdraws it.
    await api()
      .patch(`/api/orders/${order.body.order._id}/customer`)
      .set(bearer(order.body.token))
      .send({ customerBirthday: "05-05", customerMarketingConsent: false });
    expect((await Customer.findById(customerId))!.marketingConsent).toBe(true);
  });

  it("refuses to update a different table's order", async () => {
    const seat = await seatTable(2, "Tbl2Guest");
    const login3 = await api()
      .post("/api/auth/table/login")
      .send({ code: "tbl3", password: "pass3", startNewOrder: true });
    const other = await api()
      .patch(`/api/orders/${seat.orderId}/customer`)
      .set(bearer(login3.body.token))
      .send({ customerBirthday: "06-06" });
    expect(other.status).toBe(403);
  });

  it("lets staff fix or complete guest details from the order page (New Order), and links a customer", async () => {
    const created = await api()
      .post("/api/orders/takeaway")
      .set(bearer(owner))
      .send({ customerName: "Typo Nmae" });
    const orderId = created.body._id as string;
    expect((await Order.findById(orderId))!.customerId).toBeFalsy();

    const fixed = await api()
      .patch(`/api/orders/${orderId}/customer`)
      .set(bearer(owner))
      .send({ customerName: "Fixed Name", customerPhone: "+91 98444 55666", customerBirthday: "11-11" });
    expect(fixed.status).toBe(200);
    expect(fixed.body).toMatchObject({ customerName: "Fixed Name" });

    const customer = await Customer.findOne({ phone: "919844455666" });
    expect(customer).toMatchObject({ name: "Fixed Name", birthday: "11-11" });
    expect((await Order.findById(orderId))!.customerId!.toString()).toBe(customer!._id.toString());
  });
});

describe("birthday SMS settings", () => {
  it("defaults to off with a sensible template, and validates/saves changes", async () => {
    const defaults = await api().get("/api/customers/birthday-sms-settings").set(bearer(owner));
    expect(defaults.status).toBe(200);
    expect(defaults.body.enabled).toBe(false);
    expect(defaults.body.template).toMatch(/\{name\}/);

    const empty = await api()
      .put("/api/customers/birthday-sms-settings")
      .set(bearer(owner))
      .send({ enabled: true, template: "" });
    expect(empty.status).toBe(400);

    const saved = await api()
      .put("/api/customers/birthday-sms-settings")
      .set(bearer(owner))
      .send({ enabled: true, template: "Hi {name}! Happy birthday from {restaurant}." });
    expect(saved.status).toBe(200);
    expect(saved.body).toEqual({ enabled: true, template: "Hi {name}! Happy birthday from {restaurant}." });

    const refetched = await api().get("/api/customers/birthday-sms-settings").set(bearer(owner));
    expect(refetched.body).toEqual({ enabled: true, template: "Hi {name}! Happy birthday from {restaurant}." });

    // Restore, so this doesn't leak into other tests.
    await api()
      .put("/api/customers/birthday-sms-settings")
      .set(bearer(owner))
      .send({ enabled: false, template: "Happy Birthday {name}! See you soon!" });
  });

  it("keeps birthday SMS settings to staff with the Customers permission", async () => {
    const manager = await loginAdmin("manager", "Manager@123");
    expect((await api().get("/api/customers/birthday-sms-settings").set(bearer(manager))).status).toBe(403);
  });

  it("lets staff send today's birthday texts on demand, once per guest per year", async () => {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", month: "2-digit", day: "2-digit" })
      .formatToParts(new Date())
      .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
    const birthday = `${today.month}-${today.day}`;

    await api()
      .post("/api/orders/takeaway")
      .set(bearer(owner))
      .send({ customerName: "Birthday Guest", customerPhone: "+91 98555 11223", customerBirthday: birthday });

    const sent = await api().post("/api/customers/birthday-sms-settings/send").set(bearer(owner));
    expect(sent.status).toBe(200);
    expect(sent.body.sentCount).toBe(1);

    // Already greeted this year - a second click sends nothing new.
    const again = await api().post("/api/customers/birthday-sms-settings/send").set(bearer(owner));
    expect(again.body.sentCount).toBe(0);

    // Clean up - this guest's birthday falls "today", which would otherwise leak into other
    // tests' "birthdays this week" segment checks.
    await Customer.deleteOne({ phone: "919855511223" });
  });

  it("keeps the manual send to staff with the Customers permission", async () => {
    const manager = await loginAdmin("manager", "Manager@123");
    expect((await api().post("/api/customers/birthday-sms-settings/send").set(bearer(manager))).status).toBe(403);
  });
});

describe("loyalty points", () => {
  it("validates and saves the loyalty rules", async () => {
    const bad = await api()
      .put("/api/customers/settings")
      .set(bearer(owner))
      .send({ enabled: true, pointsPer100: -1, pointValue: 1, minRedeem: 20, expiryDays: 365 });
    expect(bad.status).toBe(400);
    const ok = await api()
      .put("/api/customers/settings")
      .set(bearer(owner))
      .send({ enabled: true, pointsPer100: 10, pointValue: 1, minRedeem: 20, expiryDays: 365 });
    expect(ok.status).toBe(200);
  });

  it("earns points on the paid total", async () => {
    const orderId = await takeaway([{ foodItemId: world.food.dosa, quantity: 2 }]);
    await pay(orderId);
    expect(await lookup()).toMatchObject({ visitCount: 2, totalSpend: 315, points: 25, pointsValue: 25 });
  });

  it("redeems points as a saved discount line on the bill", async () => {
    const orderId = await takeaway([{ foodItemId: world.food.dosa, quantity: 1 }]);
    const tooFew = await redeem(orderId, 10);
    expect(tooFew.status).toBe(400);
    expect(tooFew.body.message).toBe("Redeem at least 20 points");
    const tooMany = await redeem(orderId, 30);
    expect(tooMany.status).toBe(409);
    expect(tooMany.body.message).toBe("Only 25 points are available");

    const res = await redeem(orderId, 20);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ redeem: { points: 20, amount: 20 }, customer: { points: 5 } });

    const bill = await api().post(`/api/orders/${orderId}/bill`).set(bearer(owner)).send({});
    expect(bill.body.bill).toMatchObject({
      subtotal: 120,
      loyaltyDiscount: 20,
      discount: 20,
      taxableAmount: 100,
      grandTotal: 105,
    });
    await pay(orderId);
    expect(await lookup()).toMatchObject({ points: 15, visitCount: 3 });
  });

  it("refuses points worth more than the bill", async () => {
    await api()
      .put("/api/customers/settings")
      .set(bearer(owner))
      .send({ enabled: true, pointsPer100: 10, pointValue: 10, minRedeem: 1, expiryDays: 365 });
    const orderId = await takeaway([{ foodItemId: world.food.vada, quantity: 1 }]);
    const res = await redeem(orderId, 15);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("That's more than the bill. Use up to 6 points.");

    expect((await redeem(orderId, 5)).status).toBe(200);
    expect((await lookup()).points).toBe(10);
    const removed = await api().delete(`/api/customers/orders/${orderId}/redeem`).set(bearer(owner));
    expect(removed.body.redeem).toBeNull();
    expect((await lookup()).points).toBe(15);

    await redeem(orderId, 5);
    await api().patch(`/api/orders/${orderId}/cancel`).set(bearer(owner)).send({});
    expect((await lookup()).points).toBe(15);
  });

  it("takes back earned points and returns used points when a paid bill is voided", async () => {
    const orderId = await takeaway([{ foodItemId: world.food.dosa, quantity: 1 }]);
    await redeem(orderId, 3);
    await pay(orderId);
    const before = await lookup();
    expect(before).toMatchObject({ points: 12 + 9, visitCount: 4 });

    await api().post(`/api/orders/${orderId}/void`).set(bearer(owner)).send({ reason: "Wrong table" });
    expect(await lookup()).toMatchObject({ points: 15, visitCount: 3 });
  });

  it("expires points first-in, first-out", () => {
    const day = 24 * 60 * 60 * 1000;
    const now = new Date();
    const at = (d: number) => new Date(now.getTime() + d * day);
    const result = loyaltyBalance(
      [
        { type: "earn", points: 100, expiresAt: at(-1), createdAt: at(-30) },
        { type: "earn", points: 50, expiresAt: at(10), createdAt: at(-20) },
        { type: "redeem", points: -60, expiresAt: null, createdAt: at(-10) },
        { type: "earn", points: 40, expiresAt: at(200), createdAt: at(-5) },
      ],
      now
    );
    expect(result).toEqual({ balance: 90, expired: 40, expiringSoon: 50 });
  });
});

describe("customer list and profile", () => {
  it("searches, filters by segment and edits a profile", async () => {
    const found = await api().get("/api/customers?q=ravi").set(bearer(owner));
    expect(found.body.map((c: { name: string }) => c.name)).toEqual(["Ravi"]);
    const regulars = await api().get("/api/customers?segment=regulars").set(bearer(owner));
    expect(regulars.body.map((c: { name: string }) => c.name)).toEqual(["Ravi"]);

    const id = found.body[0]._id;
    const bad = await api().put(`/api/customers/${id}`).set(bearer(owner)).send({ name: "Ravi K", birthday: "13-40" });
    expect(bad.status).toBe(400);
    const today = new Date();
    const md = `${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const saved = await api()
      .put(`/api/customers/${id}`)
      .set(bearer(owner))
      .send({ name: "Ravi K", birthday: md, tags: ["vip", "vip"], marketingConsent: true });
    expect(saved.status).toBe(200);
    expect(saved.body.customer).toMatchObject({ name: "Ravi K", birthday: md, tags: ["vip"], marketingConsent: true });
    expect(saved.body.orders.length).toBeGreaterThanOrEqual(5);
    expect(saved.body.ledger[0]).toHaveProperty("type");

    const birthdays = await api().get("/api/customers?segment=birthdays").set(bearer(owner));
    expect(birthdays.body.map((c: { name: string }) => c.name)).toEqual(["Ravi K"]);
  });

  it("lets order staff look up guests but not browse the customer list", async () => {
    const manager = await loginAdmin("manager", "Manager@123");
    expect((await api().get(`/api/customers/lookup?phone=${RAVI}`).set(bearer(manager))).status).toBe(200);
    expect((await api().get("/api/customers").set(bearer(manager))).status).toBe(403);
  });

  it("attaches a guest to an existing order by phone", async () => {
    const res = await api().post("/api/orders/takeaway").set(bearer(owner)).send({ customerName: "Walk-in" });
    const attached = await api()
      .post(`/api/customers/orders/${res.body._id}/attach`)
      .set(bearer(owner))
      .send({ phone: "+91 99000 22222", name: "Meera" });
    expect(attached.status).toBe(200);
    expect(attached.body.customer).toMatchObject({ name: "Meera", phone: "919900022222" });
    expect((await Order.findById(res.body._id))!.customerName).toBe("Meera");
    const bad = await api()
      .post(`/api/customers/orders/${res.body._id}/attach`)
      .set(bearer(owner))
      .send({ phone: "123" });
    expect(bad.status).toBe(400);
  });
});

describe("bill links for WhatsApp", () => {
  let orderId: string;
  let token: string;

  it("shares only a billed order, with a WhatsApp link to the guest's number", async () => {
    orderId = await takeaway([{ foodItemId: world.food.coffee, quantity: 1 }]);
    const early = await api().post(`/api/bills/${orderId}/share`).set(bearer(owner));
    expect(early.status).toBe(409);
    await api().post(`/api/orders/${orderId}/bill`).set(bearer(owner)).send({});
    const res = await api()
      .post(`/api/bills/${orderId}/share`)
      .set({ ...bearer(owner), Origin: "https://kaffi.example" });
    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/^https:\/\/kaffi\.example\/bill\/.+/);
    expect(res.body.whatsappUrl).toMatch(/^https:\/\/wa\.me\/919845011111\?text=/);
    expect(decodeURIComponent(res.body.whatsappUrl)).toContain("Test Kaffi: bill ");
    token = res.body.url.split("/bill/")[1];
  });

  it("shows the bill to anyone with the link, and nothing more", async () => {
    const res = await api().get(`/api/bills/public/${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      restaurant: { name: "Test Kaffi" },
      order: { customerName: "Ravi", status: "billed" },
      items: [{ foodName: "Filter Coffee", quantity: 1 }],
      totals: { grandTotal: 105 },
    });
    expect(res.body.order.invoiceNumber).toMatch(/\/\d{6}$/);

    const pdf = await api().get(`/api/bills/public/${token}/pdf`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toContain("application/pdf");

    expect((await api().get(`/api/bills/public/${token}x`)).status).toBe(404);
    expect(
      (
        await api()
          .get("/api/orders")
          .set({ Authorization: `Bearer ${token}` })
      ).status
    ).toBe(401);
  });

  it("says when a link has expired", async () => {
    const expired = jwt.sign({ oid: orderId, rid: world.restaurantId }, `${process.env.JWT_SECRET}:bill-link`, {
      audience: "bill",
      expiresIn: -10,
    });
    const res = await api().get(`/api/bills/public/${expired}`);
    expect(res.status).toBe(410);
    expect(res.body.message).toBe("This bill link has expired. Ask the restaurant for a new one.");
  });
});

describe("sms templates and campaigns", () => {
  it("validates and saves reusable templates, and lists them newest first", async () => {
    const bad = await api().post("/api/customers/sms/templates").set(bearer(owner)).send({ name: "", message: "" });
    expect(bad.status).toBe(400);

    const diwali = await api()
      .post("/api/customers/sms/templates")
      .set(bearer(owner))
      .send({ name: "Diwali Offer", message: "20% off this Diwali! Visit us today." });
    expect(diwali.status).toBe(201);
    expect(diwali.body).toMatchObject({ name: "Diwali Offer", message: "20% off this Diwali! Visit us today." });

    const liveMusic = await api()
      .post("/api/customers/sms/templates")
      .set(bearer(owner))
      .send({ name: "Live Music", message: "Live music tonight from 7pm!" });
    expect(liveMusic.status).toBe(201);

    const list = await api().get("/api/customers/sms/templates").set(bearer(owner));
    expect(list.body.map((t: { name: string }) => t.name)).toEqual(["Live Music", "Diwali Offer"]);

    const updated = await api()
      .put(`/api/customers/sms/templates/${diwali.body._id}`)
      .set(bearer(owner))
      .send({ name: "Diwali Offer", message: "25% off this Diwali! Visit us today." });
    expect(updated.body.message).toBe("25% off this Diwali! Visit us today.");

    await api().delete(`/api/customers/sms/templates/${liveMusic.body._id}`).set(bearer(owner));
    const afterDelete = await api().get("/api/customers/sms/templates").set(bearer(owner));
    expect(afterDelete.body.map((t: { name: string }) => t.name)).toEqual(["Diwali Offer"]);
  });

  it("keeps templates to staff with the Customers permission", async () => {
    const manager = await loginAdmin("manager", "Manager@123");
    expect((await api().get("/api/customers/sms/templates").set(bearer(manager))).status).toBe(403);
  });

  it("only sends a campaign to customers who agreed to receive offers, and records it", async () => {
    await Customer.deleteMany({ restaurantId: world.restaurantId });

    const noOne = await api()
      .post("/api/customers/sms/campaigns")
      .set(bearer(owner))
      .send({ message: "New menu launching this weekend!" });
    expect(noOne.status).toBe(400);
    expect(noOne.body.message).toMatch(/agreed to receive offers/i);

    const orderId = await takeaway([{ foodItemId: world.food.dosa, quantity: 1 }], "98450 22222", "Consented Guest");
    const customer = await lookup("98450 22222");
    await api()
      .put(`/api/customers/${customer._id}`)
      .set(bearer(owner))
      .send({ name: "Consented Guest", birthday: "", anniversary: "", tags: [], marketingConsent: true });
    await pay(orderId);

    const sent = await api()
      .post("/api/customers/sms/campaigns")
      .set(bearer(owner))
      .send({ message: "New menu launching this weekend!" });
    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({ message: "New menu launching this weekend!", recipientCount: 1, sentCount: 0 });

    const history = await api().get("/api/customers/sms/campaigns").set(bearer(owner));
    expect(history.body[0]).toMatchObject({ message: "New menu launching this weekend!", recipientCount: 1 });
  });
});
