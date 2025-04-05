import mongoose from "mongoose";

// Create Freeze model
const freezeSchema = new mongoose.Schema(
  {
    accountId: { type: String, required: true, index: true },
    reason: { type: String, required: true },
    automated: { type: Boolean, default: false },
    frozenAt: { type: Date, default: Date.now, index: true },
    initialEquity: { type: Number, required: true },
    releasedAt: { type: Date },
    groupId: { type: String, required: true, index: true },
    active: { type: Boolean, default: true, index: true },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt fields automatically
  }
);

const Freeze = mongoose.model("Freeze", freezeSchema);

export default Freeze;
