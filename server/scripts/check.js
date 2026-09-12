process.env.NODE_ENV = "test";

const { default: mongoose } = await import("mongoose");
await import("../src/models/index.js");
const { default: app } = await import("../src/app.js");

const expectedModels = [
  "Business", "User", "Store", "Product", "Sale", "Inventory", "Forecast", "Recommendation",
];
const missingModels = expectedModels.filter((name) => !mongoose.models[name]);

if (missingModels.length) throw new Error(`Missing Mongoose models: ${missingModels.join(", ")}`);
if (typeof app.listen !== "function") throw new Error("Express application failed to initialize.");

console.log("StockGuard MERN backend check PASSED");
console.log(`Mongoose models: ${expectedModels.join(", ")}`);
console.log("Health endpoint: GET /api/health");
