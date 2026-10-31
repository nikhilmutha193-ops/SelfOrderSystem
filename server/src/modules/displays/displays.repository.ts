import { FilterQuery } from "mongoose";

import Display, { IDisplay } from "../../models/Display";

export class DisplaysRepository {
  constructor(private readonly restaurantId: string) {}

  private scoped<T>(filter: FilterQuery<T> = {}): FilterQuery<T> {
    return { ...filter, restaurantId: this.restaurantId } as FilterQuery<T>;
  }

  list() {
    return Display.find(this.scoped<IDisplay>()).sort({ name: 1 }).lean();
  }

  find(id: string) {
    return Display.findOne(this.scoped<IDisplay>({ _id: id }));
  }

  create(data: Record<string, unknown>) {
    return Display.create({ ...data, restaurantId: this.restaurantId });
  }

  remove(id: string) {
    return Display.findOneAndDelete(this.scoped<IDisplay>({ _id: id })).lean();
  }
}

/** The public screen finds its display by the code in its address; the tenant check is in the service. */
export function findDisplayByCode(code: string) {
  return Display.findOne({ code }).lean();
}
