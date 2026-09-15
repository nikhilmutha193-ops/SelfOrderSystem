import "dotenv/config";
import mongoose from "mongoose";
import Restaurant from "../models/Restaurant";
import Admin from "../models/Admin";
import Chef from "../models/Chef";
import TableModel from "../models/Table";
import Category from "../models/Category";
import Subcategory from "../models/Subcategory";
import FoodItem from "../models/FoodItem";
import { hashPassword } from "./password";

async function seed() {
  const uri = process.env.MONGO_URI;
  const key = (process.env.RESTAURANT_KEY || "").toLowerCase();
  if (!uri) throw new Error("MONGO_URI is not set");
  if (!key) throw new Error("RESTAURANT_KEY is not set");

  await mongoose.connect(uri);
  console.log("Connected to MongoDB, seeding...");

  let restaurant = await Restaurant.findOne({ key });
  if (!restaurant) {
    restaurant = await Restaurant.create({
      name: "FoodDrinks",
      key,
      logoUrl: "",
      address: "123 Main Street, Your City",
      taxRates: [
        { name: "CGST", percent: 2.5 },
        { name: "SGST", percent: 2.5 },
      ],
    });
    console.log(`Created restaurant "${restaurant.name}" (key: ${key})`);
  } else {
    console.log(`Restaurant already exists for key "${key}", skipping restaurant creation`);
  }

  const adminExists = await Admin.findOne({ restaurantId: restaurant._id, username: "admin" });
  if (!adminExists) {
    await Admin.create({
      restaurantId: restaurant._id,
      username: "admin",
      passwordHash: await hashPassword("Admin@123"),
      securityQuestion: "What is your favorite color?",
      securityAnswerHash: await hashPassword("blue"),
    });
    console.log('Created admin login -> username: "admin", password: "Admin@123", security answer: "blue"');
  }

  const chefExists = await Chef.findOne({ restaurantId: restaurant._id, username: "chef1" });
  if (!chefExists) {
    await Chef.create({
      restaurantId: restaurant._id,
      username: "chef1",
      passwordHash: await hashPassword("Chef@123"),
      password: "Chef@123",
    });
    console.log('Created chef login -> username: "chef1", password: "Chef@123"');
  }

  const tableCount = await TableModel.countDocuments({ restaurantId: restaurant._id });
  if (tableCount === 0) {
    for (let i = 1; i <= 5; i++) {
      await TableModel.create({
        restaurantId: restaurant._id,
        code: `tbl${i}`,
        passwordHash: await hashPassword(`pass${i}`),
        password: `pass${i}`,
        status: "available",
      });
    }
    console.log('Created tables tbl1..tbl5, each with password "pass<N>"');
  }

  const categoryCount = await Category.countDocuments({ restaurantId: restaurant._id });
  if (categoryCount === 0) {
    const starters = await Category.create({
      restaurantId: restaurant._id,
      name: "Starters",
      description: "Appetizers to begin your meal",
      isActive: true,
    });
    const mainCourse = await Category.create({
      restaurantId: restaurant._id,
      name: "Main Course",
      description: "Hearty main dishes",
      isActive: true,
    });
    const beverages = await Category.create({
      restaurantId: restaurant._id,
      name: "Beverages",
      description: "Drinks, hot and cold",
      isActive: true,
    });

    const soups = await Subcategory.create({
      restaurantId: restaurant._id,
      categoryId: starters._id,
      name: "Soups",
      isActive: true,
    });
    const snacks = await Subcategory.create({
      restaurantId: restaurant._id,
      categoryId: starters._id,
      name: "Snacks",
      isActive: true,
    });
    const curries = await Subcategory.create({
      restaurantId: restaurant._id,
      categoryId: mainCourse._id,
      name: "Curries",
      isActive: true,
    });
    const breads = await Subcategory.create({
      restaurantId: restaurant._id,
      categoryId: mainCourse._id,
      name: "Breads",
      isActive: true,
    });
    const coldDrinks = await Subcategory.create({
      restaurantId: restaurant._id,
      categoryId: beverages._id,
      name: "Cold Drinks",
      isActive: true,
    });

    await FoodItem.insertMany([
      {
        restaurantId: restaurant._id,
        categoryId: starters._id,
        subcategoryId: soups._id,
        name: "Tomato Soup",
        price: 120,
        isActive: true,
      },
      {
        restaurantId: restaurant._id,
        categoryId: starters._id,
        subcategoryId: snacks._id,
        name: "Paneer Tikka",
        price: 220,
        isActive: true,
      },
      {
        restaurantId: restaurant._id,
        categoryId: mainCourse._id,
        subcategoryId: curries._id,
        name: "Paneer Butter Masala",
        price: 260,
        isActive: true,
      },
      {
        restaurantId: restaurant._id,
        categoryId: mainCourse._id,
        subcategoryId: curries._id,
        name: "Dal Makhani",
        price: 210,
        isActive: true,
      },
      {
        restaurantId: restaurant._id,
        categoryId: mainCourse._id,
        subcategoryId: breads._id,
        name: "Butter Naan",
        price: 45,
        isActive: true,
      },
      {
        restaurantId: restaurant._id,
        categoryId: beverages._id,
        subcategoryId: coldDrinks._id,
        name: "Masala Lemonade",
        price: 90,
        isActive: true,
      },
    ]);
    console.log("Created sample categories, subcategories and food items");
  }

  console.log("Seeding complete.");
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
