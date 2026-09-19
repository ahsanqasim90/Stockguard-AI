import { readFileSync } from "node:fs";

import { predictXGBoost, productionModelStatus } from "../src/services/xgboostRuntime.js";
import { createBusinessForecast } from "../src/services/businessForecast.js";

const fixtureUrl = new URL("../models/production/v1.0.0/parity_fixture.json", import.meta.url);
const fixture = JSON.parse(readFileSync(fixtureUrl, "utf8"));
let maximumError = 0;

for (const row of fixture.rows) {
  const actual = predictXGBoost(row.features.map((value) => Math.fround(value)));
  const error = Math.abs(actual - row.prediction);
  maximumError = Math.max(maximumError, error);
  if (error > 0.00001) {
    throw new Error(`Node XGBoost parity failed: expected ${row.prediction}, received ${actual}.`);
  }
}

const status = productionModelStatus();
const start = Date.UTC(2026, 0, 1);
const sales = Array.from({ length: 60 }, (_, index) => ({
  date: new Date(start + index * 86_400_000),
  quantity: (index % 7) + 1,
}));
const recursive = createBusinessForecast(sales, 7, { storeCode: "S0085", productCode: "P0131" });
const expectedRecursive = [3.9491, 3.7558, 3.7804, 3.8391, 4.0947, 4.9595, 4.9816];
if (recursive.model !== "global_xgboost"
  || JSON.stringify(recursive.predictions.map((point) => point.forecast_sales)) !== JSON.stringify(expectedRecursive)) {
  throw new Error("Recursive production forecast does not match XGBoost 3.2 output.");
}
console.log("StockGuard production XGBoost runtime check PASSED");
console.log(`Model ${status.version}: ${status.trees} trees, ${status.features} features, SHA-256 verified`);
console.log(`${fixture.rows.length} official XGBoost 3.2 parity rows, maximum error ${maximumError}`);
console.log("Recursive store/product feature engineering parity: PASSED");
