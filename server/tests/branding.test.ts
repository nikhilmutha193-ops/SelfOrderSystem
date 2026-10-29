import { beforeAll, describe, expect, it } from "vitest";

import { api, bearer, createWorld, loginAdmin } from "./fixtures";

let owner: string;

beforeAll(async () => {
  await createWorld();
  owner = await loginAdmin();
});

describe("brand colour", () => {
  it("defaults to none, saves a hex colour and shows it to guests", async () => {
    expect((await api().get("/api/restaurant/public")).body.brandColor).toBe("");

    const saved = await api().put("/api/restaurant/settings").set(bearer(owner)).send({ brandColor: "#1D4ED8" });
    expect(saved.status).toBe(200);
    expect(saved.body.brandColor).toBe("#1d4ed8");
    expect((await api().get("/api/restaurant/public")).body.brandColor).toBe("#1d4ed8");
  });

  it("refuses anything that is not a six-digit hex colour", async () => {
    for (const brandColor of ["blue", "#12345", "#1234567", "1d4ed8", "#gggggg"]) {
      const res = await api().put("/api/restaurant/settings").set(bearer(owner)).send({ brandColor });
      expect(res.status, brandColor).toBe(400);
      expect(res.body.message).toBe("Brand colour must be a hex colour like #c4602f");
    }
  });

  it("goes back to the built-in colour when cleared", async () => {
    const res = await api().put("/api/restaurant/settings").set(bearer(owner)).send({ brandColor: "" });
    expect(res.status).toBe(200);
    expect((await api().get("/api/restaurant/public")).body.brandColor).toBe("");
  });
});
