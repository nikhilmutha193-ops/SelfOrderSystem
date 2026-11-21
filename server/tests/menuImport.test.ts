import { beforeAll, describe, expect, it } from "vitest";

import Category from "../src/models/Category";
import FoodItem from "../src/models/FoodItem";
import Subcategory from "../src/models/Subcategory";
import { api, bearer, createWorld, loginAdmin, World } from "./fixtures";

let world: World;
let owner: string;

beforeAll(async () => {
  world = await createWorld();
  owner = await loginAdmin();
});

const row = (over: Record<string, unknown>) => ({ Category: "Breakfast", Subcategory: "South Indian", ...over });
const preview = (body: object) => api().post("/api/menu-import/preview").set(bearer(owner)).send(body);
const apply = (body: object) => api().post("/api/menu-import/apply").set(bearer(owner)).send(body);
const dish = (name: string) => FoodItem.findOne({ restaurantId: world.restaurantId, name });

describe("exporting the menu", () => {
  it("lists every dish with names instead of ids, in the same columns the import reads", async () => {
    const res = await api().get("/api/menu-import/export").set(bearer(owner));
    expect(res.status).toBe(200);
    expect(res.body.columns.map((c: { label: string }) => c.label)).toEqual(
      expect.arrayContaining(["Category", "Subcategory", "Name", "Price", "Food type", "Short code"])
    );
    const coffee = res.body.rows.find((r: { name: string }) => r.name === "Filter Coffee");
    expect(coffee).toMatchObject({ category: "Breakfast", subcategory: "South Indian", price: 100, isActive: "Yes" });
    expect(res.body.rows.find((r: { name: string }) => r.name === "Seasonal Special").isActive).toBe("No");
  });

  it("needs the Food Items page", async () => {
    expect((await api().get("/api/menu-import/export")).status).toBe(401);
  });
});

describe("importing from Excel", () => {
  it("adds new dishes and leaves duplicates alone, changing nothing on a preview", async () => {
    const rows = [
      row({ Name: "Filter Coffee", Price: 999 }),
      row({ Name: "Idli", Price: 40, "Food type": "Veg" }),
      row({ Category: "Desserts", Subcategory: "Sweets", Name: "Gulab Jamun", Price: "₹80" }),
      row({ Name: "idli ", Price: 45 }),
    ];
    const seen = await preview({ rows, mode: "insert" });
    expect(seen.status).toBe(200);
    expect(seen.body.counts).toMatchObject({ insert: 2, duplicate: 2, update: 0, newCategories: 1, newSubcategories: 1 });
    expect(seen.body.rows.map((r: { action: string }) => r.action)).toEqual(["duplicate", "insert", "insert", "duplicate"]);
    expect(await dish("Idli")).toBeNull();
    expect(await Category.countDocuments({ restaurantId: world.restaurantId, name: "Desserts" })).toBe(0);

    const done = await apply({ rows, mode: "insert" });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ inserted: 2, updated: 0, createdCategories: 1, createdSubcategories: 1 });
    expect((await dish("Filter Coffee"))?.price).toBe(100);
    expect((await dish("Idli"))?.price).toBe(40);
    const jamun = await dish("Gulab Jamun");
    expect(jamun?.price).toBe(80);
    expect(jamun?.foodType).toBe("veg");
    expect(await Subcategory.countDocuments({ restaurantId: world.restaurantId, name: "Sweets" })).toBe(1);

    // The same file again adds nothing: every dish is now a duplicate.
    const again = await apply({ rows: rows.slice(0, 3), mode: "insert" });
    expect(again.body).toMatchObject({ inserted: 0, duplicates: 3 });
  });

  it("updates duplicates only on request, and only the columns that were picked", async () => {
    const rows = [row({ Name: "Medu Vada", Price: 75, Description: "Crisp and hot", "Prep time (min)": 20 })];
    const seen = await preview({ rows, mode: "upsert", fields: ["price"] });
    expect(seen.body.counts).toMatchObject({ update: 1, insert: 0 });
    expect(seen.body.rows[0].changes).toEqual(["Price: ₹60 → ₹75"]);
    expect(seen.body.fields.find((f: { key: string }) => f.key === "description").selected).toBe(false);

    const done = await apply({ rows, mode: "upsert", fields: ["price"] });
    expect(done.body).toMatchObject({ updated: 1 });
    const vada = await dish("Medu Vada");
    expect(vada?.price).toBe(75);
    expect(vada?.description).not.toBe("Crisp and hot");
    expect(vada?.prepTimeMinutes).not.toBe(20);

    // With every column picked the rest follow, and an identical row is reported as unchanged.
    await apply({ rows, mode: "upsert" });
    expect((await dish("Medu Vada"))?.description).toBe("Crisp and hot");
    expect((await preview({ rows, mode: "upsert" })).body.counts).toMatchObject({ unchanged: 1, update: 0 });
  });

  it("treats an empty cell as leave it alone", async () => {
    const rows = [row({ Name: "Masala Dosa", Price: "", Description: "" })];
    const seen = await preview({ rows, mode: "upsert" });
    expect(seen.body.counts).toMatchObject({ unchanged: 1 });
  });

  it("moves a dish to another subcategory and sets short codes, rejecting a code that is taken", async () => {
    await FoodItem.updateOne({ _id: world.food.coffee }, { $set: { shortCode: "FC" } });
    const moved = await apply({
      rows: [row({ Name: "Masala Dosa", Subcategory: "Tiffin", "Short code": "md" })],
      mode: "upsert",
    });
    expect(moved.body).toMatchObject({ updated: 1, createdSubcategories: 1 });
    const dosa = await dish("Masala Dosa");
    expect(dosa?.shortCode).toBe("MD");
    expect((await Subcategory.findById(dosa?.subcategoryId))?.name).toBe("Tiffin");

    const clash = await preview({ rows: [row({ Name: "Masala Dosa", "Short code": "FC" })], mode: "upsert" });
    expect(clash.body.rows[0]).toMatchObject({ action: "error" });
    expect(clash.body.rows[0].note).toMatch(/already used by Filter Coffee/);
  });

  it("reports bad rows without stopping the good ones", async () => {
    const rows = [
      row({ Name: "Pongal", Price: 50 }),
      row({ Name: "Bad Price", Price: "free" }),
      row({ Name: "No Price" }),
      row({ Name: "Bad Type", Price: 10, "Food type": "meat" }),
      row({ Category: "", Name: "Orphan", Price: 10 }),
      row({ Name: "Same Code A", Price: 10, "Short code": "ZZ" }),
      row({ Name: "Same Code B", Price: 10, "Short code": "ZZ" }),
    ];
    const seen = await preview({ rows, mode: "insert" });
    expect(seen.body.counts).toMatchObject({ insert: 2, error: 5 });
    const done = await apply({ rows, mode: "insert" });
    expect(done.body).toMatchObject({ inserted: 2, skipped: 5 });
    expect(await dish("Pongal")).not.toBeNull();
    expect(await dish("Bad Price")).toBeNull();
  });

  it("will not create categories it was told not to", async () => {
    const seen = await preview({ rows: [row({ Category: "Brand New", Name: "Thing", Price: 5 })], createMissing: false });
    expect(seen.body.rows[0].action).toBe("error");
    expect(seen.body.rows[0].note).toMatch(/not on the menu/);
  });

  it("replace hides the dishes that are not in the file and keeps the rest", async () => {
    const rows = [row({ Name: "Filter Coffee", Price: 100 }), row({ Name: "Pongal", Price: 50 })];
    const seen = await preview({ rows, mode: "replace" });
    expect(seen.body.counts.remove).toBeGreaterThan(2);
    expect(seen.body.toRemove.map((r: { name: string }) => r.name)).not.toContain("Filter Coffee");

    const done = await apply({ rows, mode: "replace" });
    expect(done.body.hidden).toBe(seen.body.counts.remove);
    expect((await dish("Filter Coffee"))?.isActive).toBe(true);
    expect((await dish("Pongal"))?.isActive).toBe(true);
    expect((await dish("Medu Vada"))?.isActive).toBe(false);
    // Nothing is deleted: the dishes are only hidden and can be switched back on.
    expect(await dish("Medu Vada")).not.toBeNull();
  });

  it("needs a Category and a Name column", async () => {
    const res = await preview({ rows: [{ Dish: "Only a name" }] });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Category column and a Name column/);
    expect((await preview({ rows: [] })).status).toBe(400);
  });

  it("recognises other spellings of the column names", async () => {
    const res = await preview({
      rows: [{ "Category Name": "Breakfast", "Sub Category": "South Indian", "Dish Name": "Upma", Rate: 35, Type: "Non Veg" }],
    });
    expect(res.body.counts.insert).toBe(1);
    expect(res.body.fields.map((f: { key: string }) => f.key)).toEqual(
      expect.arrayContaining(["category", "subcategory", "name", "price", "foodType"])
    );
  });
});
