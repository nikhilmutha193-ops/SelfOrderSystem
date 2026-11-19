import { beforeEach, describe, expect, it, vi } from "vitest";

const sent = vi.hoisted(() => [] as { type: string; bucket: string; key: string }[]);
const missing = vi.hoisted(() => ({ keys: new Set<string>() }));

vi.mock("../src/config/r2", () => ({
  getR2: () => ({
    bucket: "public-bucket",
    privateBucket: "private-bucket",
    publicBaseUrl: "https://cdn.example.com",
    client: {
      send: async (command: { constructor: { name: string }; input: { Bucket: string; Key: string } }) => {
        sent.push({ type: command.constructor.name, bucket: command.input.Bucket, key: command.input.Key });
        if (command.constructor.name === "GetObjectCommand") {
          if (missing.keys.has(command.input.Key)) throw Object.assign(new Error("missing"), { name: "NoSuchKey" });
          return { Body: { transformToByteArray: async () => new Uint8Array([104, 105]) } };
        }
        return {};
      },
    },
  }),
}));

import { deleteObject, ensureStorageFolders, getObject, putObject } from "../src/utils/objectStore";

beforeEach(() => {
  sent.length = 0;
  missing.keys.clear();
});

describe("storage grouped by restaurant key (Cloudflare R2)", () => {
  it("writes public files to <RESTAURANT_KEY>/<Folder>/ in the public bucket and returns the public URL", async () => {
    const { key, url } = await putObject("product", "dish one.jpg", Buffer.from("x"), "image/jpeg");
    expect(key).toBe("resto_test/Product Image/dish one.jpg");
    expect(url).toBe("https://cdn.example.com/resto_test/Product%20Image/dish%20one.jpg");
    expect(sent[0]).toMatchObject({ type: "PutObjectCommand", bucket: "public-bucket", key });
  });

  it("writes private files to the private bucket, with no public URL", async () => {
    const { url } = await putObject("invoices", "a/b.pdf", Buffer.from("x"), "application/pdf");
    expect(url).toBeNull();
    expect(sent[0]).toMatchObject({ bucket: "private-bucket", key: "resto_test/Invoices/a/b.pdf" });
  });

  it("falls back to the old key for a file saved before the base path existed", async () => {
    missing.keys.add("resto_test/Invoices/old.pdf");
    expect((await getObject("invoices", "old.pdf")).toString()).toBe("hi");
    expect(sent.map((s) => s.key)).toEqual(["resto_test/Invoices/old.pdf", "Invoices/old.pdf"]);
    sent.length = 0;
    await deleteObject("invoices", "old.pdf");
    expect(sent.map((s) => s.key)).toEqual(["resto_test/Invoices/old.pdf", "Invoices/old.pdf"]);
  });

  it("creates a folder marker for every folder, in the right bucket", async () => {
    await ensureStorageFolders();
    const puts = sent.filter((s) => s.type === "PutObjectCommand").map((s) => `${s.bucket}:${s.key}`);
    expect(puts).toEqual(
      expect.arrayContaining([
        "public-bucket:resto_test/Banner/",
        "public-bucket:resto_test/Logo/",
        "public-bucket:resto_test/Product Image/",
        "public-bucket:resto_test/Team/",
        "public-bucket:resto_test/Awards/",
        "private-bucket:resto_test/Invoices/",
        "private-bucket:resto_test/Backups/",
        "private-bucket:resto_test/PaymentProofs/",
      ])
    );
    expect(puts).toHaveLength(8);
  });
});
