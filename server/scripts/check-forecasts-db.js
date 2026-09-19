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

  await expect(await fetch(`${base}/imports/sales`, { method: "POST", headers, body: file(36) }), 201);
  series = await expect(await fetch(`${base}/forecasts/series`, { headers }), 200);
  if (series.series[0].observations !== 36) throw new Error("Full sales history was not available.");
  const seven = await expect(await run(7), 201);
  if (seven.run.predictions.length !== 7 || seven.run.backtest.mae !== 0 || seven.run.backtest.rmse !== 0)
    throw new Error("Seven-day seasonal forecast or holdout backtest is incorrect.");
  const twentyEight = await expect(await run(28), 201);
  if (twentyEight.run.predictions.length !== 28 || twentyEight.run.backtest.mae !== 0 || twentyEight.run.backtest.rmse !== 0)
    throw new Error("Twenty-eight-day seasonal forecast or holdout backtest is incorrect.");
  if (twentyEight.run.predictions[0].date !== "2026-02-06") throw new Error("Forecast did not start after the last actual day.");
  const latest = await expect(await fetch(`${base}/forecasts/latest`, { headers }), 200);
  if (latest.run.id !== twentyEight.run.id || latest.run.predictions.length !== 28) throw new Error("Saved forecast was not restored.");
  await expect(await fetch(`${base}/imports/sales`, { method: "POST", headers, body: file(36) }), 201);
  const invalidated = await expect(await fetch(`${base}/forecasts/latest`, { headers }), 200);
  if (invalidated.run !== null) throw new Error("CSV re-import did not invalidate stale forecasts.");
  await expect(await run(28), 201);

  const filter = { business: businesses[0], date: new Date("2026-01-30T00:00:00.000Z") };
  const removed = await models.Sale.findOneAndDelete(filter);
  if (!removed) throw new Error("Gap test could not find its temporary sale.");
  const gap = await expect(await run(28), 422);
  if (!gap.message.includes("missing dates")) throw new Error("Gap in daily history was not detected.");

  await expect(await fetch(`${base}/imports/sales`, { method: "POST", headers,
    body: file(60, { sku: "P0131", storeId: "S0085", name: "Mapped Production Series" }) }), 201);
  series = await expect(await fetch(`${base}/forecasts/series`, { headers }), 200);
  const mapped = series.series.find((item) => item.storeCode === "S0085" && item.sku === "P0131");
  if (!mapped || mapped.observations !== 60) throw new Error("Mapped XGBoost series was not imported.");
  const liveModel = await expect(await runFor(mapped, 7), 201);
  if (liveModel.run.model !== "global_xgboost" || liveModel.run.modelVersion !== "1.0.0"
    || liveModel.run.predictions.length !== 7 || !liveModel.run.modelSelection?.includes("production model")) {
    throw new Error("Mapped series did not run through the production XGBoost model.");
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

  console.log(`${remoteBaseUrl ? "Live" : "Local"} StockGuard forecasting integration PASSED`);
  console.log("CSV history, fallback forecasts, mapped XGBoost inference, gap detection, persistence and tenant isolation verified.");
} finally {
  for (const business of businesses) {
    const filter = { business };
    await Promise.all([models.Forecast.deleteMany(filter), models.ForecastRun.deleteMany(filter),
      models.Sale.deleteMany(filter), models.ImportBatch.deleteMany(filter),
      models.Inventory.deleteMany(filter), models.Product.deleteMany(filter),
      models.Store.deleteMany(filter), models.User.deleteMany(filter)]);
    await models.Business.deleteOne({ _id: business });
  }
  if (server) await new Promise((resolve) => server.close(resolve));
  await database.disconnectDatabase();
}
