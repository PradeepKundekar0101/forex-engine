import mongoose, { Schema, model, ObjectId, Mongoose } from "mongoose";
import validator from "validator";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

export interface IUser extends Document {
  //Personal details
  _id: ObjectId;
  firstName: string | undefined;
  lastName: string | undefined;
  occupation: string | undefined;
  role: string;
  email: string;
  phoneNumber: string | undefined;
  password: string | undefined;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  email_otp: number | undefined;
  email_otp_expire: Date | undefined;
  lastNotificationViewedAt: Date | undefined;

  //Broker details
  dhan_auth_token: string | undefined;
  dhan_client_id: string | undefined;
  isBrokerConnected: boolean;
  mentorId: ObjectId | null;
  mentor?: IUser | null;
  brokerLastConnectedAt: Date | undefined;
  //Profile image
  profile_image_key: string | undefined;
  profile_image_url: string | undefined;

  //BD
  isBD: boolean;
  referralCode: string;
  reffererId: string | null;
  usersCount: number;
  paidUsersCount: number;

  //methods
  comparePassword(enteredPassword: string): Promise<boolean>;
  generateToken(): string;

  //Subcription
  subscription: string | undefined;
  stripeCustomerId: string | undefined;

  //plans
  plan: string | undefined;
  // planId : string | undefined;
  planSessionId: string | undefined;
  planCustomerId: string | undefined;
  planSubscriptionId: string | undefined;
  planExpirationDate: number | undefined;
  planStatus: string | undefined;
}

const userSchema = new Schema<IUser>(
  {
    firstName: {
      type: String,
      trim: true,
      validate: validator.isAlpha,
      min: 3,
      max: 32,
    },
    lastName: {
      type: String,
      trim: true,
      validate: validator.isAlpha,
      min: 3,
      max: 32,
    },
    mentorId: {
      type: mongoose.Types.ObjectId,
      ref: "User",
      default: null,
    },
    role: {
      type: String,
      default: "trader",
    },
    occupation: {
      type: String,
      trim: true,
      min: 3,
      max: 50,
    },
    email: {
      type: String,
      unique: true,
      validate: validator.isEmail,
    },
    phoneNumber: {
      type: Number,
      default: undefined,
    },
    password: {
      type: String,
      default: "",
    },
    dhan_auth_token: {
      type: String,
      default: undefined,
    },
    dhan_client_id: {
      type: String,
      default: undefined,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    isPhoneVerified: {
      type: Boolean,
      default: false,
    },
    email_otp: {
      type: Number,
      default: undefined,
    },
    email_otp_expire: {
      type: Date,
      default: undefined,
    },

    isBrokerConnected: {
      type: Boolean,
      default: false,
    },
    profile_image_key: {
      type: String,
      default: null,
    },
    profile_image_url: {
      type: String,
      default: "",
    },
    isBD: {
      type: Boolean,
      default: true,
    },
    referralCode: {
      type: String,
      default: null,
    },
    reffererId: {
      type: mongoose.Types.ObjectId,
      default: null,
    },
    usersCount: {
      type: Number,
      default: 0,
    },
    paidUsersCount: {
      type: Number,
      default: 0,
    },
    subscription: {
      type: Schema.Types.ObjectId,
      ref: "Subscription",
      default: undefined,
    },
    stripeCustomerId: {
      type: String,
      default: undefined,
    },
    lastNotificationViewedAt: {
      type: Date,
      default: undefined,
    },
    brokerLastConnectedAt: {
      type: Date,
      default: undefined,
    },
    plan: {
      type: String,
      enum: ["free", "pro"],
      default: "free",
    },
    planSessionId: {
      type: String,
      default: undefined,
    },
    planSubscriptionId: {
      type: String,
      default: undefined,
    },
    planCustomerId: {
      type: String,
      default: undefined,
    },
    planExpirationDate: {
      type: Number,
      default: undefined,
    },
    planStatus: {
      type: String,
      enum: ["active", "canceled", "Not subscribed"],
      default: "Not subscribed",
    },
  },
  {
    timestamps: true,
  }
);

userSchema.methods.comparePassword = async function (
  enteredPassword: string
): Promise<boolean> {
  return await bcrypt.compare(enteredPassword, this.password);
};

userSchema.methods.generateToken = function () {
  return jwt.sign(
    {
      _id: this._id,
      exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, //7 Days
    },
    process.env.JWT_SECRET as string
  );
};

userSchema.index({
  mentorId: 1,
});

const User = model<IUser>("User", userSchema);

export default User;
