process.env.NODE_ENV = "test";

const { default: mongoose } = await import("mongoose");
await import("../src/models/index.js");
const { default: app } = await import("../src/app.js");
const { effectivePermissions } = await import("../src/services/permissions.js");

const expectedModels = [
  "Business", "User", "Invitation", "AuditLog", "Store", "Product", "Sale", "Inventory", "ImportBatch", "Forecast", "ForecastRun", "Recommendation", "Report",
];
const missingModels = expectedModels.filter((name) => !mongoose.models[name]);

if (missingModels.length) throw new Error(`Missing Mongoose models: ${missingModels.join(", ")}`);
if (typeof app.listen !== "function") throw new Error("Express application failed to initialize.");
if (effectivePermissions({ role: "staff", permissionsCustomized: false }).includes("users.manage"))
  throw new Error("Staff role permission boundary failed.");
if (!effectivePermissions({ role: "manager", permissionsCustomized: true, permissions: ["users.manage"] }).includes("users.manage"))
  throw new Error("Custom permission override failed.");

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

  const protectedSettings = await fetch(`${baseUrl}/api/settings`);
  if (protectedSettings.status !== 401) throw new Error("Settings route protection check failed.");

  const protectedAdmin = await fetch(`${baseUrl}/api/admin/users`);
  if (protectedAdmin.status !== 401) throw new Error("Admin route protection check failed.");

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
console.log("Authentication, settings and admin route protection: PASSED");
