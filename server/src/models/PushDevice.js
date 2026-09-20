import mongoose from "mongoose";
import { baseOptions, objectId } from "./shared.js";

const pushDeviceSchema = new mongoose.Schema({
  business: { type: objectId, ref: "Business", required: true, index: true },
  user: { type: objectId, ref: "User", required: true, index: true },
  token: { type: String, required: true, unique: true, trim: true },
  platform: { type: String, enum: ["ios", "android", "web", "unknown"], default: "unknown" },
  deviceId: { type: String, default: "", trim: true, maxlength: 180 },
  active: { type: Boolean, default: true, index: true },
  lastSeenAt: { type: Date, default: Date.now },
}, baseOptions);

pushDeviceSchema.index({ user: 1, active: 1 });

export const PushDevice = mongoose.model("PushDevice", pushDeviceSchema);
