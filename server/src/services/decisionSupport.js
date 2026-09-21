const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
};

export function buildDecisionSupport({ predictions, sales, product, inventory, businessSettings = {} }) {
  const forecastUnits = round(predictions.reduce((sum, point) => sum + point.forecast_sales, 0), 4);
  const soldUnits = sales.reduce((sum, sale) => sum + Number(sale.quantity || 0), 0);
  const recordedRevenue = sales.reduce((sum, sale) => sum + Number(sale.revenue || 0), 0);
  const historicalUnitRevenue = soldUnits > 0 && recordedRevenue > 0 ? recordedRevenue / soldUnits : 0;
  const productUnitPrice = Number(product?.price || 0);
  const unitRevenue = round(historicalUnitRevenue || productUnitPrice, 4);
  const revenueSource = historicalUnitRevenue > 0 ? "historical_average" : productUnitPrice > 0 ? "product_price" : "unavailable";
  const dailyPredictions = predictions.map((point) => ({
    ...point,
    forecast_revenue: round(point.forecast_sales * unitRevenue),
  }));
  const forecastRevenue = round(dailyPredictions.reduce((sum, point) => sum + point.forecast_revenue, 0));

  const horizonDays = Math.max(predictions.length, 1);
  const averageDailyDemand = forecastUnits / horizonDays;
  const leadTimeDays = Math.max(1, Number(product?.supplierLeadTimeDays || businessSettings.defaultLeadTimeDays || 7));
  const safetyStockPercent = Math.max(0, Number(businessSettings.safetyStockPercent ?? 15));
  const currentStock = Math.max(0, Number(inventory?.quantityOnHand || 0));
  const reservedStock = Math.max(0, Number(inventory?.quantityReserved || 0));
  const availableStock = Math.max(0, currentStock - reservedStock);
  const leadTimeDemand = averageDailyDemand * leadTimeDays;
  const safetyStock = leadTimeDemand * safetyStockPercent / 100;
  const reorderPoint = Math.ceil(leadTimeDemand + safetyStock);
  const targetStock = Math.ceil(forecastUnits + safetyStock);
  const recommendedOrderQuantity = Math.max(0, targetStock - availableStock);
  const overstockThreshold = Math.ceil(targetStock * 1.25);
  const action = recommendedOrderQuantity > 0 ? "reorder" : targetStock > 0 && availableStock > overstockThreshold ? "overstock" : "none";
  const risk = action === "reorder" && availableStock <= leadTimeDemand ? "high" : action === "none" ? "low" : "medium";

  return {
    predictions: dailyPredictions,
    revenue: { unitRevenue, source: revenueSource, forecastRevenue },
    inventoryPlan: {
      currentStock: round(currentStock), reservedStock: round(reservedStock), availableStock: round(availableStock),
      leadTimeDays, safetyStockPercent: round(safetyStockPercent), averageDailyDemand: round(averageDailyDemand, 4),
      leadTimeDemand: round(leadTimeDemand, 4), safetyStock: round(safetyStock, 4), reorderPoint,
      targetStock, recommendedOrderQuantity, action, risk,
    },
  };
}

export function recommendationReason(productName, storeCode, plan, horizonDays) {
  if (plan.action === "overstock") {
    return `${productName} at ${storeCode} has ${plan.availableStock} available units, above the ${plan.targetStock}-unit target for the next ${horizonDays} days.`;
  }
  return `${productName} at ${storeCode} needs ${plan.recommendedOrderQuantity} units to reach a ${plan.targetStock}-unit target, including ${plan.safetyStock} safety-stock units.`;
}
