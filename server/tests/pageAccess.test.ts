import { beforeAll, describe, expect, it } from "vitest";

import { api, bearer, createWorld, loginAdmin, World } from "./fixtures";

let world: World;
let owner: string;

beforeAll(async () => {
  world = await createWorld();
  owner = await loginAdmin();
});

const me = async (token: string) => (await api().get("/api/auth/admin/me").set(bearer(token))).body.permissions;

describe("page access for pages that used to share another module", () => {
  it("lists the new pages as modules", async () => {
    const modules = (await api().get("/api/admins/modules").set(bearer(owner))).body;
    expect(Object.keys(modules)).toEqual(expect.arrayContaining(["pos", "captain", "invoices", "qrCodes", "banners"]));
  });

  it("lets a login saved before they existed keep its pages through the parent module", async () => {
    const manager = await loginAdmin("manager", "Manager@123");
    expect(await me(manager)).toMatchObject({ orders: "edit", pos: "edit", captain: "edit", invoices: "edit" });
    expect((await me(manager)).banners).toBeUndefined();
  });

  it("makes every level explicit once access is saved, so a page can be taken away", async () => {
    const manager = await loginAdmin("manager", "Manager@123");
    const saved = await api()
      .put(`/api/admins/${world.managerId}/permissions`)
      .set(bearer(owner))
      .send({ permissions: { orders: "edit", captain: "edit" } });
    expect(saved.status).toBe(200);
    const permissions = await me(manager);
    expect(permissions).toMatchObject({ orders: "edit", captain: "edit" });
    expect(permissions.pos).toBeUndefined();
    expect(permissions.invoices).toBeUndefined();
  });
});
