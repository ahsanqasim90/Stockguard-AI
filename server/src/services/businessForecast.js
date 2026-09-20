import {
  manifest,
  predictXGBoost,
  productionSeriesCodes,
} from "./xgboostRuntime.js";

const DAY_MS = 24 * 60 * 60 * 1000;
export const FORECAST_HORIZONS = [7, 14, 28];

export function forecastError(message, statusCode = 422) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function continuousHistory(sales, horizon, requiredRows = Math.max(28, horizon + 7)) {
  if (!FORECAST_HORIZONS.includes(horizon)) throw forecastError("Forecast horizon must be 7, 14 or 28 days.", 400);
  const needed = requiredRows;
  if (sales.length < needed) throw forecastError(`At least ${needed} consecutive daily sales rows are needed for a ${horizon}-day forecast. Include zero-sales days.`);
  const recent = sales.slice(-needed);
  for (let i = 1; i < recent.length; i += 1) {
    if (new Date(recent[i].date).getTime() - new Date(recent[i - 1].date).getTime() !== DAY_MS)
      throw forecastError(`Recent sales history has missing dates. Upload ${needed} consecutive daily rows, including zero-sales days.`);
  }
  return recent;
}

function seasonalNaive(values, horizon) {
  const history = [...values];
  const predictions = [];
  for (let i = 0; i < horizon; i += 1) {
    const quantity = history[history.length - 7];
    if (!Number.isFinite(quantity) || quantity < 0) throw forecastError("Sales history contains an invalid quantity.");
    predictions.push(quantity);
    history.push(quantity);
  }
  return predictions;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function utcCalendarFeatures(date) {
  const value = new Date(`${date}T00:00:00.000Z`);
  const weekday = ((value.getUTCDay() + 6) % 7) + 1;
  const month = value.getUTCMonth() + 1;
  return [
    Math.fround(Math.sin(weekday * 2 * Math.PI / 7)),
    Math.fround(Math.cos(weekday * 2 * Math.PI / 7)),
    Math.fround(Math.sin(month * 2 * Math.PI / 12)),
    Math.fround(Math.cos(month * 2 * Math.PI / 12)),
  ];
}

function xgboostForecast(values, startDate, horizon, codes) {
  const history = values.map((value) => Math.fround(value));
  const predictions = [];
  for (let offset = 0; offset < horizon; offset += 1) {
    const date = nextDate(startDate, offset);
    const features = [
      codes.storeCode,
      codes.productCode,
      Math.fround(history.at(-1)),
      Math.fround(history.at(-7)),
      Math.fround(history.at(-14)),
      Math.fround(history.at(-28)),
      Math.fround(mean(history.slice(-7))),
      Math.fround(mean(history.slice(-28))),
      ...utcCalendarFeatures(date),
    ];
    const prediction = Math.max(0, predictXGBoost(features));
    predictions.push(prediction);
    history.push(prediction);
  }
  return predictions;
}

function dateString(date) { return new Date(date).toISOString().slice(0, 10); }
function nextDate(date, days) { return dateString(new Date(new Date(date).getTime() + days * DAY_MS)); }

export function createBusinessForecast(sales, horizon, series = {}) {
  const codes = productionSeriesCodes(series.storeCode, series.productCode);
  const xgboostRequiredRows = 28 + horizon;
  const useXGBoost = Boolean(codes && sales.length >= xgboostRequiredRows);
  const requiredRows = useXGBoost ? xgboostRequiredRows : Math.max(28, horizon + 7);
  continuousHistory(sales, horizon, requiredRows);
  const values = sales.map((sale) => sale.quantity);
  const holdout = values.slice(-horizon);
  if (!values.every((value) => Number.isFinite(value) && value >= 0)) {
    throw forecastError("Sales history contains an invalid quantity.");
  }
  const holdoutStart = dateString(sales.at(-horizon).date);
  const backtestPredictions = useXGBoost
    ? xgboostForecast(values.slice(0, -horizon), holdoutStart, horizon, codes)
    : seasonalNaive(values.slice(0, -horizon), horizon);
  const errors = holdout.map((actual, index) => actual - backtestPredictions[index]);
  const mae = errors.reduce((sum, error) => sum + Math.abs(error), 0) / horizon;
  const rmse = Math.sqrt(errors.reduce((sum, error) => sum + error * error, 0) / horizon);
  const latestDate = sales.at(-1).date;
  const forecastStart = nextDate(latestDate, 1);
  const forecastValues = useXGBoost
    ? xgboostForecast(values, forecastStart, horizon, codes)
    : seasonalNaive(values, horizon);
  const predictions = forecastValues.map((forecastSales, index) => ({
    date: nextDate(latestDate, index + 1), forecast_sales: Number(forecastSales.toFixed(4)),
  }));
  const selectionReason = useXGBoost
    ? "Store and product IDs match the production model mappings and sufficient lag history is available."
    : codes
      ? `The mapped series needs at least ${xgboostRequiredRows} consecutive rows for a measured ${horizon}-day XGBoost run; seasonal fallback was used.`
      : "Store or product ID is outside the production model mappings; seasonal fallback was used.";
  return {
    model: useXGBoost ? manifest.model_type : "seasonal_naive",
    modelVersion: useXGBoost ? manifest.model_version : "business-baseline-1.0.0",
    modelSelection: selectionReason,
    horizon,
    latestActualDate: dateString(latestDate), forecastStartDate: predictions[0].date,
    forecastTotal: Number(predictions.reduce((sum, point) => sum + point.forecast_sales, 0).toFixed(2)),
    backtest: { observations: horizon, cutoff: holdoutStart,
      mae: Number(mae.toFixed(4)), rmse: Number(rmse.toFixed(4)) },
    history: sales.slice(-28).map((sale) => ({ date: dateString(sale.date), quantity: sale.quantity })),
    predictions,
  };
}

export function selectBestForecast(nodeForecast, pythonResult, sales) {
  const latestActualDate = dateString(sales.at(-1).date);
  const history = sales.slice(-28).map((sale) => ({ date: dateString(sale.date), quantity: sale.quantity }));
  const pythonCandidates = pythonResult.comparisons.filter((item) => item.status === "ready").map((item) => ({
    model: item.model,
    modelVersion: item.modelVersion,
    horizon: nodeForecast.horizon,
    latestActualDate,
    forecastStartDate: item.predictions[0].date,
    forecastTotal: item.forecastTotal,
    backtest: item.backtest,
    history,
    predictions: item.predictions,
    durationMs: item.durationMs,
  }));
  const candidates = [{ ...nodeForecast, durationMs: 0 }, ...pythonCandidates];
  const winner = candidates.reduce((best, item) => (
    item.backtest.mae < best.backtest.mae
      || (item.backtest.mae === best.backtest.mae && item.backtest.rmse < best.backtest.rmse)
      ? item : best
  ));
  const comparisons = candidates.map((item) => ({
    model: item.model,
    modelVersion: item.modelVersion,
    mae: item.backtest.mae,
    rmse: item.backtest.rmse,
    selected: item.model === winner.model && item.modelVersion === winner.modelVersion,
    durationMs: item.durationMs,
  }));
  return {
    ...winner,
    modelSelection: `${winner.model.replaceAll("_", " ")} was automatically selected because it achieved the lowest holdout MAE (${winner.backtest.mae.toFixed(4)}) across ${comparisons.length} live models.`,
    comparisons,
    comparisonServiceVersion: pythonResult.serviceVersion,
  };
}
