import crypto from "node:crypto";

import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { Router } from "express";
import { z } from "zod";

import { databaseStatus } from "../config/database.js";
import { env } from "../config/env.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { AuditLog } from "../models/AuditLog.js";
import { ForecastRun } from "../models/ForecastRun.js";
import { ImportBatch } from "../models/ImportBatch.js";
import { Invitation } from "../models/Invitation.js";
import { Product } from "../models/Product.js";
import { Report } from "../models/Report.js";
import { Sale } from "../models/Sale.js";
import { User } from "../models/User.js";
import { writeAudit } from "../services/auditService.js";
import { effectivePermissions, permissions, rolePermissions } from "../services/permissions.js";
import { pythonMlStatus } from "../services/pythonMlService.js";
import { productionModelStatus } from "../services/xgboostRuntime.js";
import { createPasswordReset } from "../services/passwordResetService.js";

const router = Router();
router.use(requireAuth);

const role = z.enum(["admin", "manager", "analyst", "staff"]);
const permission = z.enum(permissions);
const invitationSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
  role: role.default("staff"),
  permissions: z.array(permission).optional(),
}).strict();
const createSchema = invitationSchema.extend({ password: z.string().min(8).max(128) });
const updateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  role: role.optional(),
  status: z.enum(["active", "suspended"]).optional(),
  permissions: z.array(permission).nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Provide at least one user change.");

function parse(schema, body) {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  const error = new Error(result.error.issues.map((issue) => issue.message).join(" "));
  error.statusCode = 400;
  throw error;
}
function failure(message, statusCode) { const error = new Error(message); error.statusCode = statusCode; return error; }
function tokenHash(token) { return crypto.createHash("sha256").update(token).digest("hex"); }
function inviteUrl(request, token) {
  const configured = env.clientUrl.split(",").map((value) => value.trim()).filter(Boolean);
  const requestOrigin = request.get("origin");
  const base = requestOrigin && configured.includes(requestOrigin) ? requestOrigin : configured[0];
  return `${base.replace(/\/$/, "")}/invite/${token}`;
}
function view(user, uploadCount = 0) {
  return { id: user._id.toString(), name: user.name, email: user.email, role: user.role,
    status: user.status === "disabled" ? "suspended" : user.status, lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt, uploads: uploadCount, permissions: effectivePermissions(user),
    permissionsCustomized: Boolean(user.permissionsCustomized) };
}
function auditView(log) {
  return { id: log._id.toString(), action: log.action, actorName: log.actorName, actorId: log.actor?.toString() || null,
    targetType: log.targetType, targetId: log.targetId, targetLabel: log.targetLabel,
    severity: log.severity, metadata: log.metadata || {}, ipAddress: log.ipAddress, createdAt: log.createdAt };
}
async function getManagedUser(request) {
  if (!mongoose.isValidObjectId(request.params.id)) throw failure("Invalid user ID.", 400);
  const user = await User.findOne({ _id: request.params.id, business: request.auth.business._id }).select("+tokenVersion");
  if (!user) throw failure("User was not found.", 404);
  return user;
}
async function ensureCapacity(business) {
  if (await User.countDocuments({ business }) >= 100) throw failure("This workspace has reached its 100-user limit.", 409);
}
async function createInvite(request, data) {
  const business = request.auth.business._id;
  const existing = await User.findOne({ email: data.email }).select("+tokenVersion +passwordHash");
  if (existing && (!existing.business?.equals(business) || existing.status !== "invited")) throw failure("An account with this email already exists.", 409);
  if (!existing) await ensureCapacity(business);
  const user = existing || await User.create({ business, name: data.name, email: data.email,
    passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 12), role: data.role, status: "invited" });
  user.name = data.name; user.role = data.role; user.status = "invited";
  if (data.permissions) { user.permissions = data.permissions; user.permissionsCustomized = true; }
  else { user.permissions = []; user.permissionsCustomized = false; }
  await user.save();
  await Invitation.updateMany({ business, email: data.email, status: "pending" }, { $set: { status: "revoked" } });
  const token = crypto.randomBytes(32).toString("base64url");
  const invitation = await Invitation.create({ business, user: user._id, invitedBy: request.auth.user._id,
    email: data.email, name: data.name, role: data.role, tokenHash: tokenHash(token),
    expiresAt: new Date(Date.now() + 7 * 86400000) });
  return { user, invitation, token };
}

router.get("/roles", requirePermission("users.manage"), (_request, response) => {
  response.json({ permissions, roles: Object.entries(rolePermissions).map(([name, values]) => ({ name, permissions: values })) });
});

router.get("/users", requirePermission("users.manage"), async (request, response) => {
  const business = request.auth.business._id;
  const [users, uploads] = await Promise.all([
    User.find({ business }).sort({ role: 1, name: 1 }).lean(),
    ImportBatch.aggregate([{ $match: { business } }, { $group: { _id: "$uploadedBy", count: { $sum: 1 } } }]),
  ]);
  const byUser = new Map(uploads.map((item) => [item._id.toString(), item.count]));
  response.json({ users: users.map((user) => view(user, byUser.get(user._id.toString()) || 0)) });
});

// Retained for API clients that need to provision an active account immediately.
router.post("/users", requirePermission("users.manage"), async (request, response) => {
  const data = parse(createSchema, request.body);
  await ensureCapacity(request.auth.business._id);
  if (await User.exists({ email: data.email })) throw failure("An account with this email already exists.", 409);
  const user = await User.create({ business: request.auth.business._id, name: data.name, email: data.email,
    passwordHash: await bcrypt.hash(data.password, 12), role: data.role, status: "active",
    permissions: data.permissions || [], permissionsCustomized: Boolean(data.permissions) });
  await writeAudit(request, { action: "user.created", targetType: "user", targetId: user._id,
    targetLabel: user.email, severity: "security", metadata: { role: user.role } });
  response.status(201).json({ user: view(user) });
});

router.post("/invitations", requirePermission("users.manage"), async (request, response) => {
  const data = parse(invitationSchema, request.body);
  const { user, invitation, token } = await createInvite(request, data);
  await writeAudit(request, { action: "user.invited", targetType: "user", targetId: user._id,
    targetLabel: user.email, severity: "security", metadata: { role: user.role, expiresAt: invitation.expiresAt } });
  response.status(201).json({ user: view(user), invitation: { id: invitation._id.toString(), email: invitation.email,
    status: invitation.status, expiresAt: invitation.expiresAt, inviteUrl: inviteUrl(request, token) } });
});

router.post("/invitations/:id/resend", requirePermission("users.manage"), async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.id)) throw failure("Invalid user ID.", 400);
  const user = await User.findOne({ _id: request.params.id, business: request.auth.business._id, status: "invited" });
  if (!user) throw failure("Pending invitation was not found.", 404);
  const { invitation, token } = await createInvite(request, { name: user.name, email: user.email, role: user.role,
    permissions: user.permissionsCustomized ? user.permissions : undefined });
  await writeAudit(request, { action: "invitation.renewed", targetType: "user", targetId: user._id,
    targetLabel: user.email, severity: "security", metadata: { expiresAt: invitation.expiresAt } });
  response.json({ invitation: { id: invitation._id.toString(), email: invitation.email,
    status: invitation.status, expiresAt: invitation.expiresAt, inviteUrl: inviteUrl(request, token) } });
});

router.delete("/invitations/:id", requirePermission("users.manage"), async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.id)) throw failure("Invalid user ID.", 400);
  const user = await User.findOne({ _id: request.params.id, business: request.auth.business._id, status: "invited" });
  if (!user) throw failure("Pending invitation was not found.", 404);
  await Promise.all([
    Invitation.updateMany({ business: request.auth.business._id, user: user._id, status: "pending" }, { $set: { status: "revoked" } }),
    User.deleteOne({ _id: user._id }),
  ]);
  await writeAudit(request, { action: "invitation.revoked", targetType: "user", targetId: user._id,
    targetLabel: user.email, severity: "security" });
  response.status(204).end();
});

router.patch("/users/:id", requirePermission("users.manage"), async (request, response) => {
  const data = parse(updateSchema, request.body);
  const user = await getManagedUser(request);
  if (user.role === "owner") throw failure("The workspace owner cannot be changed here.", 403);
  if (user._id.equals(request.auth.user._id) && data.status === "suspended") throw failure("You cannot suspend your own account.", 400);
  const before = { name: user.name, role: user.role, status: user.status, permissions: effectivePermissions(user) };
  if (data.name) user.name = data.name;
  if (data.role) user.role = data.role;
  if (data.permissions !== undefined) {
    user.permissions = data.permissions || [];
    user.permissionsCustomized = data.permissions !== null;
  }
  if (data.status && data.status !== user.status) { user.status = data.status; user.tokenVersion += 1; }
  await user.save();
  await writeAudit(request, { action: data.status === "suspended" ? "user.suspended" : data.status === "active" ? "user.reactivated" : "user.access_updated",
    targetType: "user", targetId: user._id, targetLabel: user.email, severity: "security",
    metadata: { before, after: { name: user.name, role: user.role, status: user.status, permissions: effectivePermissions(user) } } });
  response.json({ user: view(user) });
});

router.post("/users/:id/password-reset", requirePermission("users.manage"), async (request, response) => {
  const user = await getManagedUser(request);
  if (user.status !== "active") throw failure("Only active users can receive a password reset link.", 409);
  const { reset, resetUrl } = await createPasswordReset({ business: request.auth.business._id,
    user: user._id, requestedBy: request.auth.user._id });
  await writeAudit(request, { action: "password.reset_link_created", targetType: "user", targetId: user._id,
    targetLabel: user.email, severity: "security", metadata: { expiresAt: reset.expiresAt } });
  response.status(201).json({ reset: { resetUrl, expiresAt: reset.expiresAt } });
});

router.get("/audit", requirePermission("audit.read"), async (request, response) => {
  const limit = Math.min(Math.max(Number(request.query.limit) || 50, 1), 200);
  const query = { business: request.auth.business._id };
  if (["info", "security", "warning"].includes(request.query.severity)) query.severity = request.query.severity;
  const logs = await AuditLog.find(query).sort({ createdAt: -1 }).limit(limit).lean();
  response.json({ audit: logs.map(auditView) });
});

router.get("/activity", requirePermission("system.read"), async (request, response) => {
  const business = request.auth.business._id;
  const dayAgo = new Date(Date.now() - 86400000), monthAgo = new Date(Date.now() - 30 * 86400000);
  const [users, activeUsers, invitedUsers, suspendedUsers, products, sales, imports, importsToday,
    forecasts, forecastsToday, reports, securityEvents, recent] = await Promise.all([
    User.countDocuments({ business }), User.countDocuments({ business, status: "active" }),
    User.countDocuments({ business, status: "invited" }), User.countDocuments({ business, status: { $in: ["suspended", "disabled"] } }),
    Product.countDocuments({ business, status: { $ne: "discontinued" } }), Sale.countDocuments({ business }),
    ImportBatch.countDocuments({ business }), ImportBatch.countDocuments({ business, createdAt: { $gte: dayAgo } }),
    ForecastRun.countDocuments({ business }), ForecastRun.countDocuments({ business, createdAt: { $gte: dayAgo } }),
    Report.countDocuments({ business }), AuditLog.countDocuments({ business, severity: { $in: ["security", "warning"] }, createdAt: { $gte: monthAgo } }),
    AuditLog.find({ business }).sort({ createdAt: -1 }).limit(8).lean(),
  ]);
  response.json({ activity: { generatedAt: new Date(), users: { total: users, active: activeUsers, invited: invitedUsers, suspended: suspendedUsers },
    data: { products, sales, imports, importsToday, forecasts, forecastsToday, reports }, securityEvents,
    services: { mongodb: databaseStatus(), productionModel: productionModelStatus(), pythonMl: await pythonMlStatus() },
    recent: recent.map(auditView) } });
});

export default router;
