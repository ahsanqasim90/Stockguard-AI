process.env.NODE_ENV = "test";

const { default: mongoose } = await import("mongoose");
await import("../src/models/index.js");
const { default: app } = await import("../src/app.js");

const expectedModels = [
  "Business", "User", "Store", "Product", "Sale", "Inventory", "ImportBatch", "Forecast", "ForecastRun", "Recommendation", "Report",
];
const missingModels = expectedModels.filter((name) => !mongoose.models[name]);

if (missingModels.length) throw new Error(`Missing Mongoose models: ${missingModels.join(", ")}`);
if (typeof app.listen !== "function") throw new Error("Express application failed to initialize.");

const server = app.listen(0);
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;
try {
  const invalidRegistration = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  if (invalidRegistration.status !== 400) throw new Error("Registration validation check failed.");

  const protectedProfile = await fetch(`${baseUrl}/api/auth/me`);
  if (protectedProfile.status !== 401) throw new Error("Protected route check failed.");

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
console.log("Authentication validation and route protection: PASSED");
