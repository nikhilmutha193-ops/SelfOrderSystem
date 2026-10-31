import { beforeAll, describe, expect, it } from "vitest";

import { api, bearer, createWorld, loginAdmin } from "./fixtures";

let owner: string;

beforeAll(async () => {
  await createWorld();
  owner = await loginAdmin();
});

const slides = [
  { url: "/uploads/banner/a.jpg", caption: "Lunch combo" },
  { url: "https://example.com/b.jpg", seconds: 20 },
];

describe("display slideshows", () => {
  it("creates displays that each keep their own images", async () => {
    const entrance = await api()
      .post("/api/displays")
      .set(bearer(owner))
      .send({ name: "Entrance", slides });
    expect(entrance.status).toBe(201);
    expect(entrance.body.code).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(entrance.body).toMatchObject({
      intervalSeconds: 8,
      transition: "fade",
      fit: "cover",
      active: true,
    });

    const counter = await api()
      .post("/api/displays")
      .set(bearer(owner))
      .send({ name: "Counter", slides: [slides[0]] });
    expect(counter.status).toBe(201);
    expect(counter.body.code).not.toBe(entrance.body.code);

    const list = await api().get("/api/displays").set(bearer(owner));
    expect(
      list.body.map((d: { name: string; slides: unknown[] }) => [
        d.name,
        d.slides.length,
      ]),
    ).toEqual([
      ["Counter", 1],
      ["Entrance", 2],
    ]);

    expect(
      (
        await api()
          .post("/api/displays")
          .set(bearer(owner))
          .send({ name: "entrance" })
      ).status,
    ).toBeLessThan(500);
    expect(
      (
        await api()
          .post("/api/displays")
          .set(bearer(owner))
          .send({ name: "Entrance" })
      ).status,
    ).toBe(409);
  });

  it("checks the slides and settings", async () => {
    const post = (body: object) =>
      api().post("/api/displays").set(bearer(owner)).send(body);
    expect((await post({ name: "" })).status).toBe(400);
    expect(
      (
        await post({
          name: "Bad",
          slides: [{ url: "http://example.com/x.jpg" }],
        })
      ).status,
    ).toBe(400);
    expect(
      (await post({ name: "Bad", slides: [{ url: "/etc/passwd" }] })).status,
    ).toBe(400);
    expect((await post({ name: "Bad", intervalSeconds: 1 })).status).toBe(400);
    expect((await post({ name: "Bad", transition: "spin" })).status).toBe(400);
  });

  it("serves a screen by its secret code, without a login and without internals", async () => {
    const made = await api()
      .post("/api/displays")
      .set(bearer(owner))
      .send({ name: "Window", slides, intervalSeconds: 5 });
    const code = made.body.code as string;

    const shown = await api().get(`/api/displays/public/${code}`);
    expect(shown.status).toBe(200);
    expect(shown.body.slides).toEqual([
      { url: "/uploads/banner/a.jpg", caption: "Lunch combo", seconds: 5 },
      { url: "https://example.com/b.jpg", caption: "", seconds: 20 },
    ]);
    expect(shown.body).not.toHaveProperty("restaurantId");
    expect(shown.body).not.toHaveProperty("code");

    expect(
      (await api().get("/api/displays/public/not-a-real-code-1234")).status,
    ).toBe(404);
    expect((await api().get("/api/displays/public/short")).status).toBe(404);

    await api()
      .put(`/api/displays/${made.body._id}`)
      .set(bearer(owner))
      .send({ active: false });
    expect((await api().get(`/api/displays/public/${code}`)).status).toBe(404);
  });

  it("changes a link, and removes a display, for staff with access only", async () => {
    const made = await api()
      .post("/api/displays")
      .set(bearer(owner))
      .send({ name: "Patio", slides });
    const old = made.body.code as string;

    const renewed = await api()
      .post(`/api/displays/${made.body._id}/renew`)
      .set(bearer(owner));
    expect(renewed.status).toBe(200);
    expect(renewed.body.code).not.toBe(old);
    expect((await api().get(`/api/displays/public/${old}`)).status).toBe(404);
    expect(
      (await api().get(`/api/displays/public/${renewed.body.code}`)).status,
    ).toBe(200);

    expect((await api().get("/api/displays")).status).toBe(401);
    expect((await api().delete(`/api/displays/${made.body._id}`)).status).toBe(
      401,
    );

    expect(
      (await api().delete(`/api/displays/${made.body._id}`).set(bearer(owner)))
        .status,
    ).toBe(204);
    expect(
      (await api().delete(`/api/displays/${made.body._id}`).set(bearer(owner)))
        .status,
    ).toBe(404);
  });
});
