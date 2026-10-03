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
  stationId?: Types.ObjectId | null;
  shortCode?: string;
  soldOutByStock: boolean;
  translations?: Record<string, { name?: string; description?: string }>;
  modifierGroups: IModifierGroup[];
  pairsWith: Types.ObjectId[];
  priceRules: IPriceRules;
  packagingCharge: number;
  comboItems: IComboItem[];
  reviewSum: number;
  reviewCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAreaPrice {
  areaId: Types.ObjectId;
  price: number;
}

export interface IPriceRules {
  takeaway?: number | null;
  delivery?: number | null;
  areas: IAreaPrice[];
}

export interface IComboItem {
  foodItemId: Types.ObjectId;
  quantity: number;
}

const priceRulesSchema = new Schema<IPriceRules>(
  {
    takeaway: { type: Number, default: null, min: 0 },
    delivery: { type: Number, default: null, min: 0 },
    areas: {
      type: [
        new Schema<IAreaPrice>(
          { areaId: { type: Schema.Types.ObjectId, required: true }, price: { type: Number, required: true, min: 0 } },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  { _id: false }
);

const comboItemSchema = new Schema<IComboItem>(
  {
    foodItemId: { type: Schema.Types.ObjectId, ref: "FoodItem", required: true },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

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
    stationId: { type: Schema.Types.ObjectId, ref: "Station", default: null },
    shortCode: { type: String, trim: true, uppercase: true },
    soldOutByStock: { type: Boolean, default: false },
    translations: { type: Schema.Types.Mixed, default: {} },
    modifierGroups: { type: [modifierGroupSchema], default: [] },
    pairsWith: { type: [{ type: Schema.Types.ObjectId, ref: "FoodItem" }], default: [] },
    priceRules: { type: priceRulesSchema, default: () => ({}) },
    packagingCharge: { type: Number, default: 0, min: 0 },
    comboItems: { type: [comboItemSchema], default: [] },
    reviewSum: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

foodItemSchema.index(
  { restaurantId: 1, shortCode: 1 },
  { unique: true, partialFilterExpression: { shortCode: { $type: "string" } } }
);

export default model<IFoodItem>("FoodItem", foodItemSchema);
