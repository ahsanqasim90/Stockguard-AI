import mongoose from "mongoose";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { Forecast } from "../models/Forecast.js";
import { ForecastRun } from "../models/ForecastRun.js";
import { Report } from "../models/Report.js";
import { getBusinessAnalytics } from "../services/businessAnalytics.js";
import { writeAudit } from "../services/auditService.js";
import { createProfessionalReportPdf } from "../services/professionalReportPdf.js";

const router = Router();
router.use(requireAuth);
const input = z.object({ type: z.enum(["sales", "inventory", "forecast"]), days: z.number().int().refine((days) => [30, 90, 180, 365].includes(days)).default(180) });
const metadata = (report) => ({ id: report._id.toString(), name: report.name, type: report.type,
  format: report.format, encoding: report.encoding || "utf8", days: report.days, filename: report.filename, sizeBytes: report.sizeBytes,
  createdAt: report.createdAt });
const failure = (message, statusCode) => { const error = new Error(message); error.statusCode = statusCode; return error; };

router.get("/", requirePermission("reports.read"), async (request, response) => {
  const reports = await Report.find({ business: request.auth.business._id, format: "pdf" }).sort({ createdAt: -1 }).limit(100)
    .select("name type format days filename sizeBytes createdAt").lean();
  response.json({ reports: reports.map(metadata) });
});

router.post("/", requirePermission("reports.create"), async (request, response) => {
  const parsed = input.safeParse(request.body);
  if (!parsed.success) throw failure("Choose a valid report type and period.", 400);
  const { type, days } = parsed.data;
  const business = request.auth.business._id;
  let run;
  let predictions = [];
  let periodDays = days;
  if (type === "forecast") {
    run = await ForecastRun.findOne({ business }).sort({ createdAt: -1 }).lean();
    if (!run) throw failure("Run a business forecast before generating its report.", 422);
    predictions = await Forecast.find({ business, runId: run.runId }).sort({ forecastDate: 1 }).select("forecastDate predictedQuantity predictedRevenue").lean();
    if (predictions.length !== run.horizonDays) throw failure("The latest forecast is incomplete. Run it again.", 422);
    periodDays = undefined;
  }
  const overview = await getBusinessAnalytics(business, days);
  const pdf = await createProfessionalReportPdf({ type, overview, run, predictions,
    businessName: request.auth.business.name, generatedAt: new Date() });
  const content = pdf.toString("base64");
  const sizeBytes = pdf.length;
  if (sizeBytes > 4 * 1024 * 1024) throw failure("This PDF report is over 4 MB; choose a shorter period.", 413);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `stockguard-${type}-${stamp}.pdf`;
  const report = await Report.create({ business, createdBy: request.auth.user._id, type, format: "pdf", encoding: "base64",
    days: periodDays, name: `${type[0].toUpperCase()}${type.slice(1)} report`, filename,
    mimeType: "application/pdf", content, sizeBytes });
  await writeAudit(request, { action: "report.generated", targetType: "report", targetId: report._id,
    targetLabel: report.name, metadata: { type, format: "pdf", days: periodDays } });
  response.status(201).json({ report: metadata(report), content, encoding: "base64", mimeType: report.mimeType });
});

router.get("/:id", requirePermission("reports.read"), async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.id)) throw failure("Invalid report ID.", 400);
  const report = await Report.findOne({ _id: request.params.id, business: request.auth.business._id }).lean();
  if (!report) throw failure("Report not found.", 404);
  response.json({ report: metadata(report), content: report.content, encoding: report.encoding || "utf8", mimeType: report.mimeType });
});

export default router;
