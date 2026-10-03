import { FilterQuery, Types } from "mongoose";

import FoodItem, { IFoodItem } from "../../models/FoodItem";
import Restaurant from "../../models/Restaurant";
import TableModel, { ITable } from "../../models/Table";

export class PricingRepository {
  constructor(private readonly restaurantId: string) {}

  private scoped<T>(filter: FilterQuery<T> = {}): FilterQuery<T> {
    return { ...filter, restaurantId: this.restaurantId } as FilterQuery<T>;
  }

  findAreas() {
    return Restaurant.findById(this.restaurantId).select("areas").lean();
  }

  saveAreas(areas: { _id: Types.ObjectId; name: string }[]) {
    return Restaurant.findByIdAndUpdate(this.restaurantId, { $set: { areas } }, { new: true }).select("areas").lean();
  }

  clearTableAreas(areaIds: Types.ObjectId[]) {
    return TableModel.updateMany(this.scoped<ITable>({ areaId: { $in: areaIds } }), { $set: { areaId: null } });
  }

  clearFoodAreaPrices(areaIds: Types.ObjectId[]) {
    return FoodItem.updateMany(this.scoped<IFoodItem>({ "priceRules.areas.areaId": { $in: areaIds } }), {
      $pull: { "priceRules.areas": { areaId: { $in: areaIds } } },
    });
  }

  setTableArea(tableId: string, areaId: Types.ObjectId | null) {
    return TableModel.findOneAndUpdate(this.scoped<ITable>({ _id: tableId }), { $set: { areaId } }, { new: true })
      .select("code areaId")
      .lean();
  }
}
