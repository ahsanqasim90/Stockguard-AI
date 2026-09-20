"""StockGuard proposal-model comparison service.

The public GET endpoint is a health check. POST requests are signed by the
StockGuard Node API and compare Linear Regression, ARIMA and Random Forest on
the same recursive holdout before returning the lowest-MAE forecast.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import math
import os
import time
import warnings
from datetime import date, timedelta
from typing import Any, Callable

import numpy as np
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, Field, ValidationError, field_validator
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LinearRegression
from statsmodels.tsa.arima.model import ARIMA


SERVICE_VERSION = "1.0.0"
SUPPORTED_HORIZONS = {7, 14, 28}
MODEL_VERSION = {
    "linear_regression": f"sklearn-linear-{SERVICE_VERSION}",
    "arima": f"statsmodels-arima-{SERVICE_VERSION}",
    "random_forest": f"sklearn-random-forest-{SERVICE_VERSION}",
}


class ComparisonRequest(BaseModel):
    dates: list[date] = Field(min_length=21, max_length=365)
    values: list[float] = Field(min_length=21, max_length=365)
    horizon: int

    @field_validator("horizon")
    @classmethod
    def validate_horizon(cls, value: int) -> int:
        if value not in SUPPORTED_HORIZONS:
            raise ValueError("Forecast horizon must be 7, 14 or 28 days.")
        return value

    @field_validator("values")
    @classmethod
    def validate_values(cls, values: list[float]) -> list[float]:
        if any(not math.isfinite(value) or value < 0 for value in values):
            raise ValueError("Sales values must be finite and non-negative.")
        return values


app = FastAPI(
    title="StockGuard Python ML Service",
    version=SERVICE_VERSION,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)


def _verify_signature(body: bytes, signature: str | None) -> None:
    secret = os.environ.get("JWT_ACCESS_SECRET", "development-access-secret-change-me")
    expected = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    if not signature or not hmac.compare_digest(expected, signature):
        raise HTTPException(status_code=401, detail="Invalid ML service signature.")


def _validate_request(payload: ComparisonRequest) -> None:
    if len(payload.dates) != len(payload.values):
        raise HTTPException(status_code=422, detail="Dates and values must have equal length.")
    needed = payload.horizon + 14
    if len(payload.values) < needed:
        raise HTTPException(
            status_code=422,
            detail=f"At least {needed} consecutive daily rows are required for a measured {payload.horizon}-day comparison.",
        )
    for previous, current in zip(payload.dates, payload.dates[1:]):
        if current - previous != timedelta(days=1):
            raise HTTPException(status_code=422, detail="Sales dates must be consecutive and include zero-sales days.")


def _calendar_features(value: date) -> list[float]:
    weekday = value.isoweekday()
    month = value.month
    return [
        math.sin(weekday * 2 * math.pi / 7),
        math.cos(weekday * 2 * math.pi / 7),
        math.sin(month * 2 * math.pi / 12),
        math.cos(month * 2 * math.pi / 12),
    ]


def _row(history: list[float], value_date: date, trend: int) -> list[float]:
    return [
        float(trend),
        float(history[-1]),
        float(history[-7]),
        float(np.mean(history[-7:])),
        *_calendar_features(value_date),
    ]


def _supervised(values: list[float], dates: list[date]) -> tuple[np.ndarray, np.ndarray]:
    rows: list[list[float]] = []
    targets: list[float] = []
    for index in range(7, len(values)):
        rows.append(_row(values[:index], dates[index], index))
        targets.append(values[index])
    return np.asarray(rows, dtype=np.float64), np.asarray(targets, dtype=np.float64)


def _recursive_regression(
    estimator: Any,
    train_values: list[float],
    train_dates: list[date],
    forecast_dates: list[date],
) -> list[float]:
    features, targets = _supervised(train_values, train_dates)
    estimator.fit(features, targets)
    history = list(train_values)
    predictions: list[float] = []
    for offset, forecast_date in enumerate(forecast_dates):
        prediction = max(0.0, float(estimator.predict([_row(history, forecast_date, len(train_values) + offset)])[0]))
        predictions.append(prediction)
        history.append(prediction)
    return predictions


def _linear(values: list[float], dates: list[date], future_dates: list[date]) -> list[float]:
    return _recursive_regression(LinearRegression(), values, dates, future_dates)


def _random_forest(values: list[float], dates: list[date], future_dates: list[date]) -> list[float]:
    estimator = RandomForestRegressor(
        n_estimators=120,
        max_depth=12,
        min_samples_leaf=2,
        random_state=42,
        n_jobs=1,
    )
    return _recursive_regression(estimator, values, dates, future_dates)


def _arima(values: list[float], _dates: list[date], future_dates: list[date]) -> list[float]:
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        fitted = ARIMA(np.asarray(values, dtype=np.float64), order=(2, 1, 2), trend="t").fit(
            method_kwargs={"maxiter": 120}
        )
    forecast = fitted.forecast(steps=len(future_dates))
    return [max(0.0, float(value)) for value in forecast]


MODEL_RUNNERS: list[tuple[str, Callable[[list[float], list[date], list[date]], list[float]]]] = [
    ("linear_regression", _linear),
    ("arima", _arima),
    ("random_forest", _random_forest),
]


def _metrics(actual: list[float], predicted: list[float]) -> tuple[float, float]:
    errors = np.asarray(actual, dtype=np.float64) - np.asarray(predicted, dtype=np.float64)
    return float(np.mean(np.abs(errors))), float(np.sqrt(np.mean(np.square(errors))))


def _rounded_predictions(dates: list[date], values: list[float]) -> list[dict[str, Any]]:
    return [
        {"date": value_date.isoformat(), "forecast_sales": round(float(value), 4)}
        for value_date, value in zip(dates, values)
    ]


def compare_models(payload: ComparisonRequest) -> dict[str, Any]:
    _validate_request(payload)
    horizon = payload.horizon
    dates = payload.dates
    values = [float(value) for value in payload.values]
    train_dates, train_values = dates[:-horizon], values[:-horizon]
    holdout_dates, holdout = dates[-horizon:], values[-horizon:]
    future_dates = [dates[-1] + timedelta(days=offset) for offset in range(1, horizon + 1)]
    comparisons: list[dict[str, Any]] = []

    for model_name, runner in MODEL_RUNNERS:
        started = time.perf_counter()
        try:
            backtest_values = runner(train_values, train_dates, holdout_dates)
            mae, rmse = _metrics(holdout, backtest_values)
            future_values = runner(values, dates, future_dates)
            predictions = _rounded_predictions(future_dates, future_values)
            comparisons.append({
                "model": model_name,
                "modelVersion": MODEL_VERSION[model_name],
                "status": "ready",
                "durationMs": round((time.perf_counter() - started) * 1000),
                "backtest": {
                    "observations": horizon,
                    "cutoff": holdout_dates[0].isoformat(),
                    "mae": round(mae, 4),
                    "rmse": round(rmse, 4),
                },
                "forecastTotal": round(sum(item["forecast_sales"] for item in predictions), 2),
                "predictions": predictions,
            })
        except Exception as error:  # One failed model must not hide valid comparisons.
            comparisons.append({
                "model": model_name,
                "modelVersion": MODEL_VERSION[model_name],
                "status": "failed",
                "durationMs": round((time.perf_counter() - started) * 1000),
                "message": f"{type(error).__name__}: {error}",
            })

    successful = [item for item in comparisons if item["status"] == "ready"]
    if not successful:
        raise HTTPException(status_code=500, detail="All Python forecasting models failed.")
    winner = min(successful, key=lambda item: (item["backtest"]["mae"], item["backtest"]["rmse"]))
    return {
        "service": "stockguard-python-ml",
        "serviceVersion": SERVICE_VERSION,
        "selectedModel": winner["model"],
        "comparisons": comparisons,
    }


@app.get("/{path:path}")
def health(path: str = "") -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "StockGuard Python ML Service",
        "version": SERVICE_VERSION,
        "models": [name for name, _runner in MODEL_RUNNERS],
    }


@app.post("/{path:path}")
async def compare(request: Request, path: str = "") -> dict[str, Any]:
    body = await request.body()
    _verify_signature(body, request.headers.get("x-stockguard-ml-signature"))
    try:
        payload = ComparisonRequest.model_validate_json(body)
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=json.loads(error.json())) from error
    return compare_models(payload)
