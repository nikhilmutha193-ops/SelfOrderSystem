import { model, Schema, Types } from "mongoose";

export type PrinterConnectionType = "network" | "shared";

export interface IPrinterConnection {
  type: PrinterConnectionType;
  host?: string;
  port?: number;
  shareName?: string;
}

export interface IPrinter {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  name: string;
  agentId: Types.ObjectId;
  connection: IPrinterConnection;
  paperWidth: 58 | 80;
  printsBills: boolean;
  printsUnroutedKots: boolean;
  stationIds: Types.ObjectId[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const connectionSchema = new Schema<IPrinterConnection>(
  {
    type: { type: String, enum: ["network", "shared"], required: true },
    host: { type: String, trim: true },
    port: { type: Number, min: 1, max: 65535 },
    shareName: { type: String, trim: true },
  },
  { _id: false }
);

const printerSchema = new Schema<IPrinter>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    name: { type: String, required: true, trim: true },
    agentId: { type: Schema.Types.ObjectId, ref: "PrintAgent", required: true },
    connection: { type: connectionSchema, required: true },
    paperWidth: { type: Number, enum: [58, 80], default: 80 },
    printsBills: { type: Boolean, default: false },
    printsUnroutedKots: { type: Boolean, default: false },
    stationIds: { type: [Schema.Types.ObjectId], ref: "Station", default: [] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default model<IPrinter>("Printer", printerSchema);
