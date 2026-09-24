import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = (process.env.STOCKGUARD_DEMO_BASE_URL || "https://stockguard-ai-ten.vercel.app/api").replace(/\/+$/, "");
const email = process.env.STOCKGUARD_DEMO_EMAIL;
const password = process.env.STOCKGUARD_DEMO_PASSWORD;
if (!email || !password) throw new Error("Set STOCKGUARD_DEMO_EMAIL and STOCKGUARD_DEMO_PASSWORD.");

class HttpError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function request(route, { token, ...options } = {}) {
  const headers = { ...options.headers };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl}${route}`, { ...options, headers });
  const body = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new HttpError(body?.message || `${route} failed (${response.status}).`, response.status);
  return body;
}

async function account() {
  try {
    return await request("/auth/mobile/login", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }) });
  } catch (error) {
    if (error.status !== 401) throw error;
    return request("/auth/register", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Muhammad Ahsan Qasim", businessName: "StockGuard AI Demo Store", email, password }) });
  }
}

const products = [
  { sku: "P0131", name: "Noise Cancelling Headphones", category: "Electronics", supplier: "Sony Pakistan", price: 18999, stock: 34, reorder: 90, leadTimeDays: 12, base: 18, store: "S0085" },
  { sku: "SG-LAPTOP-15", name: "Business Laptop 15", category: "Electronics", supplier: "HP Pakistan", price: 124999, stock: 21, reorder: 55, leadTimeDays: 18, base: 9, store: "LAHORE-01" },
  { sku: "SG-RICE-10KG", name: "Premium Basmati Rice 10kg", category: "Food", supplier: "Punjab Agri Foods", price: 4200, stock: 420, reorder: 180, leadTimeDays: 6, base: 32, store: "LAHORE-01" },
  { sku: "SG-SHOES-001", name: "Performance Running Shoes", category: "Sports", supplier: "Active Sports", price: 18500, stock: 68, reorder: 80, leadTimeDays: 14, base: 15, store: "ISLAMABAD-01" },
  { sku: "SG-JEANS-501", name: "Classic Denim Jeans", category: "Fashion", supplier: "Urban Textile", price: 8500, stock: 145, reorder: 70, leadTimeDays: 10, base: 21, store: "KARACHI-01" },
  { sku: "SG-COFFEE-1KG", name: "Premium Coffee Beans 1kg", category: "Food", supplier: "Northern Roasters", price: 3600, stock: 52, reorder: 85, leadTimeDays: 8, base: 17, store: "ISLAMABAD-01" },
  { sku: "SG-WATCH-04", name: "Smart Fitness Watch", category: "Electronics", supplier: "Tech Distribution PK", price: 27999, stock: 39, reorder: 75, leadTimeDays: 16, base: 12, store: "KARACHI-01" },
  { sku: "SG-FOOTBALL-5", name: "Professional Football Size 5", category: "Sports", supplier: "Champion Sports", price: 5500, stock: 132, reorder: 60, leadTimeDays: 7, base: 19, store: "LAHORE-01" },
];

function csv() {
  const rows = ["date,product_name,sku,quantity_sold,revenue,category,store_id"];
  const end = new Date(); end.setUTCHours(0, 0, 0, 0); end.setUTCDate(end.getUTCDate() - 1);
  for (const [productIndex, product] of products.entries()) {
    for (let index = 99; index >= 0; index -= 1) {
      const date = new Date(end); date.setUTCDate(end.getUTCDate() - index);
      const elapsed = 99 - index;
      const weekday = date.getUTCDay();
      const weekend = weekday === 0 || weekday === 6 ? 1.18 : 1;
      const trend = 1 + elapsed * (0.0018 + productIndex * 0.00015);
      const campaign = elapsed >= 70 && elapsed <= 76 ? 1.35 : 1;
      const rhythm = 1 + Math.sin((elapsed + productIndex) * Math.PI / 7) * 0.12;
      const quantity = Math.max(0, Math.round(product.base * weekend * trend * campaign * rhythm));
      rows.push([date.toISOString().slice(0, 10), product.name, product.sku, quantity,
        quantity * product.price, product.category, product.store].join(","));
    }
  }
  return `${rows.join("\n")}\n`;
}

const session = await account();
const token = session.accessToken;
await request("/auth/me", { token, method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({
  name: "Muhammad Ahsan Qasim", phone: "+92 324 4378226", bio: "StockGuard AI FYP presentation workspace",
  businessName: "StockGuard AI Demo Store", timezone: "Asia/Karachi", currency: "PKR",
}) });
await request("/settings", { token, method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({
  safetyStockPercent: 20, defaultLeadTimeDays: 10, forecastHorizonDays: 30,
  notifications: { uploadCompleted: true, forecastReady: true, lowStock: true, criticalInventory: true,
    weeklySummary: true, demandSpike: true, newLogin: true, email: false, push: true },
}) });

const csvContent = csv();
if (process.env.STOCKGUARD_DEMO_CSV_PATH) {
  const target = path.resolve(process.env.STOCKGUARD_DEMO_CSV_PATH);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, csvContent, "utf8");
}
const imports = await request("/imports", { token });
for (const item of imports.imports.filter((entry) => entry.name === "stockguard-demo-sales.csv" && entry.canDelete)) {
  await request(`/imports/${item.id}`, { token, method: "DELETE" });
}
const form = new FormData();
form.append("file", new Blob([csvContent], { type: "text/csv" }), "stockguard-demo-sales.csv");
await request("/imports/sales", { token, method: "POST", body: form });

const productList = await request("/products", { token });
for (const spec of products) {
  const product = productList.products.find((item) => item.sku === spec.sku);
  if (!product) throw new Error(`Imported product ${spec.sku} was not found.`);
  await request(`/products/${product.id}`, { token, method: "PATCH", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: spec.name, category: spec.category, supplier: spec.supplier, price: spec.price,
      stock: spec.stock, reorder: spec.reorder, leadTimeDays: spec.leadTimeDays }) });
}

const series = await request("/forecasts/series", { token });
const forecastSkus = new Set(["P0131", "SG-LAPTOP-15", "SG-RICE-10KG", "SG-SHOES-001"]);
const selectedSeries = series.series.filter((item) => forecastSkus.has(item.sku));
for (const item of selectedSeries) {
  await request("/forecasts/run", { token, method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ storeId: item.storeId, productId: item.productId, horizon: 30 }) });
}
for (const type of ["sales", "inventory", "forecast"]) {
  await request("/reports", { token, method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ type, days: 90 }) });
}
const [overview, notifications, recommendations, reports] = await Promise.all([
  request("/analytics/overview?days=90", { token }), request("/notifications?limit=50", { token }),
  request("/recommendations", { token }), request("/reports", { token }),
]);
console.log(JSON.stringify({ status: "ready", business: session.user.business?.name || "StockGuard AI Demo Store",
  products: productList.products.length, salesRows: products.length * 100, forecastRuns: selectedSeries.length,
  revenue: overview.totals.revenue, notifications: notifications.notifications.length,
  recommendations: recommendations.recommendations.length, reports: reports.reports.length }, null, 2));
