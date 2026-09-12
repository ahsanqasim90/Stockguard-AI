import hashlib
import json
import sys
from datetime import timedelta
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb


def project_root() -> Path:
    return Path(__file__).resolve().parents[1]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> int:
    root = project_root()
    production_root = root / "artifacts" / "production"
    current_path = production_root / "current.json"
    if not current_path.exists():
        raise FileNotFoundError(f"Current model pointer not found: {current_path}")

    current = json.loads(current_path.read_text(encoding="utf-8-sig"))
    version_dir = production_root / current["directory"]
    manifest_path = version_dir / "training_manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    model_path = version_dir / manifest["model_file"]
    actual_hash = sha256(model_path)
    expected_hash = manifest["model_sha256"].lower()
    if actual_hash != expected_hash:
        raise ValueError(
            f"Model checksum mismatch: expected {expected_hash}, found {actual_hash}"
        )

    expected_xgb = str(manifest["xgboost_version"])
    if xgb.__version__ != expected_xgb:
        raise RuntimeError(
            f"XGBoost {expected_xgb} is required, but {xgb.__version__} is installed."
        )

    booster = xgb.Booster()
    booster.load_model(model_path)
    booster.set_param({"device": "cpu"})

    expected_features = list(manifest["feature_columns"])
    if booster.feature_names != expected_features:
        raise ValueError(
            f"Feature mismatch. Manifest={expected_features}, model={booster.feature_names}"
        )

    mappings = json.loads(
        (version_dir / "category_mappings.json").read_text(encoding="utf-8")
    )
    store_count = len(mappings["stores"])
    product_count = len(mappings["products"])

    smoke_features = pd.DataFrame(
        {
            "store_code": pd.Categorical([0], categories=list(range(store_count))),
            "product_code": pd.Categorical([0], categories=list(range(product_count))),
            "lag_1": np.array([0], dtype=np.float32),
            "lag_7": np.array([0], dtype=np.float32),
            "lag_14": np.array([0], dtype=np.float32),
            "lag_28": np.array([0], dtype=np.float32),
            "rolling_7": np.array([0], dtype=np.float32),
            "rolling_28": np.array([0], dtype=np.float32),
            "day_sin": np.array([0], dtype=np.float32),
            "day_cos": np.array([1], dtype=np.float32),
            "month_sin": np.array([0], dtype=np.float32),
            "month_cos": np.array([1], dtype=np.float32),
        }
    )[expected_features]
    smoke_prediction = float(np.clip(booster.inplace_predict(smoke_features)[0], 0, None))

    daily_path = version_dir / "forecast_28_days.csv"
    summary_path = version_dir / "forecast_summary.csv"
    daily = pd.read_csv(daily_path, parse_dates=["date"])
    summary = pd.read_csv(summary_path)

    required_daily = {
        "store_id",
        "product_id",
        "date",
        "forecast_sales",
        "model",
    }
    missing_daily = sorted(required_daily - set(daily.columns))
    if missing_daily:
        raise ValueError(f"Forecast file is missing columns: {missing_daily}")
    if daily["forecast_sales"].isna().any():
        raise ValueError("Forecast file contains missing predictions.")
    if (daily["forecast_sales"] < 0).any():
        raise ValueError("Forecast file contains negative predictions.")

    horizon = int(manifest["forecast_horizon_days"])
    expected_series = int(manifest["forecastable_series"])
    series_counts = daily.groupby(["store_id", "product_id"]).size()
    if len(series_counts) != expected_series:
        raise ValueError(
            f"Expected {expected_series} forecast series, found {len(series_counts)}."
        )
    if not series_counts.eq(horizon).all():
        raise ValueError("One or more series does not contain the full forecast horizon.")

    expected_start = pd.Timestamp(manifest["forecast_start_date"])
    expected_end = expected_start + timedelta(days=horizon - 1)
    if daily["date"].min() != expected_start or daily["date"].max() != expected_end:
        raise ValueError(
            f"Forecast date range is {daily['date'].min()} to {daily['date'].max()}, "
            f"expected {expected_start} to {expected_end}."
        )
    if len(summary) != expected_series:
        raise ValueError(
            f"Expected {expected_series} summary rows, found {len(summary)}."
        )

    top = summary.nlargest(5, "forecast_28_day_total")[
        ["store_id", "product_id", "forecast_28_day_total"]
    ]

    print("StockGuard production model verification PASSED")
    print(f"Version: {manifest['model_version']}")
    print(f"XGBoost: {xgb.__version__}")
    print(f"SHA-256: {actual_hash}")
    print(f"Features: {len(expected_features)}")
    print(f"Forecast series: {len(series_counts):,}")
    print(f"Daily forecast rows: {len(daily):,}")
    print(f"Forecast dates: {expected_start.date()} to {expected_end.date()}")
    print(f"CPU inference smoke prediction: {smoke_prediction:.4f}")
    print("\nHighest 28-day forecasts:")
    print(top.to_string(index=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise
