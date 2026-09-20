import mongoose from "mongoose";
import { baseOptions, objectId } from "./shared.js";

const deliverySchema = new mongoose.Schema({
  status: { type: String, enum: ["pending", "sent", "skipped", "failed"], default: "pending" },
  providerId: { type: String, default: "" },
  error: { type: String, default: "" },
  sentAt: { type: Date, default: null },
}, { _id: false });

const notificationSchema = new mongoose.Schema({
  business: { type: objectId, ref: "Business", required: true, index: true },
  user: { type: objectId, ref: "User", required: true, index: true },
  type: {
    type: String,
    enum: ["upload_completed", "forecast_ready", "low_stock", "critical_inventory"],
    required: true,
    index: true,
  },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  message: { type: String, required: true, trim: true, maxlength: 600 },
  severity: { type: String, enum: ["info", "success", "warning", "critical"], default: "info" },
  link: { type: String, default: "", maxlength: 300 },
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
  dedupeKey: { type: String, default: "", maxlength: 300 },
  readAt: { type: Date, default: null, index: true },
  delivery: {
    email: { type: deliverySchema, default: () => ({ status: "skipped" }) },
    push: { type: deliverySchema, default: () => ({ status: "skipped" }) },
  },
}, baseOptions);

notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ user: 1, dedupeKey: 1 }, {
  unique: true,
  partialFilterExpression: { dedupeKey: { $type: "string", $gt: "" } },
});
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 });

export const Notification = mongoose.model("Notification", notificationSchema);
