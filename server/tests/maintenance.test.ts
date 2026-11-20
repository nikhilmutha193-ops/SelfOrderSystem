import { beforeAll, describe, expect, it } from "vitest";

import { clearMaintenanceCache } from "../src/middleware/maintenance";
import { api, bearer, createWorld, loginAdmin, loginChef } from "./fixtures";

let owner: string;
let manager: string;
let chef: string;

beforeAll(async () => {
  await createWorld();
  owner = await loginAdmin();
  manager = await loginAdmin("manager", "Manager@123");
  chef = await loginChef();
});

const settings = (over: Record<string, unknown> = {}) => ({
  enabled: true,
  title: "Back soon",
  message: "Upgrading our systems",
  imageUrl: "",
  startAt: null,
  endAt: null,
  ...over,
});

const save = (body: Record<string, unknown>, token = owner) =>
  api().put("/api/maintenance/settings").set(bearer(token)).send(body);

const hours = (n: number) => new Date(Date.now() + n * 3600 * 1000).toISOString();

describe("maintenance mode", () => {
  it("is off by default and the public site works", async () => {
    expect((await api().get("/api/maintenance")).body.active).toBe(false);
    expect((await api().get("/api/landing")).status).toBe(200);
  });

  it("can only be managed by the owner", async () => {
    expect((await save(settings(), manager)).status).toBe(403);
    expect((await api().get("/api/maintenance/settings").set(bearer(manager))).status).toBe(403);
    expect((await api().put("/api/maintenance/settings").send(settings())).status).toBe(401);
  });

  it("checks what it is given", async () => {
    expect((await save(settings({ title: " " }))).status).toBe(400);
    expect((await save(settings({ startAt: hours(2), endAt: hours(1) }))).status).toBe(400);
    expect((await save(settings({ startAt: "not a date" }))).status).toBe(400);
    expect((await save(settings({ imageUrl: "http://example.com/a.png" }))).status).toBe(400);
    expect((await save({ ...settings(), enabled: "yes" })).status).toBe(400);
  });

  it("closes the site for everyone but admins while it is on", async () => {
    const res = await save(settings({ imageUrl: "/uploads/test/Banner/maintenance.png", endAt: hours(2) }));
    expect(res.status).toBe(200);
    expect(res.body.active).toBe(true);

    const status = await api().get("/api/maintenance");
    expect(status.body.active).toBe(true);
    expect(status.body.imageUrl).toBe("/uploads/test/Banner/maintenance.png");
    expect(status.body.title).toBe("Back soon");
    expect(status.body.endAt).toBeTruthy();

    const blocked = await api().get("/api/landing");
    expect(blocked.status).toBe(503);
    expect(blocked.body.maintenance).toBe(true);
    expect(blocked.headers["retry-after"]).toBeTruthy();
    // A kitchen login is staff but not an admin, so it is held back too.
    expect((await api().get("/api/orders/kot/queue").set(bearer(chef))).status).toBe(503);

    // Admins keep working, and can still sign in.
    expect((await api().get("/api/maintenance/settings").set(bearer(owner))).status).toBe(200);
    expect((await api().get("/api/orders").set(bearer(manager))).status).toBe(200);
    const login = await api().post("/api/auth/admin/login").send({ username: "owner", password: "Owner@123", area: "admin" });
    expect(login.status).toBe(200);
  });

  it("opens again when switched off", async () => {
    expect((await save(settings({ enabled: false }))).status).toBe(200);
    expect((await api().get("/api/maintenance")).body.active).toBe(false);
    expect((await api().get("/api/landing")).status).toBe(200);
  });

  it("only applies inside its time window", async () => {
    await save(settings({ startAt: hours(1), endAt: hours(3) }));
    expect((await api().get("/api/maintenance")).body.active).toBe(false);
    expect((await api().get("/api/landing")).status).toBe(200);

    await save(settings({ startAt: hours(-3), endAt: hours(-1) }));
    expect((await api().get("/api/maintenance")).body.active).toBe(false);

    await save(settings({ startAt: hours(-1), endAt: hours(1) }));
    expect((await api().get("/api/maintenance")).body.active).toBe(true);
    expect((await api().get("/api/landing")).status).toBe(503);

    await save(settings({ enabled: false }));
    clearMaintenanceCache();
  });
});
