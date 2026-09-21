import mongoose from "mongoose";
import { baseOptions, objectId, tenantFields } from "./shared.js";

const forecastSchema = new mongoose.Schema({
  ...tenantFields,
  store: { type: objectId, ref: "Store", required: true, index: true },
  product: { type: objectId, ref: "Product", required: true, index: true },
  forecastDate: { type: Date, required: true, index: true },
  predictedQuantity: { type: Number, required: true, min: 0 },
  predictedRevenue: { type: Number, min: 0, default: 0 },
  modelName: { type: String, required: true, default: "xgboost" },
  modelVersion: { type: String, required: true, default: "1.0.0" },
  runId: { type: String, trim: true, index: true },
  horizonDays: { type: Number, required: true, min: 1, max: 365, default: 30 },
  generatedAt: { type: Date, default: Date.now, index: true },
}, baseOptions);

forecastSchema.index(
  { business: 1, store: 1, product: 1, forecastDate: 1, modelVersion: 1 },
  { unique: true },
);
forecastSchema.index({ business: 1, forecastDate: 1 });

export const Forecast = mongoose.model("Forecast", forecastSchema);
