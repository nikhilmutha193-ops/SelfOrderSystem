import { model, Schema, Types } from "mongoose";

export type TeamMemberRole = "owner" | "chef";

export interface ITeamMember {
  _id: Types.ObjectId;
  restaurantId: Types.ObjectId;
  role: TeamMemberRole;
  name: string;
  title?: string;
  bio?: string;
  photoUrl?: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const teamMemberSchema = new Schema<ITeamMember>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    role: { type: String, enum: ["owner", "chef"], required: true },
    name: { type: String, required: true, trim: true },
    title: { type: String, default: "" },
    bio: { type: String, default: "" },
    photoUrl: { type: String, default: "" },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default model<ITeamMember>("TeamMember", teamMemberSchema);
