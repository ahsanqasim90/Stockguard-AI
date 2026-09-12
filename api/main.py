import hashlib
import json
import math
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb
from fastapi import FastAPI, HTTPException
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


class PredictionRequest(BaseModel):
    store_id: str
    product_id: str
    start_date: date
    history: list[float] = Field(min_length=7)
    horizon: int = Field(default=28, ge=1, le=90)


class ModelRuntime:
    def __init__(self) -> None:
        self.root = Path(__file__).resolve().parents[1]
        production = self.root / "artifacts" / "production"
        current = json.loads(
            (production / "current.json").read_text(encoding="utf-8-sig")
        )
        self.version_dir = production / current["directory"]
        self.manifest = json.loads(
            (self.version_dir / "training_manifest.json").read_text(encoding="utf-8")
        )
        self.mappings = json.loads(
            (self.version_dir / "category_mappings.json").read_text(encoding="utf-8")
        )

        model_path = self.version_dir / self.manifest["model_file"]
        actual_hash = hashlib.sha256(model_path.read_bytes()).hexdigest()
        if actual_hash != self.manifest["model_sha256"]:
            raise RuntimeError("Production model checksum verification failed.")

        required_version = str(self.manifest["xgboost_version"])
        if xgb.__version__ != required_version:
            raise RuntimeError(
                f"Production model requires XGBoost {required_version}; "
                f"installed version is {xgb.__version__}."
            )

        self.model = xgb.Booster()
        self.model.load_model(model_path)
        self.model.set_param({"device": "cpu"})
        self.features = list(self.manifest["feature_columns"])
        if self.model.feature_names != self.features:
            raise RuntimeError("Model feature names do not match the manifest.")

        self.store_codes = self.mappings["stores"]
        self.product_codes = self.mappings["products"]
        self.store_categories = list(range(len(self.store_codes)))
        self.product_categories = list(range(len(self.product_codes)))

        forecast_path = self.version_dir / "forecast_28_days.csv"
        self.precomputed = pd.read_csv(forecast_path, parse_dates=["date"])
        self.precomputed["date"] = self.precomputed["date"].dt.date

    def forecast(
        self,
        store_id: str,
        product_id: str,
        start_date: date,
        history: list[float],
        horizon: int,
    ) -> dict:
        clean_history = [float(value) for value in history]
        if not all(math.isfinite(value) and value >= 0 for value in clean_history):
            raise ValueError("History must contain only finite, non-negative sales values.")

        known_series = (
            store_id in self.store_codes and product_id in self.product_codes
        )
        use_xgboost = known_series and len(clean_history) >= 28
        model_name = "xgboost" if use_xgboost else "seasonal_naive"
        values = clean_history.copy()
        predictions = []

        for offset in range(horizon):
            forecast_date = start_date + timedelta(days=offset)
            if use_xgboost:
                weekday = forecast_date.isoweekday()
                month = forecast_date.month
                frame = pd.DataFrame(
                    {
                        "store_code": pd.Categorical(
                            [self.store_codes[store_id]],
                            categories=self.store_categories,
                        ),
                        "product_code": pd.Categorical(
                            [self.product_codes[product_id]],
                            categories=self.product_categories,
                        ),
                        "lag_1": np.array([values[-1]], dtype=np.float32),
                        "lag_7": np.array([values[-7]], dtype=np.float32),
                        "lag_14": np.array([values[-14]], dtype=np.float32),
                        "lag_28": np.array([values[-28]], dtype=np.float32),
                        "rolling_7": np.array(
                            [np.mean(values[-7:])], dtype=np.float32
                        ),
                        "rolling_28": np.array(
                            [np.mean(values[-28:])], dtype=np.float32
                        ),
                        "day_sin": np.array(
                            [np.sin(weekday * 2 * np.pi / 7)], dtype=np.float32
                        ),
                        "day_cos": np.array(
                            [np.cos(weekday * 2 * np.pi / 7)], dtype=np.float32
                        ),
                        "month_sin": np.array(
                            [np.sin(month * 2 * np.pi / 12)], dtype=np.float32
                        ),
                        "month_cos": np.array(
                            [np.cos(month * 2 * np.pi / 12)], dtype=np.float32
                        ),
                    }
                )[self.features]
                prediction = float(
                    np.clip(self.model.inplace_predict(frame)[0], 0, None)
                )
            else:
                prediction = max(0.0, float(values[-7]))

            values.append(prediction)
            predictions.append(
                {
                    "date": forecast_date.isoformat(),
                    "forecast_sales": round(prediction, 4),
                }
            )

        return {
            "store_id": store_id,
            "product_id": product_id,
            "model": model_name,
            "horizon": horizon,
            "forecast_total": round(
                sum(item["forecast_sales"] for item in predictions), 2
            ),
            "predictions": predictions,
        }

    def saved_forecast(self, store_id: str, product_id: str) -> dict | None:
        rows = self.precomputed.loc[
            (self.precomputed["store_id"] == store_id)
            & (self.precomputed["product_id"] == product_id)
        ].sort_values("date")
        if rows.empty:
            return None
        predictions = [
            {
                "date": row.date.isoformat(),
                "forecast_sales": round(float(row.forecast_sales), 4),
            }
            for row in rows.itertuples(index=False)
        ]
        return {
            "store_id": store_id,
            "product_id": product_id,
            "model": str(rows.iloc[0]["model"]),
            "horizon": len(predictions),
            "forecast_total": round(
                sum(item["forecast_sales"] for item in predictions), 2
            ),
            "predictions": predictions,
        }


runtime = ModelRuntime()
app = FastAPI(title="StockGuard AI Prediction API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse(url="/docs")


@app.get("/api/stores")
def stores() -> dict:
    pairs = runtime.precomputed[["store_id", "product_id"]].drop_duplicates()
    counts = (
        pairs.groupby("store_id")["product_id"]
        .nunique()
        .sort_index()
    )
    return {
        "stores": [
            {
                "store_id": str(store_id),
                "product_count": int(product_count),
            }
            for store_id, product_count in counts.items()
        ]
    }


@app.get("/api/stores/{store_id}/products")
def store_products(store_id: str) -> dict:
    products = sorted(
        runtime.precomputed.loc[
            runtime.precomputed["store_id"] == store_id,
            "product_id",
        ].unique().tolist()
    )
    if not products:
        raise HTTPException(status_code=404, detail="Store has no saved forecasts.")
    return {"store_id": store_id, "products": products}


@app.get("/api/top-forecasts")
def top_forecasts(limit: int = 10) -> dict:
    safe_limit = min(max(limit, 1), 100)
    totals = (
        runtime.precomputed.groupby(["store_id", "product_id"], as_index=False)[
            "forecast_sales"
        ]
        .sum()
        .rename(columns={"forecast_sales": "forecast_28_day_total"})
        .nlargest(safe_limit, "forecast_28_day_total")
    )
    return {
        "items": [
            {
                "store_id": str(row.store_id),
                "product_id": str(row.product_id),
                "forecast_28_day_total": round(
                    float(row.forecast_28_day_total), 2
                ),
            }
            for row in totals.itertuples(index=False)
        ]
    }


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "model_version": runtime.manifest["model_version"],
        "model_type": runtime.manifest["model_type"],
    }


@app.get("/api/model")
def model_info() -> dict:
    return runtime.manifest


@app.get("/api/forecast/{store_id}/{product_id}")
def saved_forecast(store_id: str, product_id: str) -> dict:
    result = runtime.saved_forecast(store_id, product_id)
    if result is None:
        raise HTTPException(
            status_code=404,
            detail="No saved forecast exists for this store-product series.",
        )
    return result


@app.post("/api/predict")
def predict(request: PredictionRequest) -> dict:
    try:
        return runtime.forecast(
            store_id=request.store_id,
            product_id=request.product_id,
            start_date=request.start_date,
            history=request.history,
            horizon=request.horizon,
        )
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
