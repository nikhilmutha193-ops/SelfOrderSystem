import { beforeAll, describe, expect, it } from "vitest";

import { api, bearer, createWorld, loginAdmin } from "./fixtures";

let owner: string;

beforeAll(async () => {
  await createWorld();
  owner = await loginAdmin();
});

const save = (nameStyle: unknown) => api().put("/api/restaurant/settings").set(bearer(owner)).send({ nameStyle });

describe("the restaurant name written in several styles", () => {
  it("starts with the plain name, then keeps the styled pieces in order for the public pages", async () => {
    const start = await api().get("/api/restaurant/public");
    expect(start.body.nameStyle ?? []).toEqual([]);

    const res = await save([
      { text: "Benne", font: "classic", bold: true, italic: false, color: "#C4602F", size: 140 },
      { text: ".Kaffi", font: "script", bold: false, italic: true, color: "" },
    ]);
    expect(res.status).toBe(200);

    const pub = await api().get("/api/restaurant/public");
    expect(pub.body.nameStyle).toEqual([
      { text: "Benne", font: "classic", bold: true, italic: false, color: "#c4602f", size: 140 },
      { text: ".Kaffi", font: "script", bold: false, italic: true, color: "", size: 100 },
    ]);
    // The landing page, the feedback page and the settings page get it too, and the plain name is untouched.
    expect((await api().get("/api/landing")).body.restaurant.nameStyle).toHaveLength(2);
    expect((await api().get("/api/reviews/public/info")).body.nameStyle).toHaveLength(2);
    expect((await api().get("/api/restaurant/settings").set(bearer(owner))).body.nameStyle).toHaveLength(2);
    expect(pub.body.name).toBeTruthy();
  });

  it("refuses an empty piece, an unknown font, a bad colour and too many pieces, and can be cleared", async () => {
    expect((await save([{ text: "", font: "heading" }])).status).toBe(400);
    expect((await save([{ text: "A", font: "comic" }])).status).toBe(400);
    expect((await save([{ text: "A", font: "heading", color: "red" }])).status).toBe(400);
    expect((await save(Array.from({ length: 9 }, () => ({ text: "A", font: "heading" })))).status).toBe(400);
    expect((await save("Benne")).status).toBe(400);
    expect((await save([{ text: "A", font: "heading", size: 10 }])).status).toBe(400);
    expect((await save([{ text: "A", font: "heading", size: 500 }])).status).toBe(400);

    expect((await save([])).status).toBe(200);
    expect((await api().get("/api/restaurant/public")).body.nameStyle).toEqual([]);
  });
});
