import request from "supertest";

import app from "../src/app";
import { connectDb } from "../src/config/db";
import Admin from "../src/models/Admin";
import Category from "../src/models/Category";
import Chef from "../src/models/Chef";
import Coupon from "../src/models/Coupon";
import FoodItem from "../src/models/FoodItem";
import Restaurant from "../src/models/Restaurant";
import Subcategory from "../src/models/Subcategory";
import TableModel from "../src/models/Table";
import { hashPassword } from "../src/utils/password";

export const api = () => request(app);

export interface World {
  restaurantId: string;
  ownerId: string;
  managerId: string;
  chefId: string;
  tableIds: string[];
  food: { coffee: string; dosa: string; vada: string; hidden: string };
}

export async function createWorld(): Promise<World> {
  await connectDb();

  const restaurant = await Restaurant.create({
    name: "Test Kaffi",
    key: process.env.RESTAURANT_KEY,
    taxRates: [
      { name: "CGST", percent: 2.5 },
      { name: "SGST", percent: 2.5 },
    ],
  });
  const restaurantId = restaurant._id;

  const owner = await Admin.create({
    restaurantId,
    username: "owner",
    passwordHash: await hashPassword("Owner@123"),
    securityQuestion: "Favourite colour?",
    securityAnswerHash: await hashPassword("blue"),
    isOwner: true,
  });
  const manager = await Admin.create({
    restaurantId,
    username: "manager",
    passwordHash: await hashPassword("Manager@123"),
    securityQuestion: "Favourite colour?",
    securityAnswerHash: await hashPassword("green"),
    permissions: new Map([
      ["orders", "edit"],
      ["kot", "edit"],
      ["messages", "edit"],
    ]),
  });
  const chef = await Chef.create({
    restaurantId,
    username: "chef1",
    passwordHash: await hashPassword("Chef@123"),
    password: "Chef@123",
  });

  const tableIds: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const table = await TableModel.create({
      restaurantId,
      code: `tbl${i}`,
      passwordHash: await hashPassword(`pass${i}`),
      password: `pass${i}`,
      status: "available",
    });
    tableIds.push(table._id.toString());
  }

  const category = await Category.create({ restaurantId, name: "Breakfast", isActive: true });
  const subcategory = await Subcategory.create({
    restaurantId,
    categoryId: category._id,
    name: "South Indian",
    isActive: true,
  });
  const base = { restaurantId, categoryId: category._id, subcategoryId: subcategory._id };
  const coffee = await FoodItem.create({
    ...base,
    name: "Filter Coffee",
    price: 100,
    prepTimeMinutes: 5,
    isActive: true,
    modifierGroups: [{ name: "Size", options: [{ label: "Large", priceDelta: 40 }] }],
  });
  const dosa = await FoodItem.create({ ...base, name: "Masala Dosa", price: 120, prepTimeMinutes: 12, isActive: true });
  const vada = await FoodItem.create({ ...base, name: "Medu Vada", price: 60, isActive: true });
  const hidden = await FoodItem.create({ ...base, name: "Seasonal Special", price: 200, isActive: false });

  await Coupon.create({ restaurantId, code: "SAVE10", type: "percent", value: 10, minOrderValue: 0, isActive: true });
  await Coupon.create({ restaurantId, code: "BIG50", type: "flat", value: 50, minOrderValue: 5000, isActive: true });

  return {
    restaurantId: restaurantId.toString(),
    ownerId: owner._id.toString(),
    managerId: manager._id.toString(),
    chefId: chef._id.toString(),
    tableIds,
    food: {
      coffee: coffee._id.toString(),
      dosa: dosa._id.toString(),
      vada: vada._id.toString(),
      hidden: hidden._id.toString(),
    },
  };
}

export async function loginAdmin(username = "owner", password = "Owner@123"): Promise<string> {
  const res = await api().post("/api/auth/admin/login").send({ username, password });
  if (res.status !== 200) throw new Error(`admin login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.token;
}

export async function loginChef(keepSignedIn = false): Promise<string> {
  const res = await api().post("/api/auth/chef/login").send({ username: "chef1", password: "Chef@123", keepSignedIn });
  if (res.status !== 200) throw new Error(`chef login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.token;
}

export async function seatTable(
  tableNumber: number,
  customerName = "Asha"
): Promise<{ token: string; orderId: string }> {
  const login = await api()
    .post("/api/auth/table/login")
    .send({ code: `tbl${tableNumber}`, password: `pass${tableNumber}`, startNewOrder: true });
  if (login.status !== 200) throw new Error(`table login failed: ${login.status} ${JSON.stringify(login.body)}`);
  const order = await api()
    .post("/api/orders/dine-in")
    .set("Authorization", `Bearer ${login.body.token}`)
    .send({ customerName, customerPhone: "+91 98450 00000", members: 2 });
  if (order.status !== 201) throw new Error(`dine-in failed: ${order.status} ${JSON.stringify(order.body)}`);
  return { token: order.body.token, orderId: order.body.order._id };
}

export function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export function decodeToken(token: string): Record<string, number | string | boolean> {
  return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
}
