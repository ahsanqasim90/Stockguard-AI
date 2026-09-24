import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { parseSalesCsv } from "../src/services/salesCsv.js";

const baseUrl = (process.env.STOCKGUARD_PERF_BASE_URL || "https://stockguard-ai-ten.vercel.app/api").replace(/\/+$/, "");
const email = process.env.STOCKGUARD_PERF_EMAIL;
const password = process.env.STOCKGUARD_PERF_PASSWORD;
const evidencePath = path.resolve(process.env.STOCKGUARD_PERF_EVIDENCE || "../docs/evidence/SRS-performance-evidence.json");
if (!email || !password) throw new Error("Set STOCKGUARD_PERF_EMAIL and STOCKGUARD_PERF_PASSWORD.");

function percentile(values, percent) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * percent) - 1)];
}
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
async function request(route, options = {}) {
  const started = performance.now();
  const response = await fetch(`${baseUrl}${route}`, { signal: AbortSignal.timeout(60_000), ...options });
  const durationMs = performance.now() - started;
  const body = await response.json().catch(() => ({}));
  return { response, body, durationMs };
}
function isoDate(offset) {
  const date = new Date(Date.UTC(2025, 0, 1));
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
function tenThousandRowCsv() {
  const rows = ["date,product_name,sku,quantity_sold,revenue,category,store_id"];
  for (let product = 0; product < 100; product += 1) {
    for (let day = 0; day < 100; day += 1) {
      rows.push(`${isoDate(day)},Performance Product ${product},PERF-${String(product).padStart(3, "0")},${(product + day) % 40},${500 + product * 3 + day},Test,PERF-STORE`);
    }
  }
  return rows.join("\n");
}

await request("/health");
const loginOptions = { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ email, password }) };
const coldLogin = await request("/auth/mobile/login", loginOptions);
if (!coldLogin.response.ok || !coldLogin.body.accessToken) throw new Error(`Performance warm-up login failed (${coldLogin.response.status}).`);
const login = await request("/auth/mobile/login", loginOptions);
if (!login.response.ok || !login.body.accessToken) throw new Error(`Performance login failed (${login.response.status}).`);
const token = login.body.accessToken;
const headers = { authorization: `Bearer ${token}` };
await request("/auth/me", { headers });

const csv = tenThousandRowCsv();
const csvStarted = performance.now();
const parsed = parseSalesCsv(csv);
const csvValidationMs = performance.now() - csvStarted;
if (parsed.length !== 10_000) throw new Error("The 10,000-row CSV fixture did not parse completely.");

const dashboardRequests = () => Promise.all([
  request("/analytics/overview?days=90", { headers }), request("/products", { headers }),
  request("/forecasts/latest", { headers }), request("/recommendations", { headers }),
  request("/notifications?limit=20", { headers }),
]);
const coldDashboardStarted = performance.now();
const coldDashboardResponses = await dashboardRequests();
const coldDashboardLoadMs = performance.now() - coldDashboardStarted;
if (coldDashboardResponses.some((item) => !item.response.ok)) throw new Error("A dashboard endpoint failed during warm-up.");
const dashboardStarted = performance.now();
const dashboardResponses = await dashboardRequests();
const dashboardLoadMs = performance.now() - dashboardStarted;
if (dashboardResponses.some((item) => !item.response.ok)) throw new Error("A dashboard endpoint failed during the performance check.");

// Model 100 signed-in virtual users arriving over ten seconds. A ramp avoids an
// artificial same-millisecond connection storm while still overlapping requests
// and exercising serverless concurrency, authentication and MongoDB access.
const concurrent = await Promise.all(Array.from({ length: 100 }, async (_value, index) => {
  await delay(Math.floor(index / 10) * 1_000);
  return request("/auth/me", { headers });
}));
const concurrentDurations = concurrent.map((item) => item.durationMs);
const concurrentErrors = concurrent.filter((item) => !item.response.ok).length;
const concurrentStatuses = concurrent.reduce((counts, item) => {
  const status = String(item.response.status);
  counts[status] = (counts[status] || 0) + 1;
  return counts;
}, {});

const seriesResponse = await request("/forecasts/series", { headers });
if (!seriesResponse.response.ok || !seriesResponse.body.series?.length) throw new Error("No forecastable series is available for the performance test.");
const series = [...seriesResponse.body.series].sort((a, b) => b.observations - a.observations)[0];
const forecast = await request("/forecasts/run", { method: "POST", headers: { ...headers, "content-type": "application/json" },
  body: JSON.stringify({ storeId: series.storeId, productId: series.productId, horizon: 30 }) });
if (!forecast.response.ok || forecast.body.run?.predictions?.length !== 30) {
  throw new Error(`The timed 30-day forecast failed (${forecast.response.status}): ${forecast.body.message || "invalid response"}`);
}

const thresholds = {
  loginWithin3Seconds: login.durationMs <= 3_000,
  csvValidationWithin5Seconds: csvValidationMs <= 5_000,
  dashboardWithin5Seconds: dashboardLoadMs <= 5_000,
  forecastWithin10Seconds: forecast.durationMs <= 10_000,
  forecastWithin30Seconds: forecast.durationMs <= 30_000,
  oneHundredUserLoadP95Within3Seconds: percentile(concurrentDurations, 0.95) <= 3_000,
  zeroConcurrentErrors: concurrentErrors === 0,
};
const evidence = {
  result: Object.values(thresholds).every(Boolean) ? "passed" : "failed",
  testedAt: new Date().toISOString(),
  target: baseUrl,
  fixture: { csvRows: parsed.length, csvBytes: Buffer.byteLength(csv) },
  timingsMs: {
    coldStartLogin: Math.round(coldLogin.durationMs),
    login: Math.round(login.durationMs),
    csvValidation: Math.round(csvValidationMs),
    coldStartDashboard: Math.round(coldDashboardLoadMs),
    dashboard: Math.round(dashboardLoadMs),
    forecast30Day: Math.round(forecast.durationMs),
    virtualUsers100: {
      rampUpSeconds: 10,
      min: Math.round(Math.min(...concurrentDurations)),
      average: Math.round(concurrentDurations.reduce((sum, value) => sum + value, 0) / concurrentDurations.length),
      p95: Math.round(percentile(concurrentDurations, 0.95)),
      max: Math.round(Math.max(...concurrentDurations)),
      errors: concurrentErrors,
      statuses: concurrentStatuses,
    },
  },
  forecast: { series: `${series.storeCode}/${series.sku}`, observations: series.observations,
    selectedModel: forecast.body.run.model, predictions: forecast.body.run.predictions.length },
  thresholds,
};
await fs.mkdir(path.dirname(evidencePath), { recursive: true });
await fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log("StockGuard SRS performance check completed");
console.log(JSON.stringify({ evidencePath, ...evidence }, null, 2));
if (evidence.result !== "passed") process.exitCode = 1;
