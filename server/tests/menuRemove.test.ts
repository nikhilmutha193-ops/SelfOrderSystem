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

const del = (path: string) => api().delete(path).set(bearer(owner));

async function shelf(name: string) {
  const restaurantId = world.restaurantId;
  const category = await Category.create({ restaurantId, name: `${name} cat`, isActive: true });
  const subcategory = await Subcategory.create({ restaurantId, categoryId: category._id, name: `${name} sub`, isActive: true });
  const dish = (dishName: string, isActive: boolean) =>
    FoodItem.create({
      restaurantId,
      categoryId: category._id,
      subcategoryId: subcategory._id,
      name: dishName,
      price: 50,
      isActive,
    });
  return { category, subcategory, dish };
}

describe("removing a dish", () => {
  it("deletes it, its pairing suggestions and leaves old orders readable", async () => {
    const { dish } = await shelf("Dish");
    const pie = await dish("Pie", true);
    const tea = await dish("Tea", true);
    await FoodItem.updateOne({ _id: tea._id }, { $set: { pairsWith: [pie._id] } });

    const order = await api()
      .post("/api/pos/orders")
      .set(bearer(owner))
      .send({ orderType: "takeaway", sendToKitchen: false, items: [{ foodItemId: pie._id, quantity: 2 }] });
    expect(order.status).toBe(201);

    const res = await del(`/api/food-items/${pie._id}`);
    expect(res.status).toBe(200);
    expect(await FoodItem.findById(pie._id)).toBeNull();
    expect((await FoodItem.findById(tea._id))?.pairsWith).toHaveLength(0);

    // The bill still shows what was sold: each line keeps its own name and price.
    const detail = await api().get(`/api/orders/${order.body.order._id}`).set(bearer(owner));
    expect(detail.status).toBe(200);
    expect(detail.body.items[0]).toMatchObject({ foodName: "Pie", quantity: 2 });
  });

  it("will not remove a dish that is part of a combo, and says which", async () => {
    const { dish } = await shelf("Combo");
    const vada = await dish("Side Vada", true);
    const meal = await dish("Meal", true);
    await FoodItem.updateOne({ _id: meal._id }, { $set: { comboItems: [{ foodItemId: vada._id, quantity: 1 }] } });

    const res = await del(`/api/food-items/${vada._id}`);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/part of the combo Meal/);
    expect(await FoodItem.findById(vada._id)).not.toBeNull();
  });

  it("is closed to anyone not signed in and 404s for a dish that is not there", async () => {
    expect((await api().delete(`/api/food-items/${world.food.coffee}`)).status).toBe(401);
    expect((await del(`/api/food-items/${world.restaurantId}`)).status).toBe(404);
    expect((await del("/api/food-items/not-an-id")).status).toBe(400);
  });
});

describe("removing a subcategory", () => {
  it("is refused while a dish in it is still on, then removes it with its hidden dishes", async () => {
    const { subcategory, dish } = await shelf("Sub");
    const on = await dish("Still On", true);
    await dish("Hidden One", false);
    await dish("Hidden Two", false);

    const blocked = await del(`/api/subcategories/${subcategory._id}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.message).toMatch(/1 dish is still on .*Still On/);
    expect(await Subcategory.findById(subcategory._id)).not.toBeNull();

    await FoodItem.updateOne({ _id: on._id }, { $set: { isActive: false } });
    const ok = await del(`/api/subcategories/${subcategory._id}`);
    expect(ok.status).toBe(200);
    expect(ok.body.removedDishes).toBe(3);
    expect(await Subcategory.findById(subcategory._id)).toBeNull();
    expect(await FoodItem.countDocuments({ subcategoryId: subcategory._id })).toBe(0);
  });

  it("removes an empty subcategory straight away", async () => {
    const { subcategory } = await shelf("Empty");
    expect((await del(`/api/subcategories/${subcategory._id}`)).status).toBe(200);
  });
});

describe("removing a category", () => {
  it("needs every dish under it switched off, then takes its subcategories and hidden dishes with it", async () => {
    const { category, subcategory, dish } = await shelf("Whole");
    const second = await Subcategory.create({
      restaurantId: world.restaurantId,
      categoryId: category._id,
      name: "Second",
      isActive: true,
    });
    const on = await dish("Whole On", true);
    await FoodItem.create({
      restaurantId: world.restaurantId,
      categoryId: category._id,
      subcategoryId: second._id,
      name: "Whole Hidden",
      price: 10,
      isActive: false,
    });

    const blocked = await del(`/api/categories/${category._id}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.message).toMatch(/still on in this category/);
    expect(await Category.findById(category._id)).not.toBeNull();

    await FoodItem.updateOne({ _id: on._id }, { $set: { isActive: false } });
    const ok = await del(`/api/categories/${category._id}`);
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ removedSubcategories: 2, removedDishes: 2 });
    expect(await Category.findById(category._id)).toBeNull();
    expect(await Subcategory.countDocuments({ categoryId: category._id })).toBe(0);
    expect(await FoodItem.countDocuments({ categoryId: category._id })).toBe(0);
    expect(subcategory._id).toBeTruthy();
  });

  it("leaves other categories alone", async () => {
    const before = await FoodItem.countDocuments({ restaurantId: world.restaurantId, name: "Filter Coffee" });
    const { category } = await shelf("Lonely");
    expect((await del(`/api/categories/${category._id}`)).status).toBe(200);
    expect(await FoodItem.countDocuments({ restaurantId: world.restaurantId, name: "Filter Coffee" })).toBe(before);
  });
});
