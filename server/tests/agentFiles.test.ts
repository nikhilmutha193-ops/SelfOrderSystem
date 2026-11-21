import fs from "fs";
import os from "os";
import path from "path";
import { inflateRawSync } from "zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AGENT_FILES } from "../src/utils/agentFiles.generated";
import { createZip } from "../src/utils/zip";
import { api, bearer, createWorld, loginAdmin } from "./fixtures";

let owner: string;
let tmp: string;

beforeAll(async () => {
  await createWorld();
  owner = await loginAdmin();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agent-"));
});

afterAll(() => {
  delete process.env.PRINT_AGENT_EXE;
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** Reads a stored ZIP back: name -> bytes. */
function readZip(zip: Buffer): Record<string, Buffer> {
  const out: Record<string, Buffer> = {};
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  for (let i = 0; i < count; i++) {
    const method = zip.readUInt16LE(at + 10);
    const size = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const local = zip.readUInt32LE(at + 42);
    const name = zip.subarray(at + 46, at + 46 + nameLength).toString("utf8");
    const dataAt = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const raw = zip.subarray(dataAt, dataAt + size);
    out[name] = method === 8 ? inflateRawSync(raw) : raw;
    at += 46 + nameLength;
  }
  return out;
}

describe("print agent downloads", () => {
  it("embeds the current print-agent files (run `npm run sync:agent` when this fails)", () => {
    const folder = path.join(__dirname, "..", "..", "print-agent");
    for (const [name, content] of Object.entries(AGENT_FILES)) {
      expect(fs.readFileSync(path.join(folder, name), "utf8"), name).toBe(content);
    }
  });

  it("writes a ZIP that reads back unchanged", () => {
    const zip = createZip([
      { name: "a/one.txt", content: "hello" },
      { name: "two.bin", content: Buffer.from([0, 1, 2, 255]) },
    ]);
    const files = readZip(zip);
    expect(files["a/one.txt"].toString()).toBe("hello");
    expect([...files["two.bin"]]).toEqual([0, 1, 2, 255]);
  });

  it("offers the zip and the exe to Printers & Stations", async () => {
    process.env.PRINT_AGENT_EXE = path.join(tmp, "missing.exe");
    const info = await api().get("/api/printing/agent/downloads").set(bearer(owner));
    expect(info.status).toBe(200);
    expect(info.body.zip.sizeBytes).toBeGreaterThan(1000);
    expect(info.body.exe.available).toBe(false);

    const zip = await api()
      .get("/api/printing/agent/download/zip")
      .set(bearer(owner))
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => done(null, Buffer.concat(chunks)));
      });
    expect(zip.status).toBe(200);
    expect(zip.headers["content-disposition"]).toContain("print-agent.zip");
    expect(Object.keys(readZip(zip.body as Buffer))).toContain("print-agent/agent.js");
  });

  it("serves PrintAgent.exe once it is on the server, and says so when it is not", async () => {
    process.env.PRINT_AGENT_EXE = path.join(tmp, "PrintAgent.exe");
    const missing = await api().get("/api/printing/agent/download/exe").set(bearer(owner));
    expect(missing.status).toBe(404);
    expect(missing.body.message).toMatch(/PrintAgent\.exe/);

    fs.writeFileSync(process.env.PRINT_AGENT_EXE, "MZ-fake-exe");
    const info = await api().get("/api/printing/agent/downloads").set(bearer(owner));
    expect(info.body.exe).toMatchObject({ available: true, sizeBytes: 11 });
    const exe = await api().get("/api/printing/agent/download/exe").set(bearer(owner));
    expect(exe.status).toBe(200);
    expect(exe.headers["content-disposition"]).toContain("PrintAgent.exe");

    // The page offers the exe inside a zip with its scripts, which browsers do not block.
    const app = await api()
      .get("/api/printing/agent/download/app")
      .set(bearer(owner))
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => done(null, Buffer.concat(chunks)));
      });
    expect(app.status).toBe(200);
    expect(app.headers["content-disposition"]).toContain("PrintAgent.zip");
    const files = readZip(app.body as Buffer);
    expect(files["PrintAgent/PrintAgent.exe"].toString()).toBe("MZ-fake-exe");
    // Just the exe and this site's address (the window opens with it filled in): no scripts to run.
    expect(Object.keys(files).sort()).toEqual(["PrintAgent/PrintAgent.exe", "PrintAgent/server.txt"]);
    expect(files["PrintAgent/server.txt"].toString().trim()).toMatch(/^https?:\/\/127\.0\.0\.1:\d+$/);
  });

  it("hands the download to the browser through a short-lived link", async () => {
    process.env.PRINT_AGENT_EXE = path.join(tmp, "PrintAgent.exe");
    fs.writeFileSync(process.env.PRINT_AGENT_EXE, "MZ-fake-exe");

    expect((await api().post("/api/printing/agent/download-link").send({ kind: "app" })).status).toBe(401);
    expect((await api().post("/api/printing/agent/download-link").set(bearer(owner)).send({ kind: "exe" })).status).toBe(400);

    const link = await api().post("/api/printing/agent/download-link").set(bearer(owner)).send({ kind: "app" });
    expect(link.status).toBe(200);
    expect(link.body.url).toMatch(/^\/printing\/agent\/file\/app\?token=/);

    // No Authorization header: the link itself is the login.
    const file = await api()
      .get(`/api${link.body.url}`)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => done(null, Buffer.concat(chunks)));
      });
    expect(file.status).toBe(200);
    expect(file.headers["content-disposition"]).toContain("PrintAgent.zip");
    expect(readZip(file.body as Buffer)["PrintAgent/PrintAgent.exe"].toString()).toBe("MZ-fake-exe");

    // A link for one file is not good for the other, and a made-up token is refused.
    const token = link.body.url.split("token=")[1];
    expect((await api().get(`/api/printing/agent/file/zip?token=${token}`)).status).toBe(403);
    expect((await api().get("/api/printing/agent/file/app?token=nonsense")).status).toBe(403);
    expect((await api().get("/api/printing/agent/file/app")).status).toBe(403);
  });

  it("is closed to anyone not signed in", async () => {
    expect((await api().get("/api/printing/agent/download/zip")).status).toBe(401);
  });
});
