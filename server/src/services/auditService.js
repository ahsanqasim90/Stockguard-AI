import { AuditLog } from "../models/AuditLog.js";

export async function writeAudit(request, details) {
  try {
    await AuditLog.create({
      business: request.auth.business._id,
      actor: request.auth.user._id,
      actorName: request.auth.user.name,
      action: details.action,
      targetType: details.targetType,
      targetId: String(details.targetId || ""),
      targetLabel: String(details.targetLabel || "").slice(0, 180),
      severity: details.severity || "info",
      metadata: details.metadata || {},
      ipAddress: String(request.ip || request.socket?.remoteAddress || "").slice(0, 100),
      userAgent: String(request.get("user-agent") || "").slice(0, 300),
    });
  } catch (error) {
    console.error("Audit log write failed:", error.message);
  }
}
