import mongoose from "mongoose";
import { baseOptions, tenantFields } from "./shared.js";

const storeSchema = new mongoose.Schema({
  ...tenantFields,
  storeId: { type: String, required: true, trim: true, uppercase: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  city: { type: String, trim: true, maxlength: 100 },
  address: { type: String, trim: true, maxlength: 300 },
  status: { type: String, enum: ["active", "inactive"], default: "active", index: true },
}, baseOptions);

storeSchema.index({ business: 1, storeId: 1 }, { unique: true });

export const Store = mongoose.model("Store", storeSchema);
