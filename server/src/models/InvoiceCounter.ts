import { model, Schema, Types } from "mongoose";

export interface IInvoiceCounter {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  financialYear: string;
  seq: number;
}

const invoiceCounterSchema = new Schema<IInvoiceCounter>({
  restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true },
  financialYear: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

invoiceCounterSchema.index({ restaurantId: 1, financialYear: 1 }, { unique: true });

export default model<IInvoiceCounter>("InvoiceCounter", invoiceCounterSchema);
