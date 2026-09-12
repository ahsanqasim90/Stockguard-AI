import mongoose from "mongoose";
import { baseOptions, objectId } from "./shared.js";

const businessSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  slug: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true },
  owner: { type: objectId, ref: "User", default: null },
  contactEmail: { type: String, trim: true, lowercase: true },
  timezone: { type: String, default: "Asia/Karachi" },
  currency: { type: String, default: "PKR", uppercase: true },
  status: { type: String, enum: ["active", "suspended"], default: "active", index: true },
  settings: {
    safetyStockPercent: { type: Number, min: 0, max: 100, default: 15 },
    defaultLeadTimeDays: { type: Number, min: 1, max: 365, default: 7 },
    forecastHorizonDays: { type: Number, enum: [7, 14, 28], default: 28 },
  },
}, baseOptions);

export const Business = mongoose.model("Business", businessSchema);
