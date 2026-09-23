import mongoose from "mongoose";

import { baseOptions, objectId, tenantFields } from "./shared.js";

const passwordResetSchema = new mongoose.Schema({
  ...tenantFields,
  user: { type: objectId, ref: "User", required: true, index: true },
  requestedBy: { type: objectId, ref: "User", default: null },
  tokenHash: { type: String, required: true, unique: true, select: false },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
}, baseOptions);

passwordResetSchema.index({ user: 1, usedAt: 1, expiresAt: 1 });
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PasswordReset = mongoose.model("PasswordReset", passwordResetSchema);
