import mongoose from "mongoose";
import { baseOptions, tenantFields } from "./shared.js";

const productSchema = new mongoose.Schema({
  ...tenantFields,
  productId: { type: String, required: true, trim: true, uppercase: true },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  sku: { type: String, trim: true, uppercase: true },
  category: { type: String, trim: true, maxlength: 100 },
  supplier: { type: String, trim: true, maxlength: 120 },
  price: { type: Number, min: 0, default: 0 },
  cost: { type: Number, min: 0, default: 0 },
  supplierLeadTimeDays: { type: Number, min: 1, max: 365, default: 7 },
  status: { type: String, enum: ["active", "inactive", "discontinued"], default: "active", index: true },
}, baseOptions);

productSchema.index({ business: 1, productId: 1 }, { unique: true });
productSchema.index({ business: 1, sku: 1 }, { unique: true, sparse: true });

export const Product = mongoose.model("Product", productSchema);
