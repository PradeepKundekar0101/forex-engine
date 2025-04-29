import { Schema, model } from "mongoose";

const groupParticipantSchema = new Schema({
  groupId: { type: Schema.Types.ObjectId, ref: "Group", required: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending",
  },
  initialBalance: { type: Number },
  freezeThreshold: { type: Number },
  freezeDuration: { type: Number },
  accountId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const GroupParticipant = model("GroupParticipant", groupParticipantSchema);

export default GroupParticipant;
