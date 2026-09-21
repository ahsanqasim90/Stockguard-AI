import mongoose from "mongoose";
import { baseOptions, objectId, tenantFields } from "./shared.js";

const forecastRunSchema = new mongoose.Schema({
  ...tenantFields,
  runId: { type: String, required: true, unique: true, index: true },
  store: { type: objectId, ref: "Store", required: true, index: true },
  product: { type: objectId, ref: "Product", required: true, index: true },
  modelName: { type: String, required: true },
  modelVersion: { type: String, required: true },
  modelSelection: { type: String, default: null },
  comparisonServiceVersion: { type: String, default: null },
  modelComparison: [{
    modelName: { type: String, required: true },
    modelVersion: { type: String, required: true },
    mae: { type: Number, required: true, min: 0 },
    rmse: { type: Number, required: true, min: 0 },
    selected: { type: Boolean, required: true, default: false },
    durationMs: { type: Number, required: true, min: 0, default: 0 },
  }],
  horizonDays: { type: Number, required: true, enum: [7, 14, 28, 30] },
  latestActualDate: { type: Date, required: true },
  forecastStartDate: { type: Date, required: true },
  forecastTotal: { type: Number, required: true, min: 0 },
  revenueEstimate: {
    unitRevenue: { type: Number, min: 0, default: 0 },
    source: { type: String, enum: ["historical_average", "product_price", "unavailable"], default: "unavailable" },
    forecastRevenue: { type: Number, min: 0, default: 0 },
  },
  inventoryPlan: {
    currentStock: { type: Number, min: 0, default: 0 },
    reservedStock: { type: Number, min: 0, default: 0 },
    availableStock: { type: Number, min: 0, default: 0 },
    leadTimeDays: { type: Number, min: 1, default: 7 },
    safetyStockPercent: { type: Number, min: 0, max: 100, default: 15 },
    averageDailyDemand: { type: Number, min: 0, default: 0 },
    leadTimeDemand: { type: Number, min: 0, default: 0 },
    safetyStock: { type: Number, min: 0, default: 0 },
    reorderPoint: { type: Number, min: 0, default: 0 },
    targetStock: { type: Number, min: 0, default: 0 },
    recommendedOrderQuantity: { type: Number, min: 0, default: 0 },
    action: { type: String, enum: ["reorder", "overstock", "none"], default: "none" },
    risk: { type: String, enum: ["low", "medium", "high"], default: "low" },
  },
  backtest: {
    observations: { type: Number, required: true },
    cutoff: { type: Date, required: true },
    mae: { type: Number, required: true, min: 0 },
    rmse: { type: Number, required: true, min: 0 },
  },
  history: [{ date: { type: Date, required: true }, quantity: { type: Number, required: true, min: 0 } }],
}, baseOptions);

forecastRunSchema.index({ business: 1, createdAt: -1 });
export const ForecastRun = mongoose.model("ForecastRun", forecastRunSchema);
