import fs from "fs";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import {
  deleteObject,
  ensureStorageFolders,
  getObject,
  objectKey,
  PROOFS_DIR,
  putObject,
  storageBase,
  UPLOADS_DIR,
} from "../src/utils/objectStore";

const created: string[] = [];
afterEach(() => {
  for (const file of created.splice(0)) fs.rmSync(file, { force: true });
  process.env.RESTAURANT_KEY = "resto_test";
});

describe("storage grouped by restaurant key (local disk)", () => {
  it("puts public files under <RESTAURANT_KEY>/<Folder> and serves them from /uploads", async () => {
    expect(storageBase()).toBe("resto_test");
    const { key, url } = await putObject("banner", "store-test.png", Buffer.from("x"), "image/png");
    expect(key).toBe("resto_test/Banner/store-test.png");
    expect(url).toBe("/uploads/resto_test/Banner/store-test.png");
    const file = path.join(UPLOADS_DIR, "resto_test", "Banner", "store-test.png");
    created.push(file);
    expect(fs.existsSync(file)).toBe(true);
    expect((await getObject("banner", "store-test.png")).toString()).toBe("x");
  });

  it("keeps private files under the same base path and finds files saved before it existed", async () => {
    await putObject("proofs", "p-test.png", Buffer.from("new"), "image/png");
    created.push(path.join(PROOFS_DIR, "resto_test", "p-test.png"));
    expect((await getObject("proofs", "p-test.png")).toString()).toBe("new");

    const legacy = path.join(PROOFS_DIR, "old-test.png");
    fs.mkdirSync(PROOFS_DIR, { recursive: true });
    fs.writeFileSync(legacy, "old");
    created.push(legacy);
    expect((await getObject("proofs", "old-test.png")).toString()).toBe("old");
    await deleteObject("proofs", "old-test.png");
    expect(fs.existsSync(legacy)).toBe(false);
  });

  it("ignores a restaurant key that is not safe in a path", () => {
    process.env.RESTAURANT_KEY = "../evil";
    expect(storageBase()).toBe("");
    expect(objectKey("banner", "a.png")).toBe("Banner/a.png");
    process.env.RESTAURANT_KEY = "";
    expect(storageBase()).toBe("");
  });

  it("creates every folder", async () => {
    const { created: made } = await ensureStorageFolders();
    expect(made).toHaveLength(8);
    expect(fs.existsSync(path.join(UPLOADS_DIR, "resto_test", "Product Image"))).toBe(true);
    expect(fs.existsSync(path.join(PROOFS_DIR, "resto_test"))).toBe(true);
  });
});
