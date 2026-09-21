import mongoose from "mongoose";
import { baseOptions, objectId, tenantFields } from "./shared.js";

const recommendationSchema = new mongoose.Schema({
  ...tenantFields,
  store: { type: objectId, ref: "Store", required: true, index: true },
  product: { type: objectId, ref: "Product", required: true, index: true },
  runId: { type: String, required: true, trim: true, index: true },
  type: { type: String, enum: ["reorder", "overstock", "demand_spike"], required: true },
  risk: { type: String, enum: ["low", "medium", "high"], required: true, index: true },
  suggestedQuantity: { type: Number, min: 0, default: 0 },
  currentStock: { type: Number, min: 0, default: 0 },
  reorderPoint: { type: Number, min: 0, default: 0 },
  targetStock: { type: Number, min: 0, default: 0 },
  safetyStock: { type: Number, min: 0, default: 0 },
  estimatedRevenue: { type: Number, min: 0, default: 0 },
  reason: { type: String, required: true, trim: true, maxlength: 500 },
  status: { type: String, enum: ["open", "approved", "dismissed", "completed"], default: "open", index: true },
  forecastStartDate: { type: Date, required: true },
  forecastEndDate: { type: Date, required: true },
  resolvedBy: { type: objectId, ref: "User", default: null },
  resolvedAt: { type: Date, default: null },
}, baseOptions);

recommendationSchema.index({ business: 1, status: 1, risk: 1, createdAt: -1 });
recommendationSchema.index({ business: 1, runId: 1 }, { unique: true });

export const Recommendation = mongoose.model("Recommendation", recommendationSchema);
