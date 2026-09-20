import crypto from "node:crypto";

import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";

import { requireAuth } from "../middleware/auth.js";
import { Business } from "../models/Business.js";
import { AuditLog } from "../models/AuditLog.js";
import { Invitation } from "../models/Invitation.js";
import { User } from "../models/User.js";
import { effectivePermissions, userCan } from "../services/permissions.js";
import {
  clearRefreshCookie,
  createAccessToken,
  createRefreshToken,
  readCookie,
  refreshCookieName,
  setRefreshCookie,
  verifyRefreshToken,
} from "../services/tokenService.js";

const router = Router();

const email = z.string().trim().toLowerCase().email("Enter a valid email address.");
const password = z.string().min(8, "Password must contain at least 8 characters.").max(128);
const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email,
  password,
  businessName: z.string().trim().min(2).max(120),
});
const loginSchema = z.object({ email, password: z.string().min(1).max(128) });
const acceptInvitationSchema = z.object({ password });
const profileSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  businessName: z.string().trim().min(2).max(120).optional(),
  timezone: z.string().trim().min(2).max(80).optional(),
  currency: z.string().trim().min(3).max(3).transform((value) => value.toUpperCase()).optional(),
}).refine((value) => Object.keys(value).length > 0, "Provide at least one profile field.");

function parse(schema, body) {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  const error = new Error(result.error.issues.map((issue) => issue.message).join(" "));
  error.statusCode = 400;
  throw error;
}

function conflict(message) {
  const error = new Error(message);
  error.statusCode = 409;
  return error;
}

function publicUser(user) {
  const business = user.business && typeof user.business === "object" ? user.business : null;
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    lastLoginAt: user.lastLoginAt,
    preferences: user.preferences || {},
    permissions: effectivePermissions(user),
    permissionsCustomized: Boolean(user.permissionsCustomized),
    business: business ? {
      id: business._id.toString(),
      name: business.name,
      timezone: business.timezone,
      currency: business.currency,
    } : null,
  };
}

function issueSession(response, user, statusCode = 200) {
  const accessToken = createAccessToken(user);
  setRefreshCookie(response, createRefreshToken(user));
  return response.status(statusCode).json({ accessToken, user: publicUser(user) });
}

function issueMobileSession(response, user) {
  response.set("Cache-Control", "no-store");
  return response.json({ accessToken: createAccessToken(user), refreshToken: createRefreshToken(user), user: publicUser(user) });
}

async function findActiveRefreshUser(token) {
  if (!token) {
    const error = new Error("Refresh session is missing.");
    error.statusCode = 401;
    throw error;
  }
  const payload = verifyRefreshToken(token);
  const user = await User.findById(payload.sub).select("+tokenVersion").populate("business");
  if (!user || user.status !== "active" || user.business?.status === "suspended" || user.tokenVersion !== payload.version) {
    const error = new Error("Refresh session is no longer valid.");
    error.statusCode = 401;
    throw error;
  }
  return user;
}

async function authenticateCredentials(body) {
  const data = parse(loginSchema, body);
  const user = await User.findOne({ email: data.email }).select("+passwordHash +tokenVersion").populate("business");
  const passwordMatches = user ? await bcrypt.compare(data.password, user.passwordHash) : false;
  if (!user || !passwordMatches) {
    const error = new Error("Email or password is incorrect.");
    error.statusCode = 401;
    throw error;
  }
  if (user.status !== "active" || user.business?.status === "suspended") {
    const error = new Error("This account is not active.");
    error.statusCode = 403;
    throw error;
  }
  user.lastLoginAt = new Date();
  await user.save();
  return user;
}

function makeSlug(name) {
  const base = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "business";
  return `${base}-${crypto.randomBytes(3).toString("hex")}`;
}

function invitationHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function invitationView(invitation) {
  return { email: invitation.email, name: invitation.name, role: invitation.role,
    businessName: invitation.business?.name || "StockGuard workspace", expiresAt: invitation.expiresAt };
}

router.post("/register", async (request, response, next) => {
  let business;
  try {
    const data = parse(registerSchema, request.body);
    if (await User.exists({ email: data.email })) throw conflict("An account with this email already exists.");

    business = await Business.create({
      name: data.businessName,
      slug: makeSlug(data.businessName),
      contactEmail: data.email,
    });
    const passwordHash = await bcrypt.hash(data.password, 12);
    const user = await User.create({
      business: business._id,
      name: data.name,
      email: data.email,
      passwordHash,
      role: "owner",
      status: "active",
      lastLoginAt: new Date(),
    });
    business.owner = user._id;
    await business.save();
    user.business = business;
    return issueSession(response, user, 201);
  } catch (error) {
    if (business?._id && !business.owner) await Business.deleteOne({ _id: business._id }).catch(() => {});
    if (error?.code === 11000) return next(conflict("This account or business already exists."));
    return next(error);
  }
});

router.post("/login", async (request, response, next) => {
  try {
    return issueSession(response, await authenticateCredentials(request.body));
  } catch (error) {
    return next(error);
  }
});

// Native clients cannot rely on the web app's HttpOnly cookie jar. They store
// this refresh token in the OS secure store and send it only to these endpoints.
router.post("/mobile/login", async (request, response, next) => {
  try {
    return issueMobileSession(response, await authenticateCredentials(request.body));
  } catch (error) {
    return next(error);
  }
});

router.post("/mobile/refresh", async (request, response, next) => {
  try {
    const token = parse(z.object({ refreshToken: z.string().min(1) }), request.body).refreshToken;
    return issueMobileSession(response, await findActiveRefreshUser(token));
  } catch (error) {
    if (!error.statusCode) error.statusCode = 401;
    return next(error);
  }
});

router.post("/mobile/logout", async (request, response) => {
  const token = request.body?.refreshToken;
  if (typeof token === "string") {
    try {
      const payload = verifyRefreshToken(token);
      await User.updateOne({ _id: payload.sub, tokenVersion: payload.version }, { $inc: { tokenVersion: 1 } });
    } catch {
      // Expired or malformed sessions are already logged out on the device.
    }
  }
  response.status(204).end();
});

router.get("/invitations/:token", async (request, response) => {
  const invitation = await Invitation.findOne({ tokenHash: invitationHash(request.params.token), status: "pending" }).select("+tokenHash").populate("business");
  if (!invitation) {
    const error = new Error("This invitation is invalid or has already been used.");
    error.statusCode = 404;
    throw error;
  }
  if (invitation.expiresAt <= new Date()) {
    invitation.status = "expired";
    await invitation.save();
    const error = new Error("This invitation has expired. Ask an administrator for a new link.");
    error.statusCode = 410;
    throw error;
  }
  response.json({ invitation: invitationView(invitation) });
});

router.post("/invitations/:token/accept", async (request, response) => {
  const data = parse(acceptInvitationSchema, request.body);
  const invitation = await Invitation.findOne({ tokenHash: invitationHash(request.params.token), status: "pending" }).select("+tokenHash").populate("business");
  if (!invitation) {
    const error = new Error("This invitation is invalid or has already been used.");
    error.statusCode = 404;
    throw error;
  }
  if (invitation.expiresAt <= new Date()) {
    invitation.status = "expired";
    await invitation.save();
    const error = new Error("This invitation has expired. Ask an administrator for a new link.");
    error.statusCode = 410;
    throw error;
  }
  const user = await User.findOne({ _id: invitation.user, business: invitation.business._id, status: "invited" }).select("+tokenVersion");
  if (!user) {
    const error = new Error("The invited account is no longer available.");
    error.statusCode = 404;
    throw error;
  }
  user.passwordHash = await bcrypt.hash(data.password, 12);
  user.status = "active";
  user.lastLoginAt = new Date();
  invitation.status = "accepted";
  invitation.acceptedAt = new Date();
  await Promise.all([user.save(), invitation.save()]);
  await AuditLog.create({ business: invitation.business._id, actor: user._id, actorName: user.name,
    action: "invitation.accepted", targetType: "user", targetId: user._id.toString(),
    targetLabel: user.email, severity: "security", ipAddress: String(request.ip || "").slice(0, 100),
    userAgent: String(request.get("user-agent") || "").slice(0, 300) });
  user.business = invitation.business;
  return issueSession(response, user);
});

router.post("/refresh", async (request, response, next) => {
  try {
    const token = readCookie(request, refreshCookieName);
    return issueSession(response, await findActiveRefreshUser(token));
  } catch (error) {
    clearRefreshCookie(response);
    if (!error.statusCode) error.statusCode = 401;
    return next(error);
  }
});

router.get("/me", requireAuth, (request, response) => {
  response.json({ user: publicUser(request.auth.user) });
});

router.patch("/me", requireAuth, async (request, response) => {
  const data = parse(profileSchema, request.body);
  const user = request.auth.user;
  if (data.name) user.name = data.name;
  const businessFields = ["businessName", "timezone", "currency"].filter((field) => data[field] !== undefined);
  if (businessFields.length) {
    if (!userCan(user, "settings.manage")) {
      const error = new Error("Only owners and administrators can change business details.");
      error.statusCode = 403;
      throw error;
    }
    if (data.businessName) request.auth.business.name = data.businessName;
    if (data.timezone) request.auth.business.timezone = data.timezone;
    if (data.currency) request.auth.business.currency = data.currency;
    await request.auth.business.save();
  }
  await user.save();
  user.business = request.auth.business;
  response.json({ user: publicUser(user) });
});

router.post("/logout", async (request, response) => {
  const token = readCookie(request, refreshCookieName);
  if (token) {
    try {
      const payload = verifyRefreshToken(token);
      await User.updateOne({ _id: payload.sub, tokenVersion: payload.version }, { $inc: { tokenVersion: 1 } });
    } catch {
      // An expired or malformed cookie still needs to be cleared.
    }
  }
  clearRefreshCookie(response);
  response.status(204).end();
});

export default router;
