import { ForecastRun } from "../models/ForecastRun.js";
import { Inventory } from "../models/Inventory.js";
import { Product } from "../models/Product.js";
import { Recommendation } from "../models/Recommendation.js";
import { Sale } from "../models/Sale.js";
import { Store } from "../models/Store.js";

const isoDay = (value) => value ? new Date(value).toISOString().slice(0, 10) : null;
const roundMoney = (value) => Math.round(value * 100) / 100;

export async function getBusinessAnalytics(business, days) {
  const latest = await Sale.findOne({ business }).sort({ date: -1 }).select("date").lean();
  const end = latest?.date || null;
  const start = end ? new Date(end.getTime() - (days - 1) * 86400000) : null;
  const match = end ? { business, date: { $gte: start, $lte: end } } : null;
  const [dailyRows, productRows, products, inventory, stores, latestRun, recommendations] = await Promise.all([
    match ? Sale.aggregate([{ $match: match }, { $group: { _id: "$date", revenue: { $sum: "$revenue" }, units: { $sum: "$quantity" }, records: { $sum: 1 } } }, { $sort: { _id: 1 } }]) : [],
    match ? Sale.aggregate([{ $match: match }, { $group: { _id: "$product", revenue: { $sum: "$revenue" }, units: { $sum: "$quantity" } } }, { $sort: { revenue: -1 } }]) : [],
    Product.find({ business }).select("name sku productId category status").lean(),
    Inventory.find({ business }).select("product store quantityOnHand reorderPoint").lean(),
    Store.find({ business }).select("storeId name").lean(),
    ForecastRun.findOne({ business }).sort({ createdAt: -1 }).select("runId product store modelName horizonDays forecastTotal revenueEstimate inventoryPlan latestActualDate forecastStartDate createdAt").lean(),
    Recommendation.find({ business }).sort({ createdAt: -1 }).limit(50).lean(),
  ]);
  const byProduct = new Map(products.map((p) => [p._id.toString(), p]));
  const byStore = new Map(stores.map((s) => [s._id.toString(), s]));
  const daily = dailyRows.map((row) => ({ date: isoDay(row._id), revenue: roundMoney(row.revenue), units: row.units, records: row.records }));
  const productSales = productRows.map((row) => {
    const product = byProduct.get(row._id.toString());
    return { productId: row._id.toString(), name: product?.name || "Archived product", sku: product?.sku || product?.productId || "", category: product?.category || "Uncategorized", revenue: roundMoney(row.revenue), units: row.units };
  });
  const categories = [...productSales.reduce((map, row) => {
    const value = map.get(row.category) || { name: row.category, revenue: 0, units: 0 };
    value.revenue += row.revenue; value.units += row.units;
    map.set(row.category, value);
    return map;
  }, new Map()).values()].map((row) => ({ ...row, revenue: roundMoney(row.revenue) })).sort((a, b) => b.revenue - a.revenue);
  const inventoryItems = inventory.map((row) => {
    const product = byProduct.get(row.product.toString());
    const store = byStore.get(row.store.toString());
    if (!product || product.status === "discontinued" || !store) return null;
    return { productId: row.product.toString(), name: product.name, sku: product.sku || product.productId,
      category: product.category || "Uncategorized", store: store.storeId,
      stock: row.quantityOnHand, reorderPoint: row.reorderPoint,
      lowStock: row.reorderPoint > 0 && row.quantityOnHand < row.reorderPoint };
  }).filter(Boolean);
  const revenue = roundMoney(daily.reduce((sum, row) => sum + row.revenue, 0));
  const units = daily.reduce((sum, row) => sum + row.units, 0);
  const forecastProduct = latestRun && byProduct.get(latestRun.product.toString());
  const forecastStore = latestRun && byStore.get(latestRun.store.toString());
  return {
    period: { days, startDate: isoDay(start), endDate: isoDay(end), referenceDate: isoDay(end), recordedDays: daily.length },
    totals: { revenue, units, saleRecords: daily.reduce((sum, row) => sum + row.records, 0),
      averageRecordedDayRevenue: daily.length ? roundMoney(revenue / daily.length) : 0,
      lowStockLocations: inventoryItems.filter((row) => row.lowStock).length },
    daily, categories, productSales, inventory: inventoryItems,
    recommendations: recommendations.map((item) => ({ id: item._id.toString(),
      runId: item.forecastRunId || item.runId, type: item.type, risk: item.risk, status: item.status,
      productId: item.product.toString(), productName: byProduct.get(item.product.toString())?.name || "Archived product",
      store: byStore.get(item.store.toString())?.storeId || "Archived store",
      suggestedQuantity: item.suggestedQuantity, currentStock: item.currentStock,
      reorderPoint: item.reorderPoint, targetStock: item.targetStock, safetyStock: item.safetyStock,
      daysOfCover: item.daysOfCover, demandChangePercent: item.demandChangePercent,
      estimatedRevenue: item.estimatedRevenue, reason: item.reason, createdAt: item.createdAt })),
    latestForecast: latestRun && forecastProduct && forecastStore ? {
      runId: latestRun.runId, productName: forecastProduct.name, store: forecastStore.storeId,
      model: latestRun.modelName, horizonDays: latestRun.horizonDays, forecastTotal: latestRun.forecastTotal,
      forecastRevenue: latestRun.revenueEstimate?.forecastRevenue || 0,
      revenueEstimate: latestRun.revenueEstimate || { unitRevenue: 0, source: "unavailable", forecastRevenue: 0 },
      inventoryPlan: latestRun.inventoryPlan || null,
      latestActualDate: isoDay(latestRun.latestActualDate), forecastStartDate: isoDay(latestRun.forecastStartDate),
      generatedAt: latestRun.createdAt,
    } : null,
  };
}
