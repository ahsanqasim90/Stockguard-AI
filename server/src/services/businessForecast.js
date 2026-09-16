const DAY_MS = 24 * 60 * 60 * 1000;
export const FORECAST_HORIZONS = [7, 14, 28];

export function forecastError(message, statusCode = 422) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function continuousHistory(sales, horizon) {
  if (!FORECAST_HORIZONS.includes(horizon)) throw forecastError("Forecast horizon must be 7, 14 or 28 days.", 400);
  const needed = Math.max(28, horizon + 7);
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

function dateString(date) { return new Date(date).toISOString().slice(0, 10); }
function nextDate(date, days) { return dateString(new Date(new Date(date).getTime() + days * DAY_MS)); }

export function createBusinessForecast(sales, horizon) {
  continuousHistory(sales, horizon);
  const values = sales.map((sale) => sale.quantity);
  const holdout = values.slice(-horizon);
  const backtestPredictions = seasonalNaive(values.slice(0, -horizon), horizon);
  const errors = holdout.map((actual, index) => actual - backtestPredictions[index]);
  const mae = errors.reduce((sum, error) => sum + Math.abs(error), 0) / horizon;
  const rmse = Math.sqrt(errors.reduce((sum, error) => sum + error * error, 0) / horizon);
  const latestDate = sales.at(-1).date;
  const predictions = seasonalNaive(values, horizon).map((forecastSales, index) => ({
    date: nextDate(latestDate, index + 1), forecast_sales: Number(forecastSales.toFixed(4)),
  }));
  return {
    model: "seasonal_naive", modelVersion: "business-baseline-1.0.0", horizon,
    latestActualDate: dateString(latestDate), forecastStartDate: predictions[0].date,
    forecastTotal: Number(predictions.reduce((sum, point) => sum + point.forecast_sales, 0).toFixed(2)),
    backtest: { observations: horizon, cutoff: nextDate(latestDate, -horizon),
      mae: Number(mae.toFixed(4)), rmse: Number(rmse.toFixed(4)) },
    history: sales.slice(-28).map((sale) => ({ date: dateString(sale.date), quantity: sale.quantity })),
    predictions,
  };
}
