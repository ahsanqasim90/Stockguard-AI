import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createProfessionalReportPdf } from "../src/services/professionalReportPdf.js";

const output = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../output/pdf");
await mkdir(output, { recursive: true });
const start = new Date("2026-08-14T00:00:00.000Z");
const daily = Array.from({ length: 70 }, (_, index) => {
  const date = new Date(start); date.setUTCDate(start.getUTCDate() + index);
  const units = 82 + Math.round(index * 0.7 + Math.sin(index / 4) * 10);
  return { date: date.toISOString().slice(0, 10), units, records: 8, revenue: units * 18650 };
});
const inventory = [
  ["LAHORE-01", "Business Laptop 15", "SG-LAPTOP-15", "Electronics", 21, 55, true],
  ["KARACHI-01", "Classic Denim Jeans", "SG-JEANS-501", "Fashion", 145, 70, false],
  ["S0085", "Noise Cancelling Headphones", "P0131", "Electronics", 34, 90, true],
  ["ISLAMABAD-01", "Performance Running Shoes", "SG-SHOES-001", "Sports", 68, 80, true],
  ["LAHORE-01", "Premium Basmati Rice 10kg", "SG-RICE-10KG", "Food", 420, 180, false],
  ["ISLAMABAD-01", "Premium Coffee Beans 1kg", "SG-COFFEE-1KG", "Food", 52, 85, true],
  ["LAHORE-01", "Professional Football Size 5", "SG-FOOTBALL-5", "Sports", 132, 60, false],
  ["KARACHI-01", "Smart Fitness Watch", "SG-WATCH-04", "Electronics", 39, 75, true],
].map(([store, name, sku, category, stock, reorderPoint, lowStock], index) => ({ productId: String(index + 1), store, name, sku, category, stock, reorderPoint, lowStock }));
const recommendations = [
  { id: "r1", runId: "demo-run", type: "critical_stock", risk: "high", status: "open", productId: "1", productName: "Business Laptop 15", store: "LAHORE-01", suggestedQuantity: 380, reason: "Only 2 forecast days of cover remain. Order 380 units to reach the calculated target stock." },
  { id: "r2", runId: "demo-run-2", type: "low_stock", risk: "medium", status: "open", productId: "3", productName: "Noise Cancelling Headphones", store: "S0085", suggestedQuantity: 750, reason: "Demand during supplier lead time exceeds current stock and safety stock requirements." },
];
const overview = {
  period: { days: 90, startDate: daily[0].date, endDate: daily.at(-1).date, referenceDate: daily.at(-1).date, recordedDays: daily.length },
  totals: { revenue: daily.reduce((sum, row) => sum + row.revenue, 0), units: daily.reduce((sum, row) => sum + row.units, 0), saleRecords: daily.length * 8, averageRecordedDayRevenue: daily.reduce((sum, row) => sum + row.revenue, 0) / daily.length, lowStockLocations: 5 },
  daily,
  categories: [
    { name: "Electronics", revenue: 84500000, units: 1850 },
    { name: "Food", revenue: 36800000, units: 3200 },
    { name: "Sports", revenue: 24600000, units: 1410 },
    { name: "Fashion", revenue: 17800000, units: 2080 },
  ],
  inventory,
  recommendations,
  latestForecast: { runId: "demo-run", productName: "Business Laptop 15", store: "LAHORE-01", model: "random_forest", horizonDays: 30, forecastTotal: 339.1, forecastRevenue: 42391710.87 },
};
const predictions = Array.from({ length: 30 }, (_, index) => {
  const date = new Date("2026-10-22T00:00:00.000Z"); date.setUTCDate(date.getUTCDate() + index);
  const predictedQuantity = 9.1 + index * 0.15 + Math.sin(index / 3) * 1.2;
  return { forecastDate: date, predictedQuantity, predictedRevenue: predictedQuantity * 124999 };
});
const run = { runId: "demo-run", modelName: "random_forest", horizonDays: 30,
  forecastTotal: predictions.reduce((sum, point) => sum + point.predictedQuantity, 0), forecastStartDate: predictions[0].forecastDate,
  revenueEstimate: { forecastRevenue: predictions.reduce((sum, point) => sum + point.predictedRevenue, 0) },
  inventoryPlan: { availableStock: 21, leadTimeDemand: 205.4, safetyStock: 61.7, targetStock: 401, recommendedOrderQuantity: 380 },
  backtest: { observations: 30, mae: 1.729, rmse: 2.469 },
};

for (const type of ["sales", "inventory", "forecast"]) {
  const pdf = await createProfessionalReportPdf({ type, overview, run, predictions,
    businessName: "StockGuard AI Demo Store", generatedAt: new Date("2026-10-22T15:30:00.000Z") });
  if (pdf.subarray(0, 4).toString() !== "%PDF") throw new Error(`${type} report is not a PDF.`);
  const target = path.join(output, `stockguard-${type}-sample.pdf`);
  await writeFile(target, pdf);
  console.log(`${type}: ${target} (${pdf.length} bytes)`);
}
