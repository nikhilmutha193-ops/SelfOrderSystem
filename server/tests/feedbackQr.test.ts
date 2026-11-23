import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../src/utils/googleReviews", () => ({
  getGoogleReviews: vi.fn(async () => [
    { author: "Ravi K", rating: 5, text: "Lovely filter coffee", relativeDate: "2 weeks ago" },
    { author: "Meena", rating: 4, text: "Crisp dosas", relativeDate: "a month ago" },
  ]),
}));

import { api, bearer, createWorld, loginAdmin } from "./fixtures";

let owner: string;

beforeAll(async () => {
  await createWorld();
  owner = await loginAdmin();
});

const publicFeedback = (body: object) => api().post("/api/reviews/public").send(body);
const reviews = async () => (await api().get("/api/reviews").set(bearer(owner))).body as {
  _id: string;
  customerName: string;
  source: string;
  isApproved: boolean;
}[];

describe("the feedback QR (public feedback without a table sign-in)", () => {
  it("shows the restaurant on the page and takes feedback from anyone, waiting for approval", async () => {
    const info = await api().get("/api/reviews/public/info");
    expect(info.status).toBe(200);
    expect(info.body).toMatchObject({ googleReviewUrl: "", googleMinStars: 4 });
    expect(info.body.name).toBeTruthy();

    const sent = await publicFeedback({ customerName: "Asha", rating: 4, comment: "Great dosa" });
    expect(sent.status).toBe(201);
    expect(sent.body.googleReviewUrl).toBeNull();
    const [mine] = (await reviews()).filter((r) => r.customerName === "Asha");
    expect(mine).toMatchObject({ source: "qr", isApproved: false });

    expect((await publicFeedback({ customerName: "", rating: 4 })).status).toBe(400);
    expect((await publicFeedback({ customerName: "Bot", rating: 9 })).status).toBe(400);
  });

  it("keeps the same feedback once, and ignores a bot that fills the hidden field", async () => {
    await publicFeedback({ customerName: "Dev", rating: 5, comment: "Loved it" });
    const again = await publicFeedback({ customerName: " dev ", rating: 5, comment: "loved  it" });
    expect(again.status).toBe(200);
    expect(again.body.duplicate).toBe(true);
    expect((await reviews()).filter((r) => r.customerName === "Dev")).toHaveLength(1);

    await publicFeedback({ customerName: "Spam", rating: 5, website: "http://spam" });
    expect((await reviews()).filter((r) => r.customerName === "Spam")).toHaveLength(0);
  });

  it("sends happy guests to the Google review link, and only those", async () => {
    const bad = await api().put("/api/reviews/settings").set(bearer(owner)).send({ googleReviewUrl: "not a link" });
    expect(bad.status).toBe(400);
    const saved = await api()
      .put("/api/reviews/settings")
      .set(bearer(owner))
      .send({ googleReviewUrl: "https://g.page/r/abc123/review", googleMinStars: 4 });
    expect(saved.status).toBe(200);

    const happy = await publicFeedback({ customerName: "Happy", rating: 5, comment: "Super" });
    expect(happy.body.googleReviewUrl).toBe("https://g.page/r/abc123/review");
    const unhappy = await publicFeedback({ customerName: "Unhappy", rating: 2, comment: "Slow" });
    expect(unhappy.body.googleReviewUrl).toBeNull();
    expect((await api().put("/api/reviews/settings").send({ googleMinStars: 3 })).status).toBe(401);
  });
});

describe("customising the feedback QR card", () => {
  it("starts with a default card and saves the logo, name, text and colour choices", async () => {
    const start = await api().get("/api/reviews/settings").set(bearer(owner));
    expect(start.body.qr).toMatchObject({ showLogo: true, showAddress: false, heading: "Rate your visit", accentColor: "#ea580c" });

    const saved = await api()
      .put("/api/reviews/settings")
      .set(bearer(owner))
      .send({ qr: { showLogo: false, heading: "Loved it?", instructionText: "Scan and tell us", accentColor: "#1d4ed8" } });
    expect(saved.status).toBe(200);
    const after = await api().get("/api/reviews/settings").set(bearer(owner));
    expect(after.body.qr).toMatchObject({
      showLogo: false,
      showName: true,
      heading: "Loved it?",
      instructionText: "Scan and tell us",
      accentColor: "#1d4ed8",
    });

    for (const qr of [{ accentColor: "blue" }, { heading: "  " }, { showLogo: "yes" }]) {
      expect((await api().put("/api/reviews/settings").set(bearer(owner)).send({ qr })).status).toBe(400);
    }
  });
});

describe("the reviews section in the landing page settings", () => {
  it("has its own switch, texts, a limit and a Google switch, with a sensible default", async () => {
    const start = await api().get("/api/restaurant/landing-content").set(bearer(owner));
    expect(start.body.reviews).toMatchObject({ enabled: true, title: "What our guests say", maxItems: 6, showGoogle: true });

    const saved = await api()
      .put("/api/restaurant/landing-content")
      .set(bearer(owner))
      .send({ reviews: { enabled: false, eyebrow: "Kind words", title: "Loved by guests", lead: "", maxItems: 99, showGoogle: false } });
    expect(saved.status).toBe(200);
    expect(saved.body.reviews).toMatchObject({ enabled: false, eyebrow: "Kind words", title: "Loved by guests", maxItems: 12, showGoogle: false });
    const page = await api().get("/api/landing");
    expect(page.body.content.reviews.enabled).toBe(false);

    await api().put("/api/restaurant/landing-content").set(bearer(owner)).send({ reviews: { enabled: true, showGoogle: true, maxItems: 0 } });
    expect((await api().get("/api/restaurant/landing-content").set(bearer(owner))).body.reviews.maxItems).toBe(1);
    await api().put("/api/restaurant/landing-content").set(bearer(owner)).send({ reviews: { maxItems: 6 } });
  });
});

describe("Google reviews in the feedback list", () => {
  it("fetches them once, never twice, and the admin can hide one by hand", async () => {
    process.env.SERPAPI_API_KEY = "test";
    process.env.GOOGLE_PLACE_ID = "test";
    const first = await api().post("/api/reviews/google/sync").set(bearer(owner));
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ fetched: 2, added: 2, duplicates: 0 });
    const second = await api().post("/api/reviews/google/sync").set(bearer(owner));
    expect(second.body).toEqual({ fetched: 2, added: 0, duplicates: 2 });
    const google = (await reviews()).filter((r) => r.source === "google");
    expect(google).toHaveLength(2);
    expect(google.every((r) => r.isApproved)).toBe(true);

    // The landing page lists them, then not once one is hidden; it never shows one twice.
    const shown = async () => (await api().get("/api/landing")).body.googleReviews as { author: string }[];
    expect((await shown()).map((r) => r.author).sort()).toEqual(["Meena", "Ravi K"]);
    const ravi = google.find((r) => r.customerName === "Ravi K")!;
    await api().patch(`/api/reviews/${ravi._id}/approve`).set(bearer(owner)).send({ isApproved: false });
    expect((await shown()).map((r) => r.author)).toEqual(["Meena"]);
    expect((await api().get("/api/landing")).body.reviews.some((r: { source: string }) => r.source === "google")).toBe(false);
  });

  it("can be set up from the admin with a SerpApi key and a Google place, and never returns the key", async () => {
    delete process.env.SERPAPI_API_KEY;
    delete process.env.GOOGLE_PLACE_ID;
    expect((await api().get("/api/reviews/settings").set(bearer(owner))).body).toMatchObject({
      googleFetchConfigured: false,
      hasSerpApiKey: false,
    });

    const bad = await api().put("/api/reviews/settings").set(bearer(owner)).send({ googlePlaceId: "my cafe" });
    expect(bad.status).toBe(400);
    const badKey = await api().put("/api/reviews/settings").set(bearer(owner)).send({ serpApiKey: "short" });
    expect(badKey.status).toBe(400);

    const saved = await api()
      .put("/api/reviews/settings")
      .set(bearer(owner))
      .send({ serpApiKey: "abcdef1234567890abcdef", googlePlaceId: "0x3bae1670c9b44e6d:0xf8dfc3e8517e4fe0" });
    expect(saved.status).toBe(200);
    const settings = await api().get("/api/reviews/settings").set(bearer(owner));
    expect(settings.body).toMatchObject({
      googleFetchConfigured: true,
      hasSerpApiKey: true,
      googlePlaceId: "0x3bae1670c9b44e6d:0xf8dfc3e8517e4fe0",
    });
    expect(JSON.stringify(settings.body)).not.toContain("abcdef1234567890abcdef");

    // Saving something else leaves the key alone.
    await api().put("/api/reviews/settings").set(bearer(owner)).send({ googleMinStars: 5 });
    expect((await api().get("/api/reviews/settings").set(bearer(owner))).body.hasSerpApiKey).toBe(true);
    const sync = await api().post("/api/reviews/google/sync").set(bearer(owner));
    expect(sync.status).toBe(200);
  });

  it("explains when Google is not set up", async () => {
    delete process.env.SERPAPI_API_KEY;
    await (await import("../src/models/GoogleReviewsConfig")).default.deleteMany({});
    const res = await api().post("/api/reviews/google/sync").set(bearer(owner));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not set up/);
  });
});

describe("the menu card photos and the top menu links in the landing page settings", () => {
  const put = (body: object) => api().put("/api/restaurant/landing-content").set(bearer(owner)).send(body);

  it("keeps photos of the menu card, and starts with no custom links", async () => {
    const start = await api().get("/api/restaurant/landing-content").set(bearer(owner));
    expect(start.body.menuCard).toMatchObject({ enabled: true, title: "The menu card", images: [] });
    expect(start.body.nav.items).toEqual([]);

    const saved = await put({
      menuCard: { enabled: true, eyebrow: "Our Menu", title: "Menu card", lead: "", images: [{ imageUrl: "/uploads/a.jpg", caption: "Page 1" }, { imageUrl: "/uploads/b.jpg", caption: "" }] },
    });
    expect(saved.status).toBe(200);
    const page = await api().get("/api/landing");
    expect(page.body.content.menuCard.images.map((i: { imageUrl: string }) => i.imageUrl)).toEqual(["/uploads/a.jpg", "/uploads/b.jpg"]);
  });

  it("saves the top menu links in order, hides one, and refuses a link that could run script", async () => {
    const saved = await put({
      nav: {
        items: [
          { label: "Menu card", href: "#menu-card", visible: true },
          { label: "Order", href: "/order", visible: true },
          { label: "Instagram", href: "https://instagram.com/cafe", visible: false },
        ],
      },
    });
    expect(saved.status).toBe(200);
    expect(saved.body.nav.items.map((i: { label: string; visible: boolean }) => [i.label, i.visible])).toEqual([
      ["Menu card", true],
      ["Order", true],
      ["Instagram", false],
    ]);

    for (const bad of [{ label: "X", href: "javascript:alert(1)" }, { label: "", href: "#menu" }, { label: "Y", href: "menu" }]) {
      expect((await put({ nav: { items: [bad] } })).status).toBe(400);
    }
    expect((await put({ nav: { items: Array.from({ length: 13 }, (_, i) => ({ label: `L${i}`, href: "#menu" })) } })).status).toBe(400);
    // The links saved before the refused ones are still there.
    expect((await api().get("/api/restaurant/landing-content").set(bearer(owner))).body.nav.items).toHaveLength(3);

    await put({ nav: { items: [] } });
    expect((await api().get("/api/restaurant/landing-content").set(bearer(owner))).body.nav.items).toEqual([]);
  });
});
