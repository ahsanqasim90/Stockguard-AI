import nodemailer from "nodemailer";

import { env } from "../config/env.js";
import { Notification } from "../models/Notification.js";
import { PushDevice } from "../models/PushDevice.js";
import { User } from "../models/User.js";

const preferenceByType = {
  upload_completed: "uploadCompleted",
  forecast_ready: "forecastReady",
  low_stock: "lowStock",
  critical_inventory: "criticalInventory",
};

let transporter;
function emailConfigured() {
  return Boolean(env.smtpHost && env.smtpUser && env.smtpPass && env.emailFrom);
}
function emailTransport() {
  if (!transporter) transporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    auth: { user: env.smtpUser, pass: env.smtpPass },
    connectionTimeout: 6_000,
    greetingTimeout: 6_000,
    socketTimeout: 10_000,
  });
  return transporter;
}
function safeError(error) {
  return String(error?.message || error || "Delivery failed.").slice(0, 400);
}
function html(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character]);
}

async function deliverEmail(notification, user) {
  const enabled = user.preferences?.notifications?.email !== false;
  if (!enabled || !emailConfigured()) {
    notification.delivery.email = { status: "skipped", error: enabled ? "SMTP is not configured." : "Disabled by user." };
    return;
  }
  try {
    const result = await emailTransport().sendMail({
      from: env.emailFrom,
      to: user.email,
      subject: `StockGuard AI: ${notification.title}`,
      text: `${notification.title}\n\n${notification.message}\n\nOpen StockGuard AI: ${env.clientUrl.split(",")[0]}`,
      html: `<div style="font-family:Arial,sans-serif;color:#10203b"><h2>${html(notification.title)}</h2><p>${html(notification.message)}</p><p><a href="${html(env.clientUrl.split(",")[0])}">Open StockGuard AI</a></p></div>`,
    });
    notification.delivery.email = { status: "sent", providerId: result.messageId || "", sentAt: new Date() };
  } catch (error) {
    notification.delivery.email = { status: "failed", error: safeError(error) };
  }
}

async function deliverPush(notification, user) {
  if (user.preferences?.notifications?.push === false) {
    notification.delivery.push = { status: "skipped", error: "Disabled by user." };
    return;
  }
  const devices = await PushDevice.find({ user: user._id, active: true }).lean();
  if (!devices.length) {
    notification.delivery.push = { status: "skipped", error: "No registered mobile device." };
    return;
  }
  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        ...(env.expoAccessToken ? { Authorization: `Bearer ${env.expoAccessToken}` } : {}),
      },
      body: JSON.stringify(devices.map((device) => ({
        to: device.token,
        sound: "default",
        title: notification.title,
        body: notification.message,
        data: { notificationId: notification._id.toString(), type: notification.type, link: notification.link, ...notification.data },
      }))),
      signal: AbortSignal.timeout(10_000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.errors?.[0]?.message || `Expo push returned ${response.status}.`);
    const tickets = Array.isArray(payload.data) ? payload.data : [];
    const invalidTokens = devices.filter((_device, index) => tickets[index]?.details?.error === "DeviceNotRegistered").map((device) => device.token);
    if (invalidTokens.length) await PushDevice.updateMany({ token: { $in: invalidTokens } }, { $set: { active: false } });
    const successful = tickets.filter((ticket) => ticket?.status === "ok");
    if (!successful.length) throw new Error(tickets[0]?.message || "Expo did not accept the push notification.");
    notification.delivery.push = { status: "sent", providerId: successful.map((ticket) => ticket.id).filter(Boolean).join(","), sentAt: new Date() };
  } catch (error) {
    notification.delivery.push = { status: "failed", error: safeError(error) };
  }
}

export function notificationChannels() {
  return { emailConfigured: emailConfigured(), pushConfigured: true };
}

export async function publishNotification({
  business, recipients, type, title, message, severity = "info", link = "/dashboard", data = {}, dedupeKey = "",
}) {
  const filter = { business, status: "active" };
  if (recipients?.length) filter._id = { $in: recipients };
  const users = await User.find(filter).select("name email preferences");
  const preference = preferenceByType[type];
  const created = [];
  for (const user of users) {
    if (preference && user.preferences?.notifications?.[preference] === false) continue;
    let notification;
    if (dedupeKey) {
      const result = await Notification.updateOne(
        { user: user._id, dedupeKey },
        { $setOnInsert: { business, user: user._id, type, title, message, severity, link, data, dedupeKey } },
        { upsert: true },
      );
      if (!result.upsertedCount) continue;
      notification = await Notification.findById(result.upsertedId);
    } else {
      notification = await Notification.create({ business, user: user._id, type, title, message, severity, link, data });
    }
    await Promise.all([deliverEmail(notification, user), deliverPush(notification, user)]);
    await notification.save();
    created.push(notification);
  }
  return created;
}

export async function notifyInventoryLevel({ business, product, inventory, storeLabel = "Main store" }) {
  const stock = Number(inventory.quantityOnHand || 0);
  const reorder = Number(inventory.reorderPoint || 0);
  if (reorder <= 0 || stock >= reorder) return [];
  const critical = stock === 0 || stock < reorder * 0.6;
  const type = critical ? "critical_inventory" : "low_stock";
  return publishNotification({
    business,
    type,
    title: critical ? `Critical inventory: ${product.name}` : `Low stock: ${product.name}`,
    message: `${product.name} (${product.sku || product.productId}) has ${stock} units at ${storeLabel}; reorder point is ${reorder}.`,
    severity: critical ? "critical" : "warning",
    link: "/dashboard?section=products",
    data: { productId: product._id.toString(), stock, reorder, store: storeLabel },
    dedupeKey: `inventory:${product._id}:${storeLabel}:${type}:${stock}:${reorder}`,
  });
}
