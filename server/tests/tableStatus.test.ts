import { beforeAll, describe, expect, it } from "vitest";

import TableModel from "../src/models/Table";
import { allowedTableStatuses } from "../src/utils/tableStatus";
import { api, bearer, createWorld, loginAdmin, seatTable, World } from "./fixtures";

let world: World;
let owner: string;

beforeAll(async () => {
  world = await createWorld();
  owner = await loginAdmin();
});

const setStatus = (tableId: string, status: string) =>
  api().patch(`/api/tables/${tableId}/status`).set(bearer(owner)).send({ status });
const listed = async (tableId: string) =>
  (await api().get("/api/tables").set(bearer(owner))).body.find((t: { _id: string }) => t._id === tableId);

describe("allowed table statuses", () => {
  it("only offers changes that match what is on the table", () => {
    expect(allowedTableStatuses({ status: "available" }, 0)).toEqual(["occupied"]);
    expect(allowedTableStatuses({ status: "occupied" }, 0)).toEqual(["available"]);
    expect(allowedTableStatuses({ status: "occupied" }, 1)).toEqual(["available", "awaiting_payment"]);
    expect(allowedTableStatuses({ status: "occupied" }, 1, { cafe: true })).toEqual(["available"]);
    expect(allowedTableStatuses({ status: "awaiting_payment" }, 1)).toEqual(["available", "occupied"]);
    expect(allowedTableStatuses({ status: "awaiting_payment" }, 0)).toEqual(["available"]);
    expect(allowedTableStatuses({ status: "available", isGuest: true }, 0)).toEqual([]);
  });

  it("lists them with each table and applies an allowed change", async () => {
    const tableId = world.tableIds[3] ?? world.tableIds[0];
    await TableModel.updateOne({ _id: tableId }, { $set: { status: "available" }, $unset: { sessionId: "" } });
    expect((await listed(tableId)).allowedStatuses).toEqual(["occupied"]);

    const held = await setStatus(tableId, "occupied");
    expect(held.status).toBe(200);
    expect(held.body.status).toBe("occupied");
    expect((await listed(tableId)).allowedStatuses).toEqual(["available"]);

    const refused = await setStatus(tableId, "awaiting_payment");
    expect(refused.status).toBe(409);

    const freed = await setStatus(tableId, "available");
    expect(freed.status).toBe(200);
    expect(freed.body.status).toBe("available");
  });

  it("keeps a table with an unpaid order out of Free by itself, and lets it move to Waiting to pay", async () => {
    const seat = await seatTable(2);
    const tableId = world.tableIds[1];
    expect((await listed(tableId)).allowedStatuses).toEqual(["available", "awaiting_payment"]);
    const waiting = await setStatus(tableId, "awaiting_payment");
    expect(waiting.status).toBe(200);
    expect(waiting.body.status).toBe("awaiting_payment");
    expect((await setStatus(tableId, "occupied")).status).toBe(200);
    expect(seat.orderId).toBeTruthy();
  });
});
