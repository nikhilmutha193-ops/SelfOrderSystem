import { FilterQuery, Types } from "mongoose";

import Category from "../../models/Category";
import Chef from "../../models/Chef";
import FoodItem from "../../models/FoodItem";
import Order from "../../models/Order";
import OrderItem, { IOrderItem } from "../../models/OrderItem";
import PrintAgent, { IPrintAgent } from "../../models/PrintAgent";
import Printer, { IPrinter } from "../../models/Printer";
import PrintJob, { IPrintJob } from "../../models/PrintJob";
import Restaurant from "../../models/Restaurant";
import Station, { IStation } from "../../models/Station";
import TableModel from "../../models/Table";

const RESEND_AFTER_MS = 60_000;
export const MAX_ATTEMPTS = 3;

export class PrintingRepository {
  constructor(private readonly restaurantId: string) {}

  private scoped<T>(filter: FilterQuery<T> = {}): FilterQuery<T> {
    return { ...filter, restaurantId: this.restaurantId } as FilterQuery<T>;
  }

  listStations() {
    return Station.find(this.scoped<IStation>()).sort({ name: 1 }).lean();
  }

  findStation(id: string) {
    return Station.findOne(this.scoped<IStation>({ _id: id }));
  }

  createStation(name: string) {
    return Station.create({ restaurantId: this.restaurantId, name });
  }

  async deleteStation(id: Types.ObjectId) {
    await Station.deleteOne(this.scoped<IStation>({ _id: id }));
    await FoodItem.updateMany(this.scoped({ stationId: id }), { $set: { stationId: null } });
    await Category.updateMany(this.scoped({ defaultStationId: id }), { $set: { defaultStationId: null } });
    await Chef.updateMany(this.scoped({ stationId: id }), { $set: { stationId: null } });
    await Printer.updateMany(this.scoped<IPrinter>({ stationIds: id }), { $pull: { stationIds: id } });
  }

  listAgents() {
    return PrintAgent.find(this.scoped<IPrintAgent>({ revokedAt: null }))
      .select("-tokenHash -pairingCodeHash")
      .sort({ name: 1 })
      .lean();
  }

  findAgent(id: string) {
    return PrintAgent.findOne(this.scoped<IPrintAgent>({ _id: id, revokedAt: null }));
  }

  createAgent(name: string, pairingCodeHash: string, pairingExpiresAt: Date) {
    return PrintAgent.create({ restaurantId: this.restaurantId, name, pairingCodeHash, pairingExpiresAt });
  }

  findAgentByPairingCode(pairingCodeHash: string) {
    return PrintAgent.findOne(
      this.scoped<IPrintAgent>({ pairingCodeHash, revokedAt: null, pairingExpiresAt: { $gt: new Date() } })
    );
  }

  findAgentByToken(tokenHash: string) {
    return PrintAgent.findOne(this.scoped<IPrintAgent>({ tokenHash, revokedAt: null }));
  }

  listPrinters() {
    return Printer.find(this.scoped<IPrinter>()).sort({ name: 1 }).lean();
  }

  findPrinter(id: string) {
    return Printer.findOne(this.scoped<IPrinter>({ _id: id }));
  }

  createPrinter(data: Partial<IPrinter>) {
    return Printer.create({ ...data, restaurantId: this.restaurantId });
  }

  countStations(ids: string[]) {
    return Station.countDocuments(this.scoped<IStation>({ _id: { $in: ids } }));
  }

  activePrinters() {
    return Printer.find(this.scoped<IPrinter>({ isActive: true })).lean();
  }

  activePrintersForAgent(agentId: Types.ObjectId) {
    return Printer.find(this.scoped<IPrinter>({ agentId, isActive: true })).lean();
  }

  createJobs(jobs: Omit<Partial<IPrintJob>, "restaurantId">[]) {
    return PrintJob.insertMany(jobs.map((job) => ({ ...job, restaurantId: this.restaurantId })));
  }

  claimNextJob(agentId: Types.ObjectId) {
    return PrintJob.findOneAndUpdate(
      this.scoped<IPrintJob>({
        agentId,
        $or: [
          { status: "queued" },
          { status: "sent", attempts: { $lt: MAX_ATTEMPTS }, sentAt: { $lt: new Date(Date.now() - RESEND_AFTER_MS) } },
        ],
      }),
      { $set: { status: "sent", sentAt: new Date() }, $inc: { attempts: 1 } },
      { new: true, sort: { createdAt: 1 } }
    );
  }

  findJob(id: string) {
    return PrintJob.findOne(this.scoped<IPrintJob>({ _id: id }));
  }

  listJobs(status?: string) {
    return PrintJob.find(this.scoped<IPrintJob>(status ? { status } : {}))
      .select("-data")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
  }

  countRecentFailures(since: Date) {
    return PrintJob.countDocuments(this.scoped<IPrintJob>({ status: "failed", updatedAt: { $gte: since } }));
  }

  findRestaurant() {
    return Restaurant.findById(this.restaurantId);
  }

  findOrder(orderId: Types.ObjectId | string) {
    return Order.findOne(this.scoped({ _id: orderId }));
  }

  findTableCode(tableId: Types.ObjectId) {
    return TableModel.findOne(this.scoped({ _id: tableId }))
      .select("code")
      .lean();
  }

  findRoundItems(orderId: Types.ObjectId, round: number) {
    return OrderItem.find(this.scoped<IOrderItem>({ orderId, kotRound: round })).lean();
  }

  findOrderItems(orderId: Types.ObjectId) {
    return OrderItem.find(this.scoped<IOrderItem>({ orderId })).lean();
  }

  findChefStation(chefId: string) {
    return Chef.findOne(this.scoped({ _id: chefId }))
      .select("stationId")
      .lean();
  }

  setChefStation(chefId: string, stationId: Types.ObjectId | null) {
    return Chef.findOneAndUpdate(this.scoped({ _id: chefId }), { $set: { stationId } }, { new: true })
      .select("username stationId")
      .lean();
  }
}
