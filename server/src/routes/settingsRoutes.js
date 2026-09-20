import { Router } from "express";
import { z } from "zod";

import { requireAuth } from "../middleware/auth.js";
import { writeAudit } from "../services/auditService.js";
import { userCan } from "../services/permissions.js";

const router = Router();
router.use(requireAuth);

const notificationSchema = z.object({
  lowStock: z.boolean().optional(),
  forecastReady: z.boolean().optional(),
  weeklySummary: z.boolean().optional(),
  demandSpike: z.boolean().optional(),
  newLogin: z.boolean().optional(),
  email: z.boolean().optional(),
}).strict();

const settingsSchema = z.object({
  notifications: notificationSchema.optional(),
  theme: z.enum(["dark", "system"]).optional(),
  safetyStockPercent: z.coerce.number().min(0).max(100).optional(),
  defaultLeadTimeDays: z.coerce.number().int().min(1).max(365).optional(),
  forecastHorizonDays: z.coerce.number().int().refine((value) => [7, 14, 28].includes(value), "Forecast horizon must be 7, 14 or 28 days.").optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Provide at least one setting.");

const defaults = {
  lowStock: true,
  forecastReady: true,
  weeklySummary: false,
  demandSpike: true,
  newLogin: true,
  email: true,
};

function parse(body) {
  const result = settingsSchema.safeParse(body);
  if (result.success) return result.data;
  const error = new Error(result.error.issues.map((issue) => issue.message).join(" "));
  error.statusCode = 400;
  throw error;
}

function output(user, business) {
  return {
    notifications: { ...defaults, ...(user.preferences?.notifications?.toObject?.() || user.preferences?.notifications || {}) },
    theme: user.preferences?.theme || "dark",
    business: {
      safetyStockPercent: business.settings?.safetyStockPercent ?? 15,
      defaultLeadTimeDays: business.settings?.defaultLeadTimeDays ?? 7,
      forecastHorizonDays: business.settings?.forecastHorizonDays ?? 28,
    },
  };
}

router.get("/", (request, response) => {
  response.json({ settings: output(request.auth.user, request.auth.business) });
});

router.patch("/", async (request, response) => {
  const data = parse(request.body);
  const { user, business } = request.auth;

  if (data.notifications) {
    for (const [key, value] of Object.entries(data.notifications)) {
      user.set(`preferences.notifications.${key}`, value);
    }
  }
  if (data.theme) user.set("preferences.theme", data.theme);

  const businessKeys = ["safetyStockPercent", "defaultLeadTimeDays", "forecastHorizonDays"];
  const requestedBusinessKeys = businessKeys.filter((key) => data[key] !== undefined);
  if (requestedBusinessKeys.length) {
    if (!userCan(user, "settings.manage")) {
      const error = new Error("Only owners and administrators can change business settings.");
      error.statusCode = 403;
      throw error;
    }
    for (const key of requestedBusinessKeys) business.set(`settings.${key}`, data[key]);
    await business.save();
  }

  await user.save();
  await writeAudit(request, { action: "settings.updated", targetType: "settings", targetId: user._id,
    targetLabel: user.email, metadata: { fields: Object.keys(data) } });
  response.json({ settings: output(user, business) });
});

export default router;
