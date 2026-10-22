import { beforeAll, describe, expect, it } from "vitest";

import AuditLog from "../src/models/AuditLog";
import { api, bearer, createWorld, loginAdmin, World } from "./fixtures";

let world: World;
let owner: string;

beforeAll(async () => {
  world = await createWorld();
  owner = await loginAdmin();
});

const adminId = async (username: string) => {
  const list = await api().get("/api/admins").set(bearer(owner));
  return (list.body as { id: string; username: string }[]).find((a) => a.username === username)!.id;
};

describe("resetting another admin's password", () => {
  it("lets the owner set a new password and signs the other person out", async () => {
    const manager = await loginAdmin("manager", "Manager@123");
    const id = await adminId("manager");

    const short = await api().put(`/api/admins/${id}/password`).set(bearer(owner)).send({ newPassword: "abc" });
    expect(short.status).toBe(400);

    const reset = await api().put(`/api/admins/${id}/password`).set(bearer(owner)).send({ newPassword: "Fresh#2026" });
    expect(reset.status).toBe(200);

    expect((await api().get("/api/auth/admin/me").set(bearer(manager))).status).toBe(401);
    expect(
      (await api().post("/api/auth/admin/login").send({ username: "manager", password: "Manager@123" })).status,
    ).toBe(401);
    expect(await loginAdmin("manager", "Fresh#2026")).toBeTruthy();

    const audit = await AuditLog.findOne({ restaurantId: world.restaurantId, action: "admin.resetPassword" });
    expect(audit?.summary).toContain("manager");
  });

  it("does not let a non-owner reset the owner's password", async () => {
    const created = await api()
      .post("/api/admins")
      .set(bearer(owner))
      .send({ username: "deputy", password: "Deputy@123", permissions: { admins: "edit" } });
    expect(created.status).toBe(201);
    const deputy = await loginAdmin("deputy", "Deputy@123");

    const ownerId = await adminId("owner");
    const blocked = await api()
      .put(`/api/admins/${ownerId}/password`)
      .set(bearer(deputy))
      .send({ newPassword: "Takeover1" });
    expect(blocked.status).toBe(403);
    expect(await loginAdmin("owner", "Owner@123")).toBeTruthy();
  });
});
