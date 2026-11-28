import { beforeAll, describe, expect, it } from "vitest";

import { api, bearer, createWorld, loginAdmin } from "./fixtures";

let owner: string;

beforeAll(async () => {
  await createWorld();
  owner = await loginAdmin();
});

const save = (body: object) => api().put("/api/restaurant/landing-content").set(bearer(owner)).send(body);

describe("landing page search tags and embed codes", () => {
  it("saves the title, description and keywords and serves them to the public page", async () => {
    const res = await save({
      seo: { title: "  Benne Kaffi - Filter Coffee  ", description: "Pure veg\n breakfast", keywords: "coffee, idli", imageUrl: "", structuredData: false },
    });
    expect(res.status).toBe(200);
    const seo = (await api().get("/api/landing")).body.content.seo;
    expect(seo).toMatchObject({ title: "Benne Kaffi - Filter Coffee", description: "Pure veg breakfast", keywords: "coffee, idli", structuredData: false });
    expect((await save({ seo: { title: "x".repeat(71) } })).status).toBe(400);
    expect((await save({ seo: { imageUrl: "javascript:alert(1)" } })).status).toBe(400);
  });

  it("keeps embed codes with their place, and limits their number and size", async () => {
    const items = [
      { name: "Map", code: '<iframe src="https://www.google.com/maps/embed?pb=1"></iframe>', position: "page", visible: true },
      { name: "Analytics", code: "<script>window.x=1</script>", position: "head", visible: false },
      { name: "Odd", code: "<b>hi</b>", position: "somewhere", visible: true },
    ];
    expect((await save({ embed: { items } })).status).toBe(200);
    const got = (await api().get("/api/landing")).body.content.embed.items;
    expect(got.map((i: { position: string }) => i.position)).toEqual(["page", "head", "page"]);
    expect(got[1].visible).toBe(false);
    expect((await save({ embed: { items: Array.from({ length: 11 }, () => items[0]) } })).status).toBe(400);
    expect((await save({ embed: { items: [{ name: "Big", code: "x".repeat(20001) }] } })).status).toBe(400);
    expect((await save({ embed: { items: [] } })).status).toBe(200);
  });

  it("serves the tags as head HTML for the web server to put into the first page", async () => {
    await save({ seo: { title: 'Benne <Kaffi> "Coffee"', description: "Pure veg", keywords: "coffee, idli", imageUrl: "/uploads/x.png", structuredData: true } });
    const res = await api().get("/api/landing/seo-head");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.text).toContain("<title>Benne &lt;Kaffi&gt; &quot;Coffee&quot;</title>");
    expect(res.text).toContain('<meta name="keywords" content="coffee, idli" />');
    expect(res.text).toContain('property="og:image" content="http');
    expect(res.text).toContain("application/ld+json");
    expect(res.text).not.toContain("<Kaffi>");
    await save({ seo: { title: "", description: "", keywords: "", imageUrl: "" } });
    expect((await api().get("/api/landing/seo-head")).text).toMatch(/^<title>.+<\/title>/);
  });
});
