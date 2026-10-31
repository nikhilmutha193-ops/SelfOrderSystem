import { beforeAll, describe, expect, it } from "vitest";

import { api, bearer, createWorld, loginAdmin } from "./fixtures";

let owner: string;

beforeAll(async () => {
  await createWorld();
  owner = await loginAdmin();
});

const create = (body: object) => api().post("/api/admins").set(bearer(owner)).send(body);
const signIn = (username: string, password: string, area?: string) =>
  api().post("/api/auth/admin/login").send({ username, password, area });

describe("sign-in pages by role", () => {
  it("lets a captain login in only on the captain page", async () => {
    const made = await create({
      username: "cap1",
      password: "Captain@1",
      loginArea: "captain",
      permissions: { captain: "edit", orders: "edit" },
    });
    expect(made.status).toBe(201);
    expect(made.body.loginArea).toBe("captain");

    const ok = await signIn("cap1", "Captain@1", "captain");
    expect(ok.status).toBe(200);
    expect(ok.body.admin.loginArea).toBe("captain");

    const admin = await signIn("cap1", "Captain@1", "admin");
    expect(admin.status).toBe(403);
    expect(admin.body.message).toBe("This login is for the Captain app sign-in page. Please use that page.");
    expect((await signIn("cap1", "Captain@1")).status).toBe(403);
    expect((await signIn("cap1", "Captain@1", "cashier")).status).toBe(403);
  });

  it("lets a cashier login in only on the cashier page", async () => {
    await create({
      username: "cash1",
      password: "Cashier@1",
      loginArea: "cashier",
      permissions: { pos: "edit", orders: "edit" },
    });
    expect((await signIn("cash1", "Cashier@1", "cashier")).status).toBe(200);
    expect((await signIn("cash1", "Cashier@1", "captain")).status).toBe(403);
    expect((await signIn("cash1", "Cashier@1", "admin")).status).toBe(403);
  });

  it("lets admins and the owner use any page, as long as they have its access", async () => {
    expect((await signIn("owner", "Owner@123", "cashier")).status).toBe(200);
    expect((await signIn("owner", "Owner@123", "captain")).status).toBe(200);
    expect((await signIn("owner", "Owner@123", "chef")).status).toBe(200);

    await create({ username: "mgr2", password: "Manager@2", permissions: { pos: "edit", kot: "view" } });
    expect((await signIn("mgr2", "Manager@2")).status).toBe(200);
    expect((await signIn("mgr2", "Manager@2", "cashier")).status).toBe(200);
    expect((await signIn("mgr2", "Manager@2", "chef")).status).toBe(200);
    const noCaptain = await signIn("mgr2", "Manager@2", "captain");
    expect(noCaptain.status).toBe(403);
    expect(noCaptain.body.message).toBe("This login does not have access to the Captain app.");
  });

  it("can move a login to another page, and rejects an unknown one", async () => {
    const made = await create({ username: "mover", password: "Mover@123", permissions: { captain: "edit" } });
    expect((await signIn("mover", "Mover@123", "captain")).status).toBe(200);
    const moved = await api()
      .put(`/api/admins/${made.body.id}/permissions`)
      .set(bearer(owner))
      .send({ permissions: { captain: "edit" }, loginArea: "captain" });
    expect(moved.body.loginArea).toBe("captain");
    expect((await signIn("mover", "Mover@123", "admin")).status).toBe(403);
    expect((await create({ username: "bad", password: "Passw0rd!", loginArea: "waiter" })).status).toBe(400);
  });
});

describe("table sign-in options", () => {
  it("can switch off signing in by PIN and by QR, and the landing page button", async () => {
    const saved = await api()
      .put("/api/tables/settings")
      .set(bearer(owner))
      .send({ showOrderNow: false, allowPinLogin: false, allowQrLogin: false });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ showOrderNow: false, allowPinLogin: false, allowQrLogin: false });
    const pub = await api().get("/api/restaurant/public");
    expect(pub.body.tableLoginSettings).toMatchObject({ showOrderNow: false });

    const pin = await api().post("/api/auth/table/login").send({ code: "tbl1", password: "pass1" });
    expect(pin.status).toBe(403);
    const qr = await api().post("/api/auth/table/login").send({ token: "whatever" });
    expect(qr.status).toBe(403);

    await api()
      .put("/api/tables/settings")
      .set(bearer(owner))
      .send({ showOrderNow: true, allowPinLogin: true, allowQrLogin: true });
    expect((await api().post("/api/auth/table/login").send({ code: "tbl1", password: "pass1" })).status).toBe(200);
  });
});
