import mongoose from "mongoose";
import { baseOptions, objectId } from "./shared.js";

const userSchema = new mongoose.Schema({
  business: { type: objectId, ref: "Business", default: null, index: true },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true },
  phone: { type: String, trim: true, maxlength: 40, default: "" },
  bio: { type: String, trim: true, maxlength: 500, default: "" },
  passwordHash: { type: String, required: true, select: false },
  role: {
    type: String,
    enum: ["owner", "admin", "manager", "analyst", "staff"],
    default: "owner",
    index: true,
  },
  status: { type: String, enum: ["active", "invited", "suspended", "disabled"], default: "active", index: true },
  tokenVersion: { type: Number, default: 0, select: false },
  lastLoginAt: { type: Date, default: null },
  permissions: [{ type: String, trim: true }],
  permissionsCustomized: { type: Boolean, default: false },
  preferences: {
    notifications: {
      uploadCompleted: { type: Boolean, default: true },
      lowStock: { type: Boolean, default: true },
      criticalInventory: { type: Boolean, default: true },
      forecastReady: { type: Boolean, default: true },
      weeklySummary: { type: Boolean, default: false },
      demandSpike: { type: Boolean, default: true },
      newLogin: { type: Boolean, default: true },
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
    },
    theme: { type: String, enum: ["dark", "system"], default: "dark" },
  },
}, baseOptions);

export const User = mongoose.model("User", userSchema);
