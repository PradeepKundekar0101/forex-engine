import { Schema, model } from "mongoose";

const groupSchema = new Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  isRegistrationOpen: { type: Boolean, default: true },
  isPublic: { type: Boolean, default: true },
  startDate: { type: Date },
  endDate: { type: Date },
  freezeDuration: { type: Number, default: 0 },
  participantsCount: { type: Number, default: 0 },
  freezeThreshold: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  initialBalance: { type: Number, default: 0 },
});

const Group = model("Group", groupSchema);

export default Group;
