import mongoose from "mongoose";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { Forecast } from "../models/Forecast.js";
import { ForecastRun } from "../models/ForecastRun.js";
import { Report } from "../models/Report.js";
import { getBusinessAnalytics } from "../services/businessAnalytics.js";
import { writeAudit } from "../services/auditService.js";

const router = Router();
router.use(requireAuth);
const input = z.object({ type: z.enum(["sales", "inventory", "forecast"]), days: z.number().int().refine((days) => [30, 90, 180, 365].includes(days)).default(180) });
const csvCell = (value) => {
  const raw = String(value ?? "");
  const safe = /^[=+@\-\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
};
const csv = (rows) => rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
const metadata = (report) => ({ id: report._id.toString(), name: report.name, type: report.type,
  format: report.format, days: report.days, filename: report.filename, sizeBytes: report.sizeBytes,
  createdAt: report.createdAt });
const failure = (message, statusCode) => { const error = new Error(message); error.statusCode = statusCode; return error; };

router.get("/", requirePermission("reports.read"), async (request, response) => {
  const reports = await Report.find({ business: request.auth.business._id }).sort({ createdAt: -1 }).limit(100)
    .select("name type format days filename sizeBytes createdAt").lean();
  response.json({ reports: reports.map(metadata) });
});

router.post("/", requirePermission("reports.create"), async (request, response) => {
  const parsed = input.safeParse(request.body);
  if (!parsed.success) throw failure("Choose a valid report type and period.", 400);
  const { type, days } = parsed.data;
  const business = request.auth.business._id;
  let content;
  let format = "csv";
  let periodDays = days;
  if (type === "forecast") {
    const run = await ForecastRun.findOne({ business }).sort({ createdAt: -1 }).lean();
    if (!run) throw failure("Run a business forecast before generating its report.", 422);
    const predictions = await Forecast.find({ business, runId: run.runId }).sort({ forecastDate: 1 }).select("forecastDate predictedQuantity predictedRevenue").lean();
    if (predictions.length !== run.horizonDays) throw failure("The latest forecast is incomplete. Run it again.", 422);
    const overview = await getBusinessAnalytics(business, days);
    content = JSON.stringify({ project: "StockGuard AI", businessForecast: overview.latestForecast,
      revenueEstimate: run.revenueEstimate, inventoryPlan: run.inventoryPlan,
      recommendations: overview.recommendations.filter((item) => item.runId === run.runId),
      backtest: { observations: run.backtest.observations, cutoff: run.backtest.cutoff.toISOString().slice(0, 10), mae: run.backtest.mae, rmse: run.backtest.rmse },
      predictions: predictions.map((point) => ({ date: point.forecastDate.toISOString().slice(0, 10),
        units: point.predictedQuantity, estimatedRevenue: point.predictedRevenue || 0 })) }, null, 2);
    format = "json";
    periodDays = undefined;
  } else {
    const overview = await getBusinessAnalytics(business, days);
    if (type === "sales") content = csv([["date", "revenue", "units", "sale_records"], ...overview.daily.map((row) => [row.date, row.revenue, row.units, row.records])]);
    else content = csv([["store", "product", "sku", "category", "stock", "reorder_point", "low_stock", "recommendation", "risk", "recommended_order_quantity"],
      ...overview.inventory.map((row) => { const action = overview.recommendations.find((item) => item.status === "open" && item.productId === row.productId && item.store === row.store);
        return [row.store, row.name, row.sku, row.category, row.stock, row.reorderPoint, row.lowStock,
          action?.type || "", action?.risk || "", action?.suggestedQuantity || 0]; })]);
  }
  const sizeBytes = Buffer.byteLength(content, "utf8");
  if (sizeBytes > 1024 * 1024) throw failure("This report is over 1 MB; choose a shorter period.", 413);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `stockguard-${type}-${stamp}.${format}`;
  const report = await Report.create({ business, createdBy: request.auth.user._id, type, format,
    days: periodDays, name: `${type[0].toUpperCase()}${type.slice(1)} report`, filename,
    mimeType: format === "json" ? "application/json" : "text/csv", content, sizeBytes });
  await writeAudit(request, { action: "report.generated", targetType: "report", targetId: report._id,
    targetLabel: report.name, metadata: { type, format, days: periodDays } });
  response.status(201).json({ report: metadata(report), content, mimeType: report.mimeType });
});

router.get("/:id", requirePermission("reports.read"), async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.id)) throw failure("Invalid report ID.", 400);
  const report = await Report.findOne({ _id: request.params.id, business: request.auth.business._id }).lean();
  if (!report) throw failure("Report not found.", 404);
  response.json({ report: metadata(report), content: report.content, mimeType: report.mimeType });
});

export default router;
