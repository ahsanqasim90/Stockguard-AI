const remoteBaseUrl = process.env.STOCKGUARD_ANALYTICS_BASE_URL?.replace(/\/+$/, "") || "";
process.env.NODE_ENV = remoteBaseUrl ? "production" : "test";
const [{ default: app }, database, models] = await Promise.all([
  import("../src/app.js"), import("../src/config/database.js"), import("../src/models/index.js"),
]);

const stamp = Date.now();
const businesses = [];
let server;
const password = "Temporary-Test-Password-2026";
const json = (value) => ({ "content-type": "application/json" });
async function expect(response, status) {
  const body = await response.json().catch(() => ({}));
  if (response.status !== status) throw new Error(`Expected ${status}, got ${response.status}: ${body.message || ""}`);
  return body;
}
async function register(base, suffix) {
  const result = await expect(await fetch(`${base}/auth/register`, { method: "POST", headers: json(),
    body: JSON.stringify({ name: "Temporary Analytics Test", businessName: `Temporary Analytics ${suffix}`,
      email: `codex-analytics-${suffix}-${stamp}@example.com`, password }) }), 201);
  businesses.push(result.user.business.id);
  return { business: result.user.business.id, headers: { authorization: `Bearer ${result.accessToken}` } };
}

try {
  await database.connectDatabase();
  if (!remoteBaseUrl) server = app.listen(0);
  const base = remoteBaseUrl ? `${remoteBaseUrl}/api` : `http://127.0.0.1:${server.address().port}/api`;
  const first = await register(base, "first");
  const second = await register(base, "second");
  await expect(await fetch(`${base}/analytics/overview`), 401);
  const empty = await expect(await fetch(`${base}/analytics/overview?days=30`, { headers: second.headers }), 200);
  if (empty.period.referenceDate !== null || empty.totals.revenue !== 0 || empty.daily.length) throw new Error("Empty business analytics are incorrect.");
  const product = await expect(await fetch(`${base}/products`, { method: "POST", headers: { ...first.headers, ...json() },
    body: JSON.stringify({ name: "Test Widget", sku: "AT-001", category: "Tools", stock: 2, reorder: 5, price: 10 }) }), 201);
  const stored = await models.Product.findById(product.product.id).lean();
  const store = await models.Store.findOne({ business: first.business, storeId: "DEFAULT" }).lean();
  await models.Sale.create([
    { business: first.business, store: store._id, product: stored._id, date: new Date("2026-01-01T00:00:00Z"), quantity: 2, revenue: 20 },
    { business: first.business, store: store._id, product: stored._id, date: new Date("2026-02-01T00:00:00Z"), quantity: 3, revenue: 30 },
  ]);
  const short = await expect(await fetch(`${base}/analytics/overview?days=30`, { headers: first.headers }), 200);
  if (short.period.startDate !== "2026-01-03" || short.totals.revenue !== 30 || short.totals.units !== 3 || short.totals.lowStockLocations !== 1)
    throw new Error("30-day aggregation or inventory risk is incorrect.");
  const long = await expect(await fetch(`${base}/analytics/overview?days=90`, { headers: first.headers }), 200);
  if (long.totals.revenue !== 50 || long.period.recordedDays !== 2 || long.categories[0]?.revenue !== 50 || long.productSales[0]?.units !== 5)
    throw new Error("90-day sales or category aggregation is incorrect.");
  const sales = await expect(await fetch(`${base}/reports`, { method: "POST", headers: { ...first.headers, ...json() },
    body: JSON.stringify({ type: "sales", days: 90 }) }), 201);
  if (!sales.content.includes('"2026-01-01","20","2","1"') || !sales.content.includes('"2026-02-01","30","3","1"'))
    throw new Error("Sales CSV did not contain actual daily rows.");
  const inventory = await expect(await fetch(`${base}/reports`, { method: "POST", headers: { ...first.headers, ...json() },
    body: JSON.stringify({ type: "inventory", days: 30 }) }), 201);
  if (!inventory.content.includes('"Test Widget"') || !inventory.content.includes('"true"')) throw new Error("Inventory CSV is incorrect.");
  const saved = await expect(await fetch(`${base}/reports/${sales.report.id}`, { headers: first.headers }), 200);
  if (saved.content !== sales.content) throw new Error("Saved report snapshot changed.");
  const otherList = await expect(await fetch(`${base}/reports`, { headers: second.headers }), 200);
  if (otherList.reports.length) throw new Error("Other business can see reports.");
  await expect(await fetch(`${base}/reports/${sales.report.id}`, { headers: second.headers }), 404);
  const otherOverview = await expect(await fetch(`${base}/analytics/overview?days=90`, { headers: second.headers }), 200);
  if (otherOverview.totals.revenue || otherOverview.inventory.length) throw new Error("Other business can see analytics.");
  await expect(await fetch(`${base}/reports`, { method: "POST", headers: { ...first.headers, ...json() },
    body: JSON.stringify({ type: "forecast", days: 30 }) }), 422);
  const runId = `analytics-check-${stamp}`;
  await models.ForecastRun.create({ business: first.business, runId, store: store._id, product: stored._id,
    modelName: "seasonal_naive", modelVersion: "test", horizonDays: 7,
    latestActualDate: new Date("2026-02-01T00:00:00Z"), forecastStartDate: new Date("2026-02-02T00:00:00Z"),
    forecastTotal: 21, backtest: { observations: 7, cutoff: new Date("2026-01-25T00:00:00Z"), mae: 1, rmse: 1 }, history: [] });
  await models.Forecast.create(Array.from({ length: 7 }, (_, index) => ({ business: first.business, runId,
    store: store._id, product: stored._id, forecastDate: new Date(Date.UTC(2026, 1, index + 2)),
    predictedQuantity: 3, modelName: "seasonal_naive", modelVersion: "test", horizonDays: 7 })));
  const forecast = await expect(await fetch(`${base}/reports`, { method: "POST", headers: { ...first.headers, ...json() },
    body: JSON.stringify({ type: "forecast", days: 30 }) }), 201);
  const forecastData = JSON.parse(forecast.content);
  if (forecastData.predictions.length !== 7 || forecastData.businessForecast.forecastTotal !== 21 || forecastData.backtest.mae !== 1)
    throw new Error("Forecast report did not include the saved business model output.");
  console.log(`${remoteBaseUrl ? "Live" : "Local"} StockGuard analytics integration PASSED`);
  console.log("Date windows, totals, category revenue, low stock, saved CSV/forecast snapshots and tenant isolation verified.");
} finally {
  for (const business of businesses) {
    const filter = { business };
    await Promise.all([models.Report.deleteMany(filter), models.Forecast.deleteMany(filter), models.ForecastRun.deleteMany(filter),
      models.Sale.deleteMany(filter), models.Inventory.deleteMany(filter),
      models.Product.deleteMany(filter), models.Store.deleteMany(filter), models.User.deleteMany(filter)]);
    await models.Business.deleteOne({ _id: business });
  }
  if (server) await new Promise((resolve) => server.close(resolve));
  await database.disconnectDatabase();
}
