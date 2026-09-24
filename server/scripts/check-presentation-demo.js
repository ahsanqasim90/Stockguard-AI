const baseUrl = (process.env.STOCKGUARD_DEMO_BASE_URL || "https://stockguard-ai-ten.vercel.app/api").replace(/\/+$/, "");
const email = process.env.STOCKGUARD_DEMO_EMAIL;
const password = process.env.STOCKGUARD_DEMO_PASSWORD;
if (!email || !password) throw new Error("Set STOCKGUARD_DEMO_EMAIL and STOCKGUARD_DEMO_PASSWORD.");

async function read(route, token) {
  const response = await fetch(`${baseUrl}${route}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${route} returned ${response.status}: ${body.message || "request failed"}`);
  return body;
}

const login = await fetch(`${baseUrl}/auth/mobile/login`, { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ email, password }) });
const session = await login.json().catch(() => ({}));
if (!login.ok || !session.accessToken) throw new Error(`Demo login failed (${login.status}).`);
const token = session.accessToken;
const [health, profile, products, imports, forecast, analytics, reports, settings, users, audit, activity, notifications, recommendations] = await Promise.all([
  read("/health"), read("/auth/me", token), read("/products", token), read("/imports", token),
  read("/forecasts/latest", token), read("/analytics/overview?days=90", token), read("/reports", token),
  read("/settings", token), read("/admin/users", token), read("/admin/audit?limit=20", token),
  read("/admin/activity", token), read("/notifications?limit=50", token), read("/recommendations", token),
]);
if (health.status !== "ok" || health.mongodb?.state !== "connected" || health.pythonMl?.state !== "connected")
  throw new Error("Production service health is incomplete.");
if (profile.user.business?.name !== "StockGuard AI Demo Store") throw new Error("Demo profile is not connected to its workspace.");
if (products.products.length < 8 || imports.imports.length < 1 || !forecast.run || forecast.run.predictions.length !== 30)
  throw new Error("Demo products, import or complete 30-day forecast is missing.");
if (analytics.totals.revenue <= 0 || analytics.daily.length < 30 || reports.reports.length < 3)
  throw new Error("Demo analytics or reports are incomplete.");
if (users.users.length < 1 || audit.audit.length < 1 || activity.activity.data.sales < 800)
  throw new Error("Demo administration or audit data is incomplete.");
if (notifications.notifications.length < 1 || recommendations.recommendations.length < 1)
  throw new Error("Demo notifications or replenishment recommendations are missing.");
const savedReport = await read(`/reports/${reports.reports[0].id}`, token);
if (!savedReport.content || !savedReport.report?.filename) throw new Error("Saved report download failed.");
console.log("StockGuard production presentation smoke test PASSED");
console.log(JSON.stringify({ products: products.products.length, sales: activity.activity.data.sales,
  forecastDays: forecast.run.predictions.length, reports: reports.reports.length,
  notifications: notifications.notifications.length, recommendations: recommendations.recommendations.length,
  users: users.users.length, auditEventsChecked: audit.audit.length,
  defaultHorizon: settings.settings.business.forecastHorizonDays }, null, 2));
