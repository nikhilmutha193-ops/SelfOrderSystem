import fs from "fs";
import mongoose from "mongoose";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { connectionInfo } from "../src/config/db";
import Restaurant from "../src/models/Restaurant";
import { describeUri, isMongoUri, maskUri, readDbOverride } from "../src/utils/dbConfig";
import { api, bearer, createWorld, loginAdmin, World } from "./fixtures";

let world: World;
let owner: string;
let manager: string;
let configDir: string;

/** The test database's address with another database name, on the same replica set. */
const otherDb = (name: string) => process.env.MONGO_URI!.replace(/(\/\/[^/]+\/)[^?]*/, `$1${name}`);

beforeAll(async () => {
  configDir = fs.mkdtempSync(path.join(os.tmpdir(), "dbconfig-"));
  process.env.DB_CONFIG_DIR = configDir;
  world = await createWorld();
  owner = await loginAdmin();
  manager = await loginAdmin("manager", "Manager@123");
});

afterAll(() => {
  delete process.env.DB_CONFIG_DIR;
  fs.rmSync(configDir, { recursive: true, force: true });
});

describe("connection string helpers", () => {
  it("recognises, describes and masks addresses", () => {
    expect(isMongoUri("mongodb://u:p@host:27017/db?x=1")).toBe(true);
    expect(isMongoUri("mongodb+srv://u:p@cluster.example.net/db")).toBe(true);
    expect(isMongoUri("http://example.com")).toBe(false);
    expect(describeUri("mongodb://rest:secret@a:1,b:2/shop?rs=1")).toEqual({
      scheme: "mongodb",
      user: "rest",
      hosts: "a:1,b:2",
      database: "shop",
    });
    expect(maskUri("mongodb://rest:secret@a:1/shop")).toBe("mongodb://rest:***@a:1/shop");
  });
});

describe("database connection (owner only)", () => {
  it("shows the running connection without its password", async () => {
    const res = await api().get("/api/db-config").set(bearer(owner));
    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(true);
    expect(res.body.source).toBe("env");
    expect(JSON.stringify(res.body)).not.toMatch(/:[^@/*]+@/);
  });

  it("shows the full connection string only with the owner's password", async () => {
    const info = await api().get("/api/db-config").set(bearer(owner));
    expect(info.body.masked).toBeTruthy();
    expect((await api().post("/api/db-config/reveal").set(bearer(owner)).send({})).status).toBe(400);
    expect((await api().post("/api/db-config/reveal").set(bearer(owner)).send({ password: "nope" })).status).toBe(403);
    expect((await api().post("/api/db-config/reveal").set(bearer(manager)).send({ password: "Manager@123" })).status).toBe(403);
    const ok = await api().post("/api/db-config/reveal").set(bearer(owner)).send({ password: "Owner@123" });
    expect(ok.status).toBe(200);
    expect(ok.body.uri).toBe(process.env.MONGO_URI);
  });

  it("is closed to other admin logins", async () => {
    expect((await api().get("/api/db-config").set(bearer(manager))).status).toBe(403);
    expect(
      (await api().post("/api/db-config/test").set(bearer(manager)).send({ uri: otherDb("x") })).status
    ).toBe(403);
  });

  it("tests an address without changing anything", async () => {
    const ok = await api().post("/api/db-config/test").set(bearer(owner)).send({ uri: process.env.MONGO_URI });
    expect(ok.status).toBe(200);
    expect(ok.body.restaurantFound).toBe(true);
    expect(ok.body.isReplicaSet).toBe(true);

    const empty = await api().post("/api/db-config/test").set(bearer(owner)).send({ uri: otherDb("db_without_restaurant") });
    expect(empty.body.restaurantFound).toBe(false);

    expect((await api().post("/api/db-config/test").set(bearer(owner)).send({ uri: "nonsense" })).status).toBe(400);
  });

  it("needs the password to copy, and refuses to switch to a database without the restaurant", async () => {
    const target = otherDb("copy_target");
    const noPassword = await api().post("/api/db-config/copy").set(bearer(owner)).send({ uri: target, direction: "to" });
    expect(noPassword.status).toBe(400);
    const wrong = await api()
      .post("/api/db-config/copy")
      .set(bearer(owner))
      .send({ uri: target, direction: "to", password: "nope" });
    expect(wrong.status).toBe(403);

    const empty = await api()
      .post("/api/db-config/switch")
      .set(bearer(owner))
      .send({ uri: otherDb("empty_target"), password: "Owner@123" });
    expect(empty.status).toBe(400);
    expect(empty.body.message).toMatch(/no restaurant/);
    expect(connectionInfo()?.source).toBe("env");
    expect(readDbOverride()).toBeNull();
  });

  it("copies the restaurant to another database, switches to it and back", async () => {
    const target = otherDb("copy_target_ok");
    const copy = await api()
      .post("/api/db-config/copy")
      .set(bearer(owner))
      .send({ uri: target, direction: "to", password: "Owner@123" });
    expect(copy.status).toBe(200);
    expect(copy.body.copied.restaurant).toBe(1);
    expect(copy.body.copied.admins).toBeGreaterThanOrEqual(2);
    expect(copy.body.copied.fooditems).toBeGreaterThan(0);

    const again = await api()
      .post("/api/db-config/copy")
      .set(bearer(owner))
      .send({ uri: target, direction: "to", password: "Owner@123" });
    expect(again.status).toBe(409);
    const replaced = await api()
      .post("/api/db-config/copy")
      .set(bearer(owner))
      .send({ uri: target, direction: "to", overwrite: true, password: "Owner@123" });
    expect(replaced.status).toBe(200);

    const switched = await api()
      .post("/api/db-config/switch")
      .set(bearer(owner))
      .send({ uri: target, password: "Owner@123" });
    expect(switched.status).toBe(200);
    expect(connectionInfo()?.source).toBe("admin");
    expect(mongoose.connection.name).toBe("copy_target_ok");
    expect(readDbOverride()).toBe(target);
    // The same login keeps working: the admin account was copied with its id.
    expect((await api().get("/api/db-config").set(bearer(owner))).body.source).toBe("admin");
    expect(await Restaurant.countDocuments({ _id: world.restaurantId })).toBe(1);

    const back = await api().post("/api/db-config/use-env").set(bearer(owner)).send({ password: "Owner@123" });
    expect(back.status).toBe(200);
    expect(connectionInfo()?.source).toBe("env");
    expect(readDbOverride()).toBeNull();
  });

  it("brings a copy of the restaurant from another database", async () => {
    const source = otherDb("copy_source");
    await api().post("/api/db-config/copy").set(bearer(owner)).send({ uri: source, direction: "to", password: "Owner@123" });
    const res = await api()
      .post("/api/db-config/copy")
      .set(bearer(owner))
      .send({ uri: source, direction: "from", overwrite: true, password: "Owner@123" });
    expect(res.status).toBe(200);
    expect(res.body.copied.restaurant).toBe(1);
  });
});
