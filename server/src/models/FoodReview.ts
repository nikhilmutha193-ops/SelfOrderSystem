import { model, Schema, Types } from "mongoose";

export interface IFoodReview {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  foodItemId: Types.ObjectId;
  orderId?: Types.ObjectId;
  rating: number;
  comment?: string;
  createdAt: Date;
  updatedAt: Date;
}

const foodReviewSchema = new Schema<IFoodReview>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    foodItemId: { type: Schema.Types.ObjectId, ref: "FoodItem", required: true, index: true },
    orderId: { type: Schema.Types.ObjectId, ref: "Order" },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: "" },
  },
  { timestamps: true }
);

// One rating per dish per order, so a guest can't inflate a dish's score by tapping repeatedly.
foodReviewSchema.index(
  { orderId: 1, foodItemId: 1 },
  { unique: true, partialFilterExpression: { orderId: { $exists: true } } }
);

export default model<IFoodReview>("FoodReview", foodReviewSchema);
