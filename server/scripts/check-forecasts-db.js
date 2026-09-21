const remoteBaseUrl = process.env.STOCKGUARD_FORECAST_BASE_URL?.replace(/\/+$/, "") || "";
process.env.NODE_ENV = remoteBaseUrl ? "production" : "test";
const [{ default: app }, database, models] = await Promise.all([
  import("../src/app.js"), import("../src/config/database.js"), import("../src/models/index.js"),
]);

const stamp = Date.now();
const password = "Temporary-Test-Password-2026";
const businesses = [];
let server;
async function expect(response, status) {
  const body = await response.json().catch(() => ({}));
  if (response.status !== status) throw new Error(`Expected ${status}, received ${response.status}: ${body.message || ""}`);
  return body;
}
function csv(count, { sku = "FC-001", storeId = "DEFAULT", name = "Forecast Test Widget" } = {}) {
  const start = Date.UTC(2026, 0, 1);
  const rows = Array.from({ length: count }, (_, i) => {
    const date = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
    return `${date},${name},${sku},${i % 7 + 1},${(i % 7 + 1) * 10},Food,${storeId}`;
  });
  return `date,product_name,sku,quantity_sold,revenue,category,store_id\n${rows.join("\n")}\n`;
}
function file(count, options) {
  const form = new FormData();
  form.append("file", new Blob([csv(count, options)], { type: "text/csv" }), "forecast-sales.csv");
  return form;
}

try {
  await database.connectDatabase();
  if (!remoteBaseUrl) server = app.listen(0);
  const base = remoteBaseUrl ? `${remoteBaseUrl}/api` : `http://127.0.0.1:${server.address().port}/api`;
  const account = await expect(await fetch(`${base}/auth/register`, { method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Temporary Forecast Test", businessName: "Temporary Forecast Workspace",
      email: `codex-forecast-${stamp}@example.com`, password }),
  }), 201);
  businesses.push(account.user.business.id);
  const headers = { authorization: `Bearer ${account.accessToken}` };
  const empty = await expect(await fetch(`${base}/forecasts/latest`, { headers }), 200);
  if (empty.run !== null) throw new Error("A fresh business received another business's forecast.");
  await expect(await fetch(`${base}/forecasts/series`), 401);

  await expect(await fetch(`${base}/imports/sales`, { method: "POST", headers, body: file(14) }), 201);
  let series = await expect(await fetch(`${base}/forecasts/series`, { headers }), 200);
  if (series.series.length !== 1 || series.series[0].observations !== 14) throw new Error("Sales series list is incorrect.");
  const selected = series.series[0];
  const runFor = (target, horizon, auth = headers) => fetch(`${base}/forecasts/run`, { method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ storeId: target.storeId, productId: target.productId, horizon }),
  });
  const run = (horizon, auth = headers) => runFor(selected, horizon, auth);
  const short = await expect(await run(28), 422);
  if (!short.message.includes("consecutive")) throw new Error("Short history did not explain the requirement.");

  await expect(await fetch(`${base}/imports/sales`, { method: "POST", headers, body: file(50) }), 201);
  series = await expect(await fetch(`${base}/forecasts/series`, { headers }), 200);
  if (series.series[0].observations !== 50) throw new Error("Full sales history was not available.");
  const seven = await expect(await run(7), 201);
  if (seven.run.predictions.length !== 7 || seven.run.comparisons.length !== 4
    || !seven.run.comparisons.some((item) => item.model === "linear_regression")
    || !seven.run.comparisons.some((item) => item.model === "arima")
    || !seven.run.comparisons.some((item) => item.model === "random_forest"))
    throw new Error("Seven-day live model comparison is incorrect.");
  const twentyEight = await expect(await run(28), 201);
  if (twentyEight.run.predictions.length !== 28 || twentyEight.run.backtest.mae !== 0 || twentyEight.run.backtest.rmse !== 0)
    throw new Error("Twenty-eight-day automatic selection or holdout backtest is incorrect.");
  if (twentyEight.run.predictions[0].date !== "2026-02-20") throw new Error("Forecast did not start after the last actual day.");
  const thirty = await expect(await run(30), 201);
  if (thirty.run.predictions.length !== 30 || thirty.run.backtest.observations !== 30
    || thirty.run.comparisons.length !== 4
    || !thirty.run.comparisons.every((item) => Number.isFinite(item.mae) && Number.isFinite(item.rmse))
    || thirty.run.comparisons.filter((item) => item.selected).length !== 1)
    throw new Error("Thirty-day model comparison, MAE/RMSE, or automatic selection is incorrect.");
  if (thirty.run.predictions[0].date !== "2026-02-20" || thirty.run.predictions.at(-1).date !== "2026-03-21")
    throw new Error("Thirty-day forecast dates are incomplete or incorrect.");
  if (thirty.run.revenueEstimate.source !== "historical_average" || thirty.run.revenueEstimate.unitRevenue !== 10
    || Math.abs(thirty.run.forecastRevenue - thirty.run.forecastTotal * 10) > 0.01
    || thirty.run.predictions.some((point) => Math.abs(point.forecast_revenue - point.forecast_sales * 10) > 0.01))
    throw new Error("Thirty-day forecast revenue estimate is incorrect.");
  if (!thirty.run.inventoryPlan || thirty.run.inventoryPlan.leadTimeDays !== 7
    || thirty.run.inventoryPlan.recommendedOrderQuantity <= 0 || thirty.run.inventoryPlan.action !== "reorder"
    || thirty.run.recommendation?.type !== "reorder")
    throw new Error("Stock replenishment recommendation is incomplete.");
  const latest = await expect(await fetch(`${base}/forecasts/latest`, { headers }), 200);
  if (latest.run.id !== thirty.run.id || latest.run.horizon !== 30 || latest.run.predictions.length !== 30)
    throw new Error("Saved thirty-day forecast was not restored completely.");
  if (latest.run.revenueEstimate.forecastRevenue !== thirty.run.revenueEstimate.forecastRevenue
    || latest.run.inventoryPlan.recommendedOrderQuantity !== thirty.run.inventoryPlan.recommendedOrderQuantity)
    throw new Error("Saved revenue estimate or inventory plan was not restored.");
  const recommendations = await expect(await fetch(`${base}/recommendations`, { headers }), 200);
  if (!recommendations.recommendations.some((item) => item.runId === thirty.run.id && item.type === "reorder"))
    throw new Error("Saved replenishment recommendation was not listed.");
  await expect(await fetch(`${base}/imports/sales`, { method: "POST", headers, body: file(50) }), 201);
  const invalidated = await expect(await fetch(`${base}/forecasts/latest`, { headers }), 200);
  if (invalidated.run !== null) throw new Error("CSV re-import did not invalidate stale forecasts.");
  await expect(await run(30), 201);

  const filter = { business: businesses[0], date: new Date("2026-01-30T00:00:00.000Z") };
  const removed = await models.Sale.findOneAndDelete(filter);
  if (!removed) throw new Error("Gap test could not find its temporary sale.");
  const gap = await expect(await run(30), 422);
  if (!gap.message.includes("missing dates")) throw new Error("Gap in daily history was not detected.");

  await expect(await fetch(`${base}/imports/sales`, { method: "POST", headers,
    body: file(60, { sku: "P0131", storeId: "S0085", name: "Mapped Production Series" }) }), 201);
  series = await expect(await fetch(`${base}/forecasts/series`, { headers }), 200);
  const mapped = series.series.find((item) => item.storeCode === "S0085" && item.sku === "P0131");
  if (!mapped || mapped.observations !== 60) throw new Error("Mapped XGBoost series was not imported.");
  const liveModel = await expect(await runFor(mapped, 7), 201);
  if (liveModel.run.predictions.length !== 7 || liveModel.run.comparisons.length !== 4
    || !liveModel.run.comparisons.some((item) => item.model === "global_xgboost")
    || liveModel.run.comparisons.filter((item) => item.selected).length !== 1
    || !liveModel.run.modelSelection?.includes("lowest holdout MAE")) {
    throw new Error("Mapped series did not compare production XGBoost with the Python models.");
  }
  const mappedThirty = await expect(await runFor(mapped, 30), 201);
  if (mappedThirty.run.predictions.length !== 30 || mappedThirty.run.backtest.observations !== 30
    || !mappedThirty.run.comparisons.some((item) => item.model === "global_xgboost")
    || mappedThirty.run.comparisons.filter((item) => item.selected).length !== 1) {
    throw new Error("Mapped series did not complete the thirty-day XGBoost comparison.");
  }

  const other = await expect(await fetch(`${base}/auth/register`, { method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Other Temporary Forecast Test", businessName: "Other Forecast Workspace",
      email: `codex-forecast-other-${stamp}@example.com`, password }),
  }), 201);
  businesses.push(other.user.business.id);
  const otherHeaders = { authorization: `Bearer ${other.accessToken}` };
  const isolated = await expect(await fetch(`${base}/forecasts/series`, { headers: otherHeaders }), 200);
  if (isolated.series.length) throw new Error("A different business could see this series.");
  await expect(await run(7, otherHeaders), 404);
  const otherLatest = await expect(await fetch(`${base}/forecasts/latest`, { headers: otherHeaders }), 200);
  if (otherLatest.run !== null) throw new Error("A different business could see this forecast.");
  const otherRecommendations = await expect(await fetch(`${base}/recommendations`, { headers: otherHeaders }), 200);
  if (otherRecommendations.recommendations.length) throw new Error("A different business could see replenishment recommendations.");

  console.log(`${remoteBaseUrl ? "Live" : "Local"} StockGuard forecasting integration PASSED`);
  console.log("CSV history, signed Python comparison, revenue estimation, replenishment, persistence and tenant isolation verified.");
} finally {
  for (const business of businesses) {
    const filter = { business };
    await Promise.all([models.Forecast.deleteMany(filter), models.ForecastRun.deleteMany(filter), models.Recommendation.deleteMany(filter),
      models.Sale.deleteMany(filter), models.ImportBatch.deleteMany(filter),
      models.Inventory.deleteMany(filter), models.Product.deleteMany(filter),
      models.Store.deleteMany(filter), models.User.deleteMany(filter)]);
    await models.Business.deleteOne({ _id: business });
  }
  if (server) await new Promise((resolve) => server.close(resolve));
  await database.disconnectDatabase();
}
