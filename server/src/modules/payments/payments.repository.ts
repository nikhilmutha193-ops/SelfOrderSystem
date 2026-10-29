import { FilterQuery, Types } from "mongoose";

import PaymentAttempt, { IPaymentAttempt, PaymentAttemptStatus } from "../../models/PaymentAttempt";
import PaymentGateway, { IPaymentGateway } from "../../models/PaymentGateway";
import Restaurant from "../../models/Restaurant";

export class PaymentsRepository {
  constructor(private readonly restaurantId: string) {}

  private scoped<T>(filter: FilterQuery<T> = {}): FilterQuery<T> {
    return { ...filter, restaurantId: this.restaurantId } as FilterQuery<T>;
  }

  findGateway() {
    return PaymentGateway.findOne(this.scoped<IPaymentGateway>());
  }

  saveGateway(changes: Partial<Pick<IPaymentGateway, "enabled" | "keyId" | "keySecretEnc" | "webhookSecretEnc">>) {
    return PaymentGateway.findOneAndUpdate(
      this.scoped<IPaymentGateway>(),
      { $set: changes, $setOnInsert: { restaurantId: this.restaurantId } },
      { new: true, upsert: true }
    );
  }

  findAttempt(gatewayOrderId: string) {
    return PaymentAttempt.findOne(this.scoped<IPaymentAttempt>({ gatewayOrderId }));
  }

  /** An unpaid checkout for the same order and amount, recent enough to reopen instead of starting another. */
  findReusableAttempt(orderId: Types.ObjectId, amount: number, since: Date) {
    return PaymentAttempt.findOne(
      this.scoped<IPaymentAttempt>({ orderId, amount, status: "created", createdAt: { $gte: since } })
    ).sort({ createdAt: -1 });
  }

  createAttempt(input: Pick<IPaymentAttempt, "orderId" | "gatewayOrderId" | "amount">) {
    return PaymentAttempt.create({ ...input, restaurantId: this.restaurantId, provider: "razorpay", currency: "INR" });
  }

  /** Moves a checkout from "created" to "processing"; null when another request got there first. */
  claimAttempt(id: Types.ObjectId, paymentId: string) {
    return PaymentAttempt.findOneAndUpdate(
      this.scoped<IPaymentAttempt>({ _id: id, status: "created" }),
      { $set: { status: "processing", paymentId } },
      { new: true }
    );
  }

  finishAttempt(id: Types.ObjectId, status: PaymentAttemptStatus, extra: { method?: string; note?: string } = {}) {
    return PaymentAttempt.updateOne(this.scoped<IPaymentAttempt>({ _id: id }), { $set: { status, ...extra } });
  }

  /** Back to "created" after a failed check, so a retry (or the webhook) can finish it. */
  releaseAttempt(id: Types.ObjectId) {
    return PaymentAttempt.updateOne(this.scoped<IPaymentAttempt>({ _id: id, status: "processing" }), {
      $set: { status: "created" },
      $unset: { paymentId: "" },
    });
  }

  findAttemptById(id: Types.ObjectId) {
    return PaymentAttempt.findOne(this.scoped<IPaymentAttempt>({ _id: id }));
  }

  findNeedingAttention(since: Date) {
    return PaymentAttempt.find(
      this.scoped<IPaymentAttempt>({ status: { $in: ["mismatch", "duplicate"] }, updatedAt: { $gte: since } })
    )
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean();
  }

  findRestaurantName() {
    return Restaurant.findById(this.restaurantId).select("name").lean();
  }
}
