import mongoose from "mongoose";
import { baseOptions, objectId, tenantFields } from "./shared.js";

const inventorySchema = new mongoose.Schema({
  ...tenantFields,
  store: { type: objectId, ref: "Store", required: true, index: true },
  product: { type: objectId, ref: "Product", required: true, index: true },
  quantityOnHand: { type: Number, min: 0, default: 0 },
  quantityReserved: { type: Number, min: 0, default: 0 },
  reorderPoint: { type: Number, min: 0, default: 0 },
  targetStock: { type: Number, min: 0, default: 0 },
  lastCountedAt: { type: Date, default: Date.now },
}, baseOptions);

inventorySchema.index({ business: 1, store: 1, product: 1 }, { unique: true });

export const Inventory = mongoose.model("Inventory", inventorySchema);
