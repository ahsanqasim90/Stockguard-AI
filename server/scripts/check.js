process.env.NODE_ENV = "test";

const { default: mongoose } = await import("mongoose");
await import("../src/models/index.js");
const { default: app } = await import("../src/app.js");
const { effectivePermissions } = await import("../src/services/permissions.js");
const { createBusinessForecast, FORECAST_HORIZONS } = await import("../src/services/businessForecast.js");
const { buildDecisionSupport } = await import("../src/services/decisionSupport.js");

const expectedModels = [
  "Business", "User", "Invitation", "PasswordReset", "AuditLog", "Notification", "PushDevice", "Store", "Product", "Sale", "Inventory", "ImportBatch", "Forecast", "ForecastRun", "Recommendation", "Report",
];
const missingModels = expectedModels.filter((name) => !mongoose.models[name]);

if (missingModels.length) throw new Error(`Missing Mongoose models: ${missingModels.join(", ")}`);
if (typeof app.listen !== "function") throw new Error("Express application failed to initialize.");
if (effectivePermissions({ role: "staff", permissionsCustomized: false }).includes("users.manage"))
  throw new Error("Staff role permission boundary failed.");
if (!effectivePermissions({ role: "manager", permissionsCustomized: true, permissions: ["users.manage"] }).includes("users.manage"))
  throw new Error("Custom permission override failed.");
if (!FORECAST_HORIZONS.includes(30)) throw new Error("Thirty-day forecast horizon is not enabled.");

const forecastHistory = Array.from({ length: 60 }, (_, index) => ({
  date: new Date(Date.UTC(2026, 0, index + 1)),
  quantity: index % 7 + 1,
}));
const seasonalThirty = createBusinessForecast(forecastHistory, 30, { storeCode: "CUSTOM", productCode: "CUSTOM" });
if (seasonalThirty.model !== "seasonal_naive" || seasonalThirty.predictions.length !== 30
  || seasonalThirty.backtest.observations !== 30) throw new Error("Thirty-day seasonal forecast check failed.");
const xgboostThirty = createBusinessForecast(forecastHistory, 30, { storeCode: "S0085", productCode: "P0131" });
if (xgboostThirty.model !== "global_xgboost" || xgboostThirty.predictions.length !== 30
  || xgboostThirty.backtest.observations !== 30) throw new Error("Thirty-day XGBoost forecast check failed.");
const decisionSupport = buildDecisionSupport({
  predictions: Array.from({ length: 30 }, (_, index) => ({ date: `2026-03-${String(index + 1).padStart(2, "0")}`, forecast_sales: 10 })),
  sales: [{ quantity: 20, revenue: 1000 }], product: { price: 40, supplierLeadTimeDays: 7 },
  inventory: { quantityOnHand: 25, quantityReserved: 5 },
  businessSettings: { safetyStockPercent: 20, defaultLeadTimeDays: 5 },
});
if (decisionSupport.revenue.unitRevenue !== 50 || decisionSupport.revenue.forecastRevenue !== 15000
  || decisionSupport.predictions.length !== 30 || decisionSupport.predictions.some((point) => point.forecast_revenue !== 500)
  || decisionSupport.inventoryPlan.reorderPoint !== 84 || decisionSupport.inventoryPlan.targetStock !== 314
  || decisionSupport.inventoryPlan.recommendedOrderQuantity !== 294 || decisionSupport.inventoryPlan.action !== "reorder"
  || decisionSupport.recommendations[0]?.type !== "critical_stock") {
  throw new Error("Revenue estimation or stock replenishment calculation failed.");
}
const lowStock = buildDecisionSupport({
  predictions: Array.from({ length: 30 }, (_, index) => ({ date: `2026-05-${String(index + 1).padStart(2, "0")}`, forecast_sales: 10 })),
  sales: [{ quantity: 10 }], product: { price: 10, supplierLeadTimeDays: 7 },
  inventory: { quantityOnHand: 50, quantityReserved: 0 }, businessSettings: { safetyStockPercent: 20 },
});
if (lowStock.recommendations[0]?.type !== "low_stock" || lowStock.recommendations[0]?.risk !== "medium")
  throw new Error("Low-stock recommendation classification failed.");
const variableDemand = buildDecisionSupport({
  predictions: Array.from({ length: 30 }, (_, index) => ({ date: `2026-04-${String(index + 1).padStart(2, "0")}`, forecast_sales: 20 })),
  sales: [{ quantity: 0 }, { quantity: 10 }, { quantity: 20 }], product: { price: 10, supplierLeadTimeDays: 7 },
  inventory: { quantityOnHand: 1000, quantityReserved: 0 }, businessSettings: { safetyStockPercent: 15 },
});
if (variableDemand.inventoryPlan.demandStdDev <= 0
  || variableDemand.inventoryPlan.variabilitySafetyStock <= variableDemand.inventoryPlan.policySafetyStock
  || !variableDemand.inventoryPlan.demandSpike
  || !variableDemand.recommendations.some((item) => item.type === "overstock")
  || !variableDemand.recommendations.some((item) => item.type === "demand_spike")) {
  throw new Error("Demand variability, safety stock, overstock or demand-spike detection failed.");
}

const server = app.listen(0);
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;
try {
  const health = await fetch(`${baseUrl}/api/health`);
  const healthBody = await health.json();
  if (health.status !== 200 || healthBody.productionModel?.model !== "global_xgboost"
    || healthBody.productionModel?.available !== true) {
    throw new Error("Production model health check failed.");
  }
  const invalidRegistration = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  if (invalidRegistration.status !== 400) throw new Error("Registration validation check failed.");

  const protectedProfile = await fetch(`${baseUrl}/api/auth/me`);
  if (protectedProfile.status !== 401) throw new Error("Protected route check failed.");

  const protectedPasswordChange = await fetch(`${baseUrl}/api/auth/password/change`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ currentPassword: "a", newPassword: "New-Password-2026" }),
  });
  if (protectedPasswordChange.status !== 401) throw new Error("Password change route protection check failed.");

  const protectedSettings = await fetch(`${baseUrl}/api/settings`);
  if (protectedSettings.status !== 401) throw new Error("Settings route protection check failed.");

  const protectedAdmin = await fetch(`${baseUrl}/api/admin/users`);
  if (protectedAdmin.status !== 401) throw new Error("Admin route protection check failed.");

  const protectedNotifications = await fetch(`${baseUrl}/api/notifications`);
  if (protectedNotifications.status !== 401) throw new Error("Notification route protection check failed.");

  const protectedRecommendations = await fetch(`${baseUrl}/api/recommendations`);
  if (protectedRecommendations.status !== 401) throw new Error("Recommendation route protection check failed.");

  const invalidPasswordRecovery = await fetch(`${baseUrl}/api/auth/password/forgot`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "invalid" }),
  });
  if (invalidPasswordRecovery.status !== 400) throw new Error("Password recovery validation check failed.");

  const invalidMobileLogin = await fetch(`${baseUrl}/api/auth/mobile/login`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}),
  });
  if (invalidMobileLogin.status !== 400) throw new Error("Mobile login validation check failed.");

  const invalidMobileRefresh = await fetch(`${baseUrl}/api/auth/mobile/refresh`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}),
  });
  if (invalidMobileRefresh.status !== 400) throw new Error("Mobile refresh validation check failed.");

  const mobileLogout = await fetch(`${baseUrl}/api/auth/mobile/logout`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ refreshToken: "invalid" }),
  });
  if (mobileLogout.status !== 204) throw new Error("Mobile logout should safely clear an invalid session.");
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

console.log("StockGuard MERN backend check PASSED");
console.log(`Mongoose models: ${expectedModels.join(", ")}`);
console.log("Health endpoint: GET /api/health");
console.log("Authentication endpoints: web and mobile login/refresh/logout, register, me");
console.log("Authentication, settings, notifications, recommendations and admin route protection: PASSED");
console.log("Thirty-day seasonal and XGBoost recursive forecasting: PASSED");
console.log("Demand variability, safety stock, revenue and replenishment decision support: PASSED");
