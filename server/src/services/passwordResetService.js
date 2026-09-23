import crypto from "node:crypto";

import { env } from "../config/env.js";
import { PasswordReset } from "../models/PasswordReset.js";

export function passwordResetHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function passwordResetUrl(token) {
  const base = env.clientUrl.split(",").map((value) => value.trim()).find(Boolean) || "http://localhost:5173";
  return `${base.replace(/\/$/, "")}/reset-password/${token}`;
}

export async function createPasswordReset({ business, user, requestedBy = null }) {
  await PasswordReset.deleteMany({ user, usedAt: null });
  const token = crypto.randomBytes(32).toString("base64url");
  const reset = await PasswordReset.create({
    business,
    user,
    requestedBy,
    tokenHash: passwordResetHash(token),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  });
  return { reset, token, resetUrl: passwordResetUrl(token) };
}
