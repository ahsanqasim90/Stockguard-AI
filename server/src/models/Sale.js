import mongoose from "mongoose";
import { baseOptions, objectId, tenantFields } from "./shared.js";

const saleSchema = new mongoose.Schema({
  ...tenantFields,
  store: { type: objectId, ref: "Store", required: true, index: true },
  product: { type: objectId, ref: "Product", required: true, index: true },
  date: { type: Date, required: true, index: true },
  quantity: { type: Number, required: true, min: 0 },
  revenue: { type: Number, min: 0, default: 0 },
  price: { type: Number, min: 0, default: 0 },
  promotion: { type: Boolean, default: false },
  source: { type: String, enum: ["csv", "api", "manual", "seed"], default: "csv" },
  importBatchId: { type: String, trim: true, index: true },
}, baseOptions);

saleSchema.index({ business: 1, store: 1, product: 1, date: 1 }, { unique: true });
saleSchema.index({ business: 1, date: -1 });

export const Sale = mongoose.model("Sale", saleSchema);
