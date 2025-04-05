import { Schema, model } from "mongoose";

const mt5ConnectionSchema = new Schema(
  {
    accountId: { type: String, required: true },
    userId: { type: String, required: true },
    login: { type: String, required: true },
    server: { type: String, required: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
  },
  { timestamps: true }
);

const Mt5Connection = model("Mt5Connection", mt5ConnectionSchema);

export default Mt5Connection;
