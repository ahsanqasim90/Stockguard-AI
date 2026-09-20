import crypto from "node:crypto";

import { env } from "../config/env.js";
import { forecastError } from "./businessForecast.js";

const MODEL_NAMES = new Set(["linear_regression", "arima", "random_forest"]);

function endpoint() {
  if (process.env.ML_API_URL) return process.env.ML_API_URL.replace(/\/+$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}/ml`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}/ml`;
  return env.mlApiUrl.replace(/\/+$/, "");
}

function validateComparison(body, horizon) {
  if (!body || body.service !== "stockguard-python-ml" || !Array.isArray(body.comparisons)) {
    throw forecastError("The Python ML service returned an invalid response.", 502);
  }
  const ready = body.comparisons.filter((item) => item?.status === "ready");
  if (ready.length !== 3 || ready.some((item) => !MODEL_NAMES.has(item.model)
    || item.predictions?.length !== horizon || !Number.isFinite(item.backtest?.mae)
    || !Number.isFinite(item.backtest?.rmse))) {
    throw forecastError("The Python ML service did not complete all three proposal models.", 502);
  }
  return body;
}

export function pythonMlEndpoint() { return endpoint(); }

export async function comparePythonModels(sales, horizon) {
  const payload = JSON.stringify({
    dates: sales.map((sale) => new Date(sale.date).toISOString().slice(0, 10)),
    values: sales.map((sale) => sale.quantity),
    horizon,
  });
  const signature = crypto.createHmac("sha256", env.jwtAccessSecret).update(payload).digest("hex");
  let response;
  try {
    response = await fetch(endpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-StockGuard-ML-Signature": signature },
      body: payload,
      signal: AbortSignal.timeout(55_000),
    });
  } catch (error) {
    throw forecastError(`Python ML service is unavailable: ${error.message}`, 503);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof body.detail === "string" ? body.detail : "Model comparison failed.";
    throw forecastError(detail, response.status >= 500 ? 503 : response.status);
  }
  return validateComparison(body, horizon);
}

export async function pythonMlStatus() {
  try {
    const response = await fetch(endpoint(), { signal: AbortSignal.timeout(8_000) });
    const body = await response.json();
    return {
      configured: true,
      state: response.ok && body.status === "ok" ? "connected" : "unavailable",
      service: body.service || null,
      version: body.version || null,
      models: body.models || [],
    };
  } catch (error) {
    return { configured: true, state: "unavailable", models: [...MODEL_NAMES], message: error.message };
  }
}
