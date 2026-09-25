import { model, Schema, Types } from "mongoose";

export type FoodType = "veg" | "non-veg" | "egg";

export interface IModifierOption {
  label: string;
  priceDelta: number;
}

export interface IModifierGroup {
  name: string;
  type: "single" | "multi";
  required: boolean;
  options: IModifierOption[];
}

export interface IFoodItem {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  categoryId: Types.ObjectId;
  subcategoryId: Types.ObjectId;
  name: string;
  price: number;
  description?: string;
  imageUrl?: string;
  isActive: boolean;
  isBestseller: boolean;
  bestsellerEmoji?: string;
  foodType: FoodType;
  rating: number;
  prepTimeMinutes: number;
  translations?: Record<string, { name?: string; description?: string }>;
  modifierGroups: IModifierGroup[];
  reviewSum: number;
  reviewCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const modifierOptionSchema = new Schema<IModifierOption>(
  { label: { type: String, required: true, trim: true }, priceDelta: { type: Number, default: 0 } },
  { _id: false }
);

const modifierGroupSchema = new Schema<IModifierGroup>(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ["single", "multi"], default: "single" },
    required: { type: Boolean, default: false },
    options: { type: [modifierOptionSchema], default: [] },
  },
  { _id: false }
);

const foodItemSchema = new Schema<IFoodItem>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    categoryId: { type: Schema.Types.ObjectId, ref: "Category", required: true, index: true },
    subcategoryId: { type: Schema.Types.ObjectId, ref: "Subcategory", required: true, index: true },
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    description: { type: String, default: "" },
    imageUrl: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
    isBestseller: { type: Boolean, default: false },
    bestsellerEmoji: { type: String, default: "⭐" },
    foodType: { type: String, enum: ["veg", "non-veg", "egg"], default: "veg" },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    prepTimeMinutes: { type: Number, default: 10, min: 0 },
    translations: { type: Schema.Types.Mixed, default: {} },
    modifierGroups: { type: [modifierGroupSchema], default: [] },
    reviewSum: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default model<IFoodItem>("FoodItem", foodItemSchema);
