import mongoose from "mongoose";
import { baseOptions, objectId, tenantFields } from "./shared.js";

const forecastRunSchema = new mongoose.Schema({
  ...tenantFields,
  runId: { type: String, required: true, unique: true, index: true },
  store: { type: objectId, ref: "Store", required: true, index: true },
  product: { type: objectId, ref: "Product", required: true, index: true },
  modelName: { type: String, required: true },
  modelVersion: { type: String, required: true },
  horizonDays: { type: Number, required: true, enum: [7, 14, 28] },
  latestActualDate: { type: Date, required: true },
  forecastStartDate: { type: Date, required: true },
  forecastTotal: { type: Number, required: true, min: 0 },
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
