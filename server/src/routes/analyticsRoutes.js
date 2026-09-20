import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { getBusinessAnalytics } from "../services/businessAnalytics.js";

const router = Router();
router.use(requireAuth);
const querySchema = z.coerce.number().int().refine((days) => [30, 90, 180, 365].includes(days));

router.get("/overview", requirePermission("analytics.read"), async (request, response) => {
  const result = querySchema.safeParse(request.query.days ?? 180);
  if (!result.success) {
    const error = new Error("Choose a 30, 90, 180 or 365-day period.");
    error.statusCode = 400;
    throw error;
  }
  response.json(await getBusinessAnalytics(request.auth.business._id, result.data));
});

export default router;
