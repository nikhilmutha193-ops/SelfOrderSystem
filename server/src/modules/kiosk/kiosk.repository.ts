import { FilterQuery, Types } from "mongoose";

import FoodItem, { IFoodItem } from "../../models/FoodItem";
import KioskDevice, { IKioskDevice } from "../../models/KioskDevice";
import Order, { IOrder } from "../../models/Order";
import OrderItem, { IOrderItem } from "../../models/OrderItem";
import Restaurant, { IKioskSettings } from "../../models/Restaurant";

export class KioskRepository {
  constructor(private readonly restaurantId: string) {}

  private scoped<T>(filter: FilterQuery<T> = {}): FilterQuery<T> {
    return { ...filter, restaurantId: this.restaurantId } as FilterQuery<T>;
  }

  listDevices() {
    return KioskDevice.find(this.scoped<IKioskDevice>({ revokedAt: null })).sort({ name: 1 }).lean();
  }

  findDevice(id: string) {
    return KioskDevice.findOne(this.scoped<IKioskDevice>({ _id: id, revokedAt: null }));
  }

  createDevice(name: string, pairingCodeHash: string, pairingExpiresAt: Date) {
    return KioskDevice.create({ restaurantId: this.restaurantId, name, pairingCodeHash, pairingExpiresAt });
  }

  findDeviceByPairingCode(pairingCodeHash: string) {
    return KioskDevice.findOne(
      this.scoped<IKioskDevice>({ pairingCodeHash, revokedAt: null, pairingExpiresAt: { $gt: new Date() } })
    );
  }

  findDeviceByToken(tokenHash: string) {
    return KioskDevice.findOne(this.scoped<IKioskDevice>({ tokenHash, revokedAt: null }));
  }

  findRestaurant() {
    return Restaurant.findById(this.restaurantId)
      .select("name logoUrl heroImages kioskSettings dayEndTime timezone kotSettings")
      .lean();
  }

  saveKioskSettings(settings: IKioskSettings) {
    return Restaurant.findByIdAndUpdate(this.restaurantId, { $set: { kioskSettings: settings } }, { new: true })
      .select("kioskSettings")
      .lean();
  }

  countActiveFoodItems(ids: string[]) {
    return FoodItem.countDocuments(this.scoped<IFoodItem>({ _id: { $in: ids }, isActive: true }));
  }

  createOrder(fields: Partial<IOrder>) {
    return Order.create({ ...fields, restaurantId: this.restaurantId });
  }

  /** This kiosk's unpaid orders that the guest walked away from (not left to pay at the counter). */
  findAbandonedOrders(deviceId: Types.ObjectId) {
    return Order.find(
      this.scoped<IOrder>({ source: "kiosk", status: "open", "kiosk.deviceId": deviceId, "kiosk.payAtCounter": false })
    ).select("_id");
  }

  markPayAtCounter(orderId: Types.ObjectId) {
    return Order.updateOne(this.scoped<IOrder>({ _id: orderId, status: "open" }), {
      $set: { "kiosk.payAtCounter": true },
    });
  }

  /** Counter, kiosk and takeaway orders of the business day that are waiting for pickup (no table, not delivery). */
  findPickupOrders(since: Date) {
    return Order.find(
      this.scoped<IOrder>({
        tableId: null,
        orderType: { $in: ["takeaway", "dine-in"] },
        status: { $in: ["open", "billed", "closed"] },
        checkinTime: { $gte: since },
        archivedAt: null,
      })
    )
      .select("_id pickupNumber")
      .lean();
  }

  findSentItems(orderIds: Types.ObjectId[]) {
    return OrderItem.find(
      this.scoped<IOrderItem>({ orderId: { $in: orderIds }, kotRound: { $ne: null }, status: { $ne: "cancelled" } })
    )
      .select("orderId status tokenNumber readyAt")
      .lean();
  }
}
