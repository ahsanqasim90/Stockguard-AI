import jwt from "jsonwebtoken";

import { env } from "../config/env.js";

export const refreshCookieName = "stockguard_refresh";

export function createAccessToken(user) {
  return jwt.sign(
    {
      businessId: user.business?._id?.toString() || user.business?.toString() || null,
      role: user.role,
      version: user.tokenVersion || 0,
      type: "access",
    },
    env.jwtAccessSecret,
    { subject: user._id.toString(), expiresIn: env.jwtAccessExpiresIn },
  );
}

export function createRefreshToken(user) {
  return jwt.sign(
    { version: user.tokenVersion || 0, type: "refresh" },
    env.jwtRefreshSecret,
    { subject: user._id.toString(), expiresIn: env.jwtRefreshExpiresIn },
  );
}

export function verifyAccessToken(token) {
  const payload = jwt.verify(token, env.jwtAccessSecret);
  if (payload.type !== "access") throw new Error("Invalid access token.");
  return payload;
}

export function verifyRefreshToken(token) {
  const payload = jwt.verify(token, env.jwtRefreshSecret);
  if (payload.type !== "refresh") throw new Error("Invalid refresh token.");
  return payload;
}

export function readCookie(request, name) {
  const header = request.headers.cookie || "";
  const entry = header.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null;
}

export function setRefreshCookie(response, token) {
  response.cookie(refreshCookieName, token, {
    httpOnly: true,
    secure: env.nodeEnv === "production",
    sameSite: env.nodeEnv === "production" ? "none" : "lax",
    path: "/api/auth",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearRefreshCookie(response) {
  response.clearCookie(refreshCookieName, {
    httpOnly: true,
    secure: env.nodeEnv === "production",
    sameSite: env.nodeEnv === "production" ? "none" : "lax",
    path: "/api/auth",
  });
}
