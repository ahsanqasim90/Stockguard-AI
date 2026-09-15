import mongoose from "mongoose";
import { baseOptions, objectId, tenantFields } from "./shared.js";

const importBatchSchema = new mongoose.Schema({
  ...tenantFields,
  uploadedBy: { type: objectId, ref: "User", required: true },
  fileName: { type: String, required: true, maxlength: 180 },
  records: { type: Number, required: true, min: 0 },
  salesUpserted: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ["imported"], default: "imported" },
}, baseOptions);

importBatchSchema.index({ business: 1, createdAt: -1 });
export const ImportBatch = mongoose.model("ImportBatch", importBatchSchema);
