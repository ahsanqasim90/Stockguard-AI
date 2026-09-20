import mongoose from "mongoose";
import { Router } from "express";
import { z } from "zod";

import { requireAuth } from "../middleware/auth.js";
import { Notification } from "../models/Notification.js";
import { PushDevice } from "../models/PushDevice.js";
import { notificationChannels } from "../services/notificationService.js";

const router = Router();
router.use(requireAuth);

function view(item) {
  return {
    id: item._id.toString(), type: item.type, title: item.title, message: item.message,
    severity: item.severity, link: item.link, data: item.data || {}, readAt: item.readAt,
    createdAt: item.createdAt, delivery: item.delivery,
  };
}
function badRequest(message) { const error = new Error(message); error.statusCode = 400; return error; }

router.get("/", async (request, response) => {
  const limit = Math.min(Math.max(Number(request.query.limit) || 30, 1), 100);
  const filter = { business: request.auth.business._id, user: request.auth.user._id };
  const [items, unread] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).limit(limit).lean(),
    Notification.countDocuments({ ...filter, readAt: null }),
  ]);
  response.json({ notifications: items.map(view), unread, channels: notificationChannels() });
});

router.patch("/:id/read", async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.id)) throw badRequest("Invalid notification ID.");
  const item = await Notification.findOneAndUpdate(
    { _id: request.params.id, business: request.auth.business._id, user: request.auth.user._id },
    { $set: { readAt: new Date() } }, { returnDocument: "after" },
  );
  if (!item) { const error = new Error("Notification was not found."); error.statusCode = 404; throw error; }
  response.json({ notification: view(item) });
});

router.post("/read-all", async (request, response) => {
  const result = await Notification.updateMany(
    { business: request.auth.business._id, user: request.auth.user._id, readAt: null },
    { $set: { readAt: new Date() } },
  );
  response.json({ updated: result.modifiedCount });
});

const deviceSchema = z.object({
  token: z.string().trim().regex(/^(Exponent|Expo)PushToken\[[A-Za-z0-9_-]+\]$/, "Invalid Expo push token."),
  platform: z.enum(["ios", "android", "web", "unknown"]).default("unknown"),
  deviceId: z.string().trim().max(180).optional().default(""),
}).strict();

router.post("/devices", async (request, response) => {
  const parsed = deviceSchema.safeParse(request.body);
  if (!parsed.success) throw badRequest(parsed.error.issues.map((issue) => issue.message).join(" "));
  const device = await PushDevice.findOneAndUpdate(
    { token: parsed.data.token },
    { $set: { business: request.auth.business._id, user: request.auth.user._id, platform: parsed.data.platform,
      deviceId: parsed.data.deviceId, active: true, lastSeenAt: new Date() } },
    { upsert: true, returnDocument: "after" },
  );
  response.status(201).json({ device: { id: device._id.toString(), platform: device.platform, active: device.active } });
});

router.delete("/devices", async (request, response) => {
  const token = String(request.body?.token || "").trim();
  if (!token) throw badRequest("Push token is required.");
  await PushDevice.updateOne({ token, user: request.auth.user._id }, { $set: { active: false } });
  response.status(204).end();
});

export default router;
