import crypto from "node:crypto";
import mongoose from "mongoose";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { Forecast } from "../models/Forecast.js";
import { ForecastRun } from "../models/ForecastRun.js";
import { Product } from "../models/Product.js";
import { Sale } from "../models/Sale.js";
import { Store } from "../models/Store.js";
import { createBusinessForecast, forecastError, selectBestForecast } from "../services/businessForecast.js";
import { comparePythonModels } from "../services/pythonMlService.js";
import { writeAudit } from "../services/auditService.js";

const router = Router();
router.use(requireAuth);
const input = z.object({
  storeId: z.string(), productId: z.string(), horizon: z.number().int().refine((n) => [7, 14, 28].includes(n)),
});
function businessId(request) { return request.auth.business._id; }
function dateString(value) { return new Date(value).toISOString().slice(0, 10); }

async function publicRun(run) {
  if (!run) return null;
  const [store, product, forecasts] = await Promise.all([
    Store.findOne({ _id: run.store, business: run.business }).lean(),
    Product.findOne({ _id: run.product, business: run.business }).lean(),
    Forecast.find({ business: run.business, runId: run.runId }).sort({ forecastDate: 1 }).lean(),
  ]);
  if (!store || !product || forecasts.length !== run.horizonDays) return null;
  return { id: run.runId, storeId: store._id.toString(), storeCode: store.storeId,
    productId: product._id.toString(), sku: product.sku || product.productId, productName: product.name,
    model: run.modelName, modelVersion: run.modelVersion, modelSelection: run.modelSelection || null,
    comparisonServiceVersion: run.comparisonServiceVersion || null,
    comparisons: (run.modelComparison || []).map((item) => ({ model: item.modelName,
      modelVersion: item.modelVersion, mae: item.mae, rmse: item.rmse,
      selected: item.selected, durationMs: item.durationMs })),
    horizon: run.horizonDays,
    latestActualDate: dateString(run.latestActualDate), forecastStartDate: dateString(run.forecastStartDate),
    forecastTotal: run.forecastTotal, generatedAt: run.createdAt,
    backtest: { observations: run.backtest.observations, cutoff: dateString(run.backtest.cutoff),
      mae: run.backtest.mae, rmse: run.backtest.rmse },
    history: run.history.map((point) => ({ date: dateString(point.date), quantity: point.quantity })),
    predictions: forecasts.map((point) => ({ date: dateString(point.forecastDate), forecast_sales: point.predictedQuantity })),
  };
}

router.get("/series", requirePermission("forecasts.read"), async (request, response) => {
  const business = businessId(request);
  const groups = await Sale.aggregate([
    { $match: { business } },
    { $group: { _id: { store: "$store", product: "$product" }, observations: { $sum: 1 },
      firstDate: { $min: "$date" }, lastDate: { $max: "$date" } } },
    { $sort: { lastDate: -1 } }, { $limit: 500 },
  ]);
  const [stores, products] = await Promise.all([
    Store.find({ business, _id: { $in: groups.map((g) => g._id.store) } }).lean(),
    Product.find({ business, _id: { $in: groups.map((g) => g._id.product) }, status: { $ne: "discontinued" } }).lean(),
  ]);
  const storeMap = new Map(stores.map((s) => [s._id.toString(), s]));
  const productMap = new Map(products.map((p) => [p._id.toString(), p]));
  response.json({ series: groups.flatMap((g) => {
    const store = storeMap.get(g._id.store.toString()); const product = productMap.get(g._id.product.toString());
    return store && product ? [{ storeId: store._id.toString(), storeCode: store.storeId,
      productId: product._id.toString(), sku: product.sku || product.productId, productName: product.name,
      observations: g.observations, firstActualDate: dateString(g.firstDate), latestActualDate: dateString(g.lastDate) }] : [];
  }) });
});

router.get("/latest", requirePermission("forecasts.read"), async (request, response) => {
  const run = await ForecastRun.findOne({ business: businessId(request) }).sort({ createdAt: -1 }).lean();
  response.json({ run: await publicRun(run) });
});

router.post("/run", requirePermission("forecasts.run"), async (request, response) => {
  const parsed = input.safeParse(request.body);
  if (!parsed.success || !mongoose.isValidObjectId(request.body?.storeId) || !mongoose.isValidObjectId(request.body?.productId))
    throw forecastError("Choose a valid store, product and 7, 14 or 28-day horizon.", 400);
  const { storeId, productId, horizon } = parsed.data;
  const business = businessId(request);
  const [store, product] = await Promise.all([
    Store.findOne({ _id: storeId, business, status: "active" }).lean(),
    Product.findOne({ _id: productId, business, status: "active" }).lean(),
  ]);
  if (!store || !product) throw forecastError("This store or product was not found in your business.", 404);
  const sales = (await Sale.find({ business, store: store._id, product: product._id })
    .sort({ date: -1 }).limit(365).select("date quantity").lean()).reverse();
  const nodeForecast = createBusinessForecast(sales, horizon, {
    storeCode: store.storeId,
    productCode: product.sku || product.productId,
  });
  const pythonResult = await comparePythonModels(sales, horizon);
  const calculated = selectBestForecast(nodeForecast, pythonResult, sales);
  const runId = crypto.randomUUID();
  const generatedAt = new Date();
  await Forecast.bulkWrite(calculated.predictions.map((point) => ({ updateOne: {
    filter: { business, store: store._id, product: product._id,
      forecastDate: new Date(`${point.date}T00:00:00.000Z`), modelVersion: calculated.modelVersion },
    update: { $set: { predictedQuantity: point.forecast_sales, modelName: calculated.model,
      horizonDays: horizon, generatedAt, runId }, $setOnInsert: { business, store: store._id, product: product._id,
      forecastDate: new Date(`${point.date}T00:00:00.000Z`), modelVersion: calculated.modelVersion } },
    upsert: true,
  } })));
  const run = await ForecastRun.create({ business, runId, store: store._id, product: product._id,
    modelName: calculated.model, modelVersion: calculated.modelVersion,
    modelSelection: calculated.modelSelection, comparisonServiceVersion: calculated.comparisonServiceVersion,
    modelComparison: calculated.comparisons.map((item) => ({ modelName: item.model,
      modelVersion: item.modelVersion, mae: item.mae, rmse: item.rmse,
      selected: item.selected, durationMs: item.durationMs })), horizonDays: horizon,
    latestActualDate: new Date(`${calculated.latestActualDate}T00:00:00.000Z`),
    forecastStartDate: new Date(`${calculated.forecastStartDate}T00:00:00.000Z`),
    forecastTotal: calculated.forecastTotal,
    backtest: { ...calculated.backtest, cutoff: new Date(`${calculated.backtest.cutoff}T00:00:00.000Z`) },
    history: calculated.history.map((point) => ({ date: new Date(`${point.date}T00:00:00.000Z`), quantity: point.quantity })),
  });
  await writeAudit(request, { action: "forecast.completed", targetType: "forecast", targetId: run.runId,
    targetLabel: `${product.name} at ${store.storeId}`, metadata: { model: run.modelName, horizonDays: run.horizonDays,
      mae: run.backtest.mae, rmse: run.backtest.rmse } });
  response.status(201).json({ run: await publicRun(run) });
});

export default router;
