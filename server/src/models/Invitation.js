import mongoose from "mongoose";
import { baseOptions, objectId, tenantFields } from "./shared.js";

const invitationSchema = new mongoose.Schema({
  ...tenantFields,
  user: { type: objectId, ref: "User", required: true, index: true },
  invitedBy: { type: objectId, ref: "User", required: true },
  email: { type: String, required: true, trim: true, lowercase: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  role: { type: String, enum: ["admin", "manager", "analyst", "staff"], required: true },
  tokenHash: { type: String, required: true, unique: true, select: false },
  status: { type: String, enum: ["pending", "accepted", "revoked", "expired"], default: "pending", index: true },
  expiresAt: { type: Date, required: true },
  acceptedAt: { type: Date, default: null },
}, baseOptions);

invitationSchema.index({ business: 1, email: 1, status: 1 });
invitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

export const Invitation = mongoose.model("Invitation", invitationSchema);
