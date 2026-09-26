import { beforeAll, describe, expect, it } from "vitest";

import { nowSeconds, signToken } from "../src/utils/jwt";
import { api, bearer, createWorld, decodeToken, loginAdmin, loginChef, World } from "./fixtures";

let world: World;
let owner: string;

beforeAll(async () => {
  world = await createWorld();
  owner = await loginAdmin();
});

const queue = (token: string) => api().get("/api/orders/kot/queue").set(bearer(token));

describe("staff token lifetime", () => {
  it("gives normal logins an 8 hour token and kitchen displays a 7 day token", async () => {
    const normal = decodeToken(await loginChef());
    const device = decodeToken(await loginChef(true));
    expect(Number(normal.exp) - Number(normal.iat)).toBe(8 * 60 * 60);
    expect(Number(device.exp) - Number(device.iat)).toBe(7 * 24 * 60 * 60);
    expect(device.dev).toBe(true);
  });

  it("refreshes a session with a new token that keeps the original start time", async () => {
    const token = await loginAdmin();
    const res = await api().post("/api/auth/refresh").set(bearer(token));
    expect(res.status).toBe(200);
    expect(decodeToken(res.body.token).sst).toBe(decodeToken(token).sst);
    expect((await queue(res.body.token)).status).toBe(200);
  });

  it("refuses to refresh a staff session older than 24 hours", async () => {
    const stale = signToken({
      role: "chef",
      restaurantId: world.restaurantId,
      id: world.chefId,
      tv: 0,
      sst: nowSeconds() - 25 * 60 * 60,
    });
    const res = await api().post("/api/auth/refresh").set(bearer(stale));
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Your session has ended. Please sign in again.");
  });

  it("still accepts tokens issued before token versions existed", async () => {
    const legacy = signToken({ role: "chef", restaurantId: world.restaurantId, id: world.chefId });
    expect((await queue(legacy)).status).toBe(200);
  });
});

describe("ending sessions", () => {
  it("signs a chef out everywhere when their password is changed", async () => {
    const chef = await loginChef(true);
    expect((await queue(chef)).status).toBe(200);

    await api().put(`/api/chefs/${world.chefId}`).set(bearer(owner)).send({ password: "NewChef@1" });

    const after = await queue(chef);
    expect(after.status).toBe(401);
    expect(after.body.message).toBe("Your session has ended. Please sign in again.");
  });

  it("signs an admin out when the owner resets their password", async () => {
    const manager = await loginAdmin("manager", "Manager@123");
    await api().put(`/api/admins/${world.managerId}/password`).set(bearer(owner)).send({ newPassword: "Reset@123" });
    expect((await api().get("/api/orders").set(bearer(manager))).status).toBe(401);
    expect(
      (
        await api()
          .get("/api/orders")
          .set(bearer(await loginAdmin("manager", "Reset@123")))
      ).status
    ).toBe(200);
  });

  it("keeps the current device signed in after changing your own password", async () => {
    const otherDevice = await loginAdmin("manager", "Reset@123");
    const thisDevice = await loginAdmin("manager", "Reset@123");
    const res = await api()
      .post("/api/auth/admin/change-password")
      .set(bearer(thisDevice))
      .send({ oldPassword: "Reset@123", newPassword: "Changed@123" });
    expect(res.status).toBe(200);
    expect((await api().get("/api/orders").set(bearer(res.body.token))).status).toBe(200);
    expect((await api().get("/api/orders").set(bearer(otherDevice))).status).toBe(401);
  });

  it("rejects the token of a deleted account", async () => {
    const created = await api()
      .post("/api/chefs")
      .set(bearer(owner))
      .send({ username: "tempchef", password: "Temp@123" });
    const login = await api().post("/api/auth/chef/login").send({ username: "tempchef", password: "Temp@123" });
    const removed = await api().delete(`/api/chefs/${created.body.id}`).set(bearer(owner));
    expect(removed.status).toBe(200);

    const res = await queue(login.body.token);
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("This account no longer exists");
  });
});
