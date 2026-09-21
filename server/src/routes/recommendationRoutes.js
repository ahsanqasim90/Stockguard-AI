import mongoose from "mongoose";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { Recommendation } from "../models/Recommendation.js";
import { writeAudit } from "../services/auditService.js";

const router = Router();
router.use(requireAuth);
const statusInput = z.object({ status: z.enum(["approved", "dismissed", "completed"]) });
const failure = (message, statusCode) => { const error = new Error(message); error.statusCode = statusCode; return error; };

function output(item) {
  return { id: item._id.toString(), runId: item.runId, type: item.type, risk: item.risk,
    suggestedQuantity: item.suggestedQuantity, currentStock: item.currentStock,
    reorderPoint: item.reorderPoint, targetStock: item.targetStock, safetyStock: item.safetyStock,
    estimatedRevenue: item.estimatedRevenue, reason: item.reason, status: item.status,
    forecastStartDate: item.forecastStartDate, forecastEndDate: item.forecastEndDate,
    product: item.product ? { id: item.product._id.toString(), name: item.product.name, sku: item.product.sku || item.product.productId } : null,
    store: item.store ? { id: item.store._id.toString(), code: item.store.storeId, name: item.store.name } : null,
    createdAt: item.createdAt, resolvedAt: item.resolvedAt };
}

router.get("/", requirePermission("forecasts.read"), async (request, response) => {
  const items = await Recommendation.find({ business: request.auth.business._id })
    .sort({ createdAt: -1 }).limit(100).populate("product", "name sku productId").populate("store", "name storeId").lean();
  response.json({ recommendations: items.map(output) });
});

router.patch("/:id", requirePermission("forecasts.run"), async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.id)) throw failure("Invalid recommendation ID.", 400);
  const parsed = statusInput.safeParse(request.body);
  if (!parsed.success) throw failure("Choose approved, dismissed or completed.", 400);
  const item = await Recommendation.findOneAndUpdate(
    { _id: request.params.id, business: request.auth.business._id },
    { $set: { status: parsed.data.status, resolvedBy: request.auth.user._id, resolvedAt: new Date() } },
    { returnDocument: "after" },
  ).populate("product", "name sku productId").populate("store", "name storeId");
  if (!item) throw failure("Recommendation not found.", 404);
  await writeAudit(request, { action: `recommendation.${parsed.data.status}`, targetType: "recommendation",
    targetId: item._id, targetLabel: item.reason, metadata: { runId: item.runId, type: item.type } });
  response.json({ recommendation: output(item) });
});

export default router;
