import { ClientSession, FilterQuery, Types } from "mongoose";

import Customer, { ICustomer } from "../../models/Customer";
import LoyaltyEntry, { ILoyaltyEntry } from "../../models/LoyaltyEntry";
import Order, { IOrder } from "../../models/Order";
import OrderItem, { IOrderItem } from "../../models/OrderItem";
import Restaurant from "../../models/Restaurant";
import SmsCampaign, { ISmsCampaign } from "../../models/SmsCampaign";
import SmsTemplate, { ISmsTemplate } from "../../models/SmsTemplate";

export class CustomersRepository {
  constructor(private readonly restaurantId: string) {}

  private scoped<T>(filter: FilterQuery<T> = {}): FilterQuery<T> {
    return { ...filter, restaurantId: this.restaurantId } as FilterQuery<T>;
  }

  findRestaurant(fields: string) {
    return Restaurant.findById(this.restaurantId).select(fields);
  }

  updateLoyaltySettings(settings: object) {
    return Restaurant.findByIdAndUpdate(
      this.restaurantId,
      { $set: { loyaltySettings: settings } },
      { new: true }
    ).select("loyaltySettings");
  }

  updateBirthdaySmsSettings(settings: object) {
    return Restaurant.findByIdAndUpdate(
      this.restaurantId,
      { $set: { birthdaySmsSettings: settings } },
      { new: true }
    ).select("birthdaySmsSettings");
  }

  findByPhone(phone: string) {
    return Customer.findOne(this.scoped<ICustomer>({ phone }));
  }

  findById(id: string | Types.ObjectId) {
    return Customer.findOne(this.scoped<ICustomer>({ _id: id }));
  }

  async upsertByPhone(phone: string, name: string) {
    return Customer.findOneAndUpdate(
      this.scoped<ICustomer>({ phone }),
      { $setOnInsert: { phone, name, restaurantId: this.restaurantId } },
      { upsert: true, new: true }
    );
  }

  list(filter: FilterQuery<ICustomer>, limit: number) {
    return Customer.find(this.scoped<ICustomer>(filter)).sort({ lastVisitAt: -1, createdAt: -1 }).limit(limit).lean();
  }

  recordVisit(id: Types.ObjectId, amount: number, at: Date) {
    return Customer.updateOne(this.scoped<ICustomer>({ _id: id }), [
      {
        $set: {
          visitCount: { $add: ["$visitCount", 1] },
          totalSpend: { $round: [{ $add: ["$totalSpend", amount] }, 2] },
          lastVisitAt: at,
          firstVisitAt: { $ifNull: ["$firstVisitAt", at] },
        },
      },
    ]);
  }

  undoVisit(id: Types.ObjectId, amount: number) {
    return Customer.updateOne(this.scoped<ICustomer>({ _id: id }), [
      {
        $set: {
          visitCount: { $max: [{ $subtract: ["$visitCount", 1] }, 0] },
          totalSpend: { $max: [{ $round: [{ $subtract: ["$totalSpend", amount] }, 2] }, 0] },
        },
      },
    ]);
  }

  touch(id: Types.ObjectId, session: ClientSession) {
    return Customer.updateOne(this.scoped<ICustomer>({ _id: id }), { $set: { updatedAt: new Date() } }, { session });
  }

  entries(customerId: Types.ObjectId, session?: ClientSession) {
    return LoyaltyEntry.find(this.scoped<ILoyaltyEntry>({ customerId }))
      .sort({ createdAt: 1 })
      .session(session ?? null)
      .lean();
  }

  entriesForOrder(orderId: Types.ObjectId) {
    return LoyaltyEntry.find(this.scoped<ILoyaltyEntry>({ orderId })).lean();
  }

  async addEntry(data: Partial<ILoyaltyEntry>, session?: ClientSession) {
    const [entry] = await LoyaltyEntry.create([{ ...data, restaurantId: this.restaurantId }], { session });
    return entry;
  }

  findOrder(id: string | Types.ObjectId) {
    return Order.findOne(this.scoped<IOrder>({ _id: id }));
  }

  setOrderCustomer(orderId: Types.ObjectId, customerId: Types.ObjectId, extra: Partial<IOrder> = {}) {
    return Order.updateOne(this.scoped<IOrder>({ _id: orderId }), { $set: { customerId, ...extra } });
  }

  setLoyaltyRedeem(orderId: Types.ObjectId, redeem: IOrder["loyaltyRedeem"], session?: ClientSession) {
    return Order.updateOne(this.scoped<IOrder>({ _id: orderId }), { $set: { loyaltyRedeem: redeem } }, { session });
  }

  customerOrders(customerId: Types.ObjectId, limit: number) {
    return Order.find(this.scoped<IOrder>({ customerId }))
      .select("orderType status invoiceNumber createdAt checkoutTime bill.grandTotal loyaltyRedeem")
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }

  findItems(orderId: Types.ObjectId) {
    return OrderItem.find(this.scoped<IOrderItem>({ orderId })).lean();
  }

  listConsented() {
    return Customer.find(this.scoped<ICustomer>({ marketingConsent: true, phone: { $ne: "" } }))
      .select("phone name")
      .lean();
  }

  listSmsTemplates() {
    return SmsTemplate.find(this.scoped<ISmsTemplate>({})).sort({ createdAt: -1 }).lean();
  }

  createSmsTemplate(data: { name: string; message: string }) {
    return SmsTemplate.create({ ...data, restaurantId: this.restaurantId });
  }

  updateSmsTemplate(id: string, data: { name: string; message: string }) {
    return SmsTemplate.findOneAndUpdate(this.scoped<ISmsTemplate>({ _id: id }), { $set: data }, { new: true });
  }

  deleteSmsTemplate(id: string) {
    return SmsTemplate.findOneAndDelete(this.scoped<ISmsTemplate>({ _id: id }));
  }

  createSmsCampaign(data: { message: string; recipientCount: number; sentCount: number; sentBy: string }) {
    return SmsCampaign.create({ ...data, restaurantId: this.restaurantId });
  }

  listSmsCampaigns(limit: number) {
    return SmsCampaign.find(this.scoped<ISmsCampaign>({})).sort({ createdAt: -1 }).limit(limit).lean();
  }
}
