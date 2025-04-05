import mongoose from "mongoose";

const dealSchema = new mongoose.Schema({
  accountId: String,
  dealId: String,
  platform: String,
  type: String,
  time: Date,
  brokerTime: Date,
  commission: Number,
  swap: Number,
  profit: Number,
  symbol: String,
  magic: Number,
  orderId: String,
  positionId: String,
  volume: Number,
  price: Number,
  entryType: String,
  reason: String,
  accountCurrencyExchangeRate: Number,
  updateSequenceNumber: Number,
});

dealSchema.index({ accountId: 1, dealId: 1 }, { unique: true });

const Deal = mongoose.model("Deal", dealSchema);

export default Deal;
