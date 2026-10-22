import { beforeAll, describe, expect, it } from "vitest";

import TableModel from "../src/models/Table";
import { api, bearer, createWorld, loginAdmin, World } from "./fixtures";

let world: World;
let owner: string;
let guestTableId: string;

beforeAll(async () => {
  world = await createWorld();
  owner = await loginAdmin();
  const created = await TableModel.create({
    restaurantId: world.restaurantId,
    code: "walkin",
    passwordHash: "x",
    password: "x",
    isGuest: true,
    status: "available",
  });
  guestTableId = created._id.toString();
});

describe("guest tables on the POS floor", () => {
  it("lists the guest table, flagged as a guest table", async () => {
    const floor = await api().get("/api/pos/floor").set(bearer(owner));
    const guest = floor.body.tables.find((t: { code: string }) => t.code === "walkin");
    expect(guest).toMatchObject({ isGuest: true, orders: [] });
    expect(floor.body.tables.find((t: { code: string }) => t.code === "tbl1")).toMatchObject({ isGuest: false });
  });

  it("runs several orders on it at once", async () => {
    const line = [{ foodItemId: world.food.dosa, quantity: 1 }];
    for (const name of ["Asha", "Ravi"]) {
      const res = await api()
        .post("/api/pos/orders")
        .set(bearer(owner))
        .send({ orderType: "dine-in", tableId: guestTableId, customerName: name, items: line });
      expect(res.status).toBe(201);
    }
    const floor = await api().get("/api/pos/floor").set(bearer(owner));
    const guest = floor.body.tables.find((t: { code: string }) => t.code === "walkin");
    expect(guest.orders.map((o: { customerName: string }) => o.customerName).sort()).toEqual(["Asha", "Ravi"]);
    expect(guest.status).toBe("available");
  });
});

describe("switching a table between normal and guest", () => {
  const kind = (id: string, isGuest: boolean) => api().put(`/api/tables/${id}`).set(bearer(owner)).send({ isGuest });

  it("turns a free normal table into a guest table and back", async () => {
    const id = world.tableIds[0];
    const toGuest = await kind(id, true);
    expect(toGuest.status).toBe(200);
    expect(toGuest.body).toMatchObject({ isGuest: true, status: "available" });
    const back = await kind(id, false);
    expect(back.body.isGuest).toBe(false);
  });

  it("refuses while the table has a seated guest or a running order", async () => {
    await TableModel.updateOne({ _id: world.tableIds[1] }, { status: "occupied" });
    const seated = await kind(world.tableIds[1], true);
    expect(seated.status).toBe(409);

    const running = await kind(guestTableId, false);
    expect(running.status).toBe(409);
    expect((await TableModel.findById(guestTableId))!.isGuest).toBe(true);
  });
});
