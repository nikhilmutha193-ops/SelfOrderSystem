import { model, Schema, Types } from "mongoose";

export interface IRecipeLine {
  stockItemId: Types.ObjectId;
  quantity: number;
  key: boolean;
}

export interface IRecipeModifierLine {
  groupName: string;
  label: string;
  stockItemId: Types.ObjectId;
  quantity: number;
}

export interface IRecipe {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  foodItemId: Types.ObjectId;
  lines: IRecipeLine[];
  modifierLines: IRecipeModifierLine[];
  createdAt: Date;
  updatedAt: Date;
}

const recipeSchema = new Schema<IRecipe>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    foodItemId: { type: Schema.Types.ObjectId, ref: "FoodItem", required: true },
    lines: {
      type: [
        new Schema<IRecipeLine>(
          {
            stockItemId: { type: Schema.Types.ObjectId, ref: "StockItem", required: true },
            quantity: { type: Number, required: true, min: 0 },
            key: { type: Boolean, default: false },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    modifierLines: {
      type: [
        new Schema<IRecipeModifierLine>(
          {
            groupName: { type: String, required: true },
            label: { type: String, required: true },
            stockItemId: { type: Schema.Types.ObjectId, ref: "StockItem", required: true },
            quantity: { type: Number, required: true, min: 0 },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  { timestamps: true }
);

recipeSchema.index({ restaurantId: 1, foodItemId: 1 }, { unique: true });

export default model<IRecipe>("Recipe", recipeSchema);
