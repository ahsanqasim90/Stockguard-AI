import mongoose from "mongoose";
import { baseOptions, objectId, tenantFields } from "./shared.js";

const auditLogSchema = new mongoose.Schema({
  ...tenantFields,
  actor: { type: objectId, ref: "User", default: null, index: true },
  actorName: { type: String, default: "System", maxlength: 100 },
  action: { type: String, required: true, trim: true, maxlength: 100, index: true },
  targetType: { type: String, required: true, trim: true, maxlength: 60 },
  targetId: { type: String, default: "", maxlength: 120 },
  targetLabel: { type: String, default: "", maxlength: 180 },
  severity: { type: String, enum: ["info", "security", "warning"], default: "info", index: true },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  ipAddress: { type: String, default: "", maxlength: 100 },
  userAgent: { type: String, default: "", maxlength: 300 },
}, baseOptions);

auditLogSchema.index({ business: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 365 });

export const AuditLog = mongoose.model("AuditLog", auditLogSchema);
