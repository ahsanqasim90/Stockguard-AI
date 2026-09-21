const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
};

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function standardDeviation(values) {
  if (values.length < 2) return 0;
  const mean = average(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}

export function buildDecisionSupport({ predictions, sales, product, inventory, businessSettings = {} }) {
  const forecastUnits = round(predictions.reduce((sum, point) => sum + point.forecast_sales, 0), 4);
  const soldUnits = sales.reduce((sum, sale) => sum + Number(sale.quantity || 0), 0);
  const recordedRevenue = sales.reduce((sum, sale) => sum + Number(sale.revenue || 0), 0);
  const historicalUnitRevenue = soldUnits > 0 && recordedRevenue > 0 ? recordedRevenue / soldUnits : 0;
  const productUnitPrice = Number(product?.price || 0);
  const unitRevenue = round(historicalUnitRevenue || productUnitPrice, 4);
  const revenueSource = historicalUnitRevenue > 0 ? "historical_average" : productUnitPrice > 0 ? "product_price" : "unavailable";
  const dailyPredictions = predictions.map((point) => ({ ...point, forecast_revenue: round(point.forecast_sales * unitRevenue) }));
  const forecastRevenue = round(dailyPredictions.reduce((sum, point) => sum + point.forecast_revenue, 0));

  const historicalDemand = sales.map((sale) => Math.max(0, Number(sale.quantity || 0)));
  const historicalAverageDailyDemand = average(historicalDemand);
  const demandStdDev = standardDeviation(historicalDemand);
  const horizonDays = Math.max(predictions.length, 1);
  const averageDailyDemand = forecastUnits / horizonDays;
  const leadTimeDays = Math.max(1, Number(product?.supplierLeadTimeDays || businessSettings.defaultLeadTimeDays || 7));
  const safetyStockPercent = Math.max(0, Number(businessSettings.safetyStockPercent ?? 15));
  const serviceLevelFactor = 1.65;
  const currentStock = Math.max(0, Number(inventory?.quantityOnHand || 0));
  const reservedStock = Math.max(0, Number(inventory?.quantityReserved || 0));
  const availableStock = Math.max(0, currentStock - reservedStock);
  const leadTimeDemand = averageDailyDemand * leadTimeDays;
  const variabilitySafetyStock = serviceLevelFactor * demandStdDev * Math.sqrt(leadTimeDays);
  const policySafetyStock = leadTimeDemand * safetyStockPercent / 100;
  const safetyStock = Math.max(variabilitySafetyStock, policySafetyStock);
  const reorderPoint = Math.ceil(leadTimeDemand + safetyStock);
  const targetStock = Math.ceil(forecastUnits + safetyStock);
  const recommendedOrderQuantity = Math.max(0, targetStock - availableStock);
  const overstockThreshold = Math.ceil(targetStock * 1.25);
  const action = recommendedOrderQuantity > 0 ? "reorder" : targetStock > 0 && availableStock > overstockThreshold ? "overstock" : "none";
  const daysOfCover = averageDailyDemand > 0 ? availableStock / averageDailyDemand : null;
  const risk = action === "reorder" && (availableStock === 0 || daysOfCover <= 2) ? "high" : action === "reorder" || action === "overstock" ? "medium" : "low";
  const demandChangePercent = historicalAverageDailyDemand > 0 ? (averageDailyDemand - historicalAverageDailyDemand) / historicalAverageDailyDemand * 100 : 0;
  const demandSpike = historicalAverageDailyDemand > 0 && averageDailyDemand >= historicalAverageDailyDemand * 1.25
    && averageDailyDemand >= historicalAverageDailyDemand + demandStdDev;
  const recommendations = [];
  if (action === "reorder") recommendations.push({ type: risk === "high" ? "critical_stock" : "low_stock", risk, suggestedQuantity: recommendedOrderQuantity });
  if (action === "overstock") recommendations.push({ type: "overstock", risk: "medium", suggestedQuantity: 0 });
  if (demandSpike) recommendations.push({ type: "demand_spike", risk: demandChangePercent >= 75 ? "high" : "medium", suggestedQuantity: recommendedOrderQuantity });

  return {
    predictions: dailyPredictions,
    revenue: { unitRevenue, source: revenueSource, forecastRevenue },
    recommendations,
    inventoryPlan: {
      currentStock: round(currentStock), reservedStock: round(reservedStock), availableStock: round(availableStock),
      leadTimeDays, safetyStockPercent: round(safetyStockPercent), serviceLevelFactor,
      historicalAverageDailyDemand: round(historicalAverageDailyDemand, 4), demandStdDev: round(demandStdDev, 4),
      averageDailyDemand: round(averageDailyDemand, 4), demandChangePercent: round(demandChangePercent, 2), demandSpike,
      leadTimeDemand: round(leadTimeDemand, 4), variabilitySafetyStock: round(variabilitySafetyStock, 4),
      policySafetyStock: round(policySafetyStock, 4), safetyStock: round(safetyStock, 4), reorderPoint,
      targetStock, recommendedOrderQuantity, daysOfCover: daysOfCover === null ? null : round(daysOfCover, 2), action, risk,
    },
  };
}

export function recommendationReason(type, productName, storeCode, plan, horizonDays) {
  if (type === "overstock") return `${productName} at ${storeCode} has ${plan.availableStock} available units, above the ${plan.targetStock}-unit target for the next ${horizonDays} days.`;
  if (type === "demand_spike") return `${productName} at ${storeCode} is forecast to rise ${plan.demandChangePercent}% above its historical daily average. Review supply capacity for the next ${horizonDays} days.`;
  if (type === "critical_stock") return `${productName} at ${storeCode} has only ${plan.daysOfCover ?? 0} forecast days of cover. Order ${plan.recommendedOrderQuantity} units immediately to reach the ${plan.targetStock}-unit target.`;
  return `${productName} at ${storeCode} needs ${plan.recommendedOrderQuantity} units to reach a ${plan.targetStock}-unit target, including ${plan.safetyStock} safety-stock units.`;
}
