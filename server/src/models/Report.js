import mongoose from "mongoose";
import { baseOptions, objectId, tenantFields } from "./shared.js";

const reportSchema = new mongoose.Schema({
  ...tenantFields,
  createdBy: { type: objectId, ref: "User", required: true },
  type: { type: String, enum: ["sales", "inventory", "forecast"], required: true },
  format: { type: String, enum: ["csv", "json"], required: true },
  days: { type: Number, enum: [30, 90, 180, 365] },
  name: { type: String, required: true },
  filename: { type: String, required: true },
  mimeType: { type: String, required: true },
  content: { type: String, required: true },
  sizeBytes: { type: Number, required: true },
}, baseOptions);

reportSchema.index({ business: 1, createdAt: -1 });
export const Report = mongoose.model("Report", reportSchema);
