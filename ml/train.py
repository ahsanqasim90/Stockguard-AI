import argparse
import json
import logging
import math
import sys
import warnings
from datetime import datetime
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LinearRegression
from statsmodels.tsa.arima.model import ARIMA


FEATURE_COLUMNS = [
    "product_code",
    "lag_1",
    "lag_7",
    "lag_14",
    "lag_28",
    "rolling_7",
    "rolling_28",
    "day_sin",
    "day_cos",
    "month_sin",
    "month_cos",
]


def project_root() -> Path:
    return Path(__file__).resolve().parents[1]


def load_config(path: str) -> tuple[dict, Path]:
    root = project_root()
    config_path = Path(path)
    if not config_path.is_absolute():
        config_path = root / config_path
    with config_path.open("r", encoding="utf-8") as handle:
        return json.load(handle), root


def configure_logging(output_dir: Path) -> logging.Logger:
    output_dir.mkdir(parents=True, exist_ok=True)
    log_path = output_dir / f"training_{datetime.now():%Y%m%d_%H%M%S}.log"
    logger = logging.getLogger("stockguard-training")
    logger.setLevel(logging.INFO)
    logger.handlers.clear()
    formatter = logging.Formatter("%(asctime)s | %(levelname)s | %(message)s")
    file_handler = logging.FileHandler(log_path, encoding="utf-8")
    stream_handler = logging.StreamHandler(sys.stdout)
    file_handler.setFormatter(formatter)
    stream_handler.setFormatter(formatter)
    logger.addHandler(file_handler)
    logger.addHandler(stream_handler)
    logger.info("Log file: %s", log_path)
    return logger


def clean_daily_series(group: pd.DataFrame) -> pd.DataFrame:
    group = group.sort_values("date").set_index("date")
    full_index = pd.date_range(group.index.min(), group.index.max(), freq="D")
    daily = group.reindex(full_index)
    daily.index.name = "date"
    daily["actual_sales"] = daily["sales"]
    clean = daily["sales"].astype(float)
    clean = clean.interpolate(limit=3, limit_direction="both")
    clean = clean.fillna(clean.shift(7))
    clean = clean.fillna(clean.rolling(28, min_periods=1).median())
    daily["sales_clean"] = clean.fillna(0).clip(lower=0)
    return daily.reset_index()


def calendar_features(date: pd.Timestamp) -> dict:
    return {
        "day_sin": math.sin(2 * math.pi * date.dayofweek / 7),
        "day_cos": math.cos(2 * math.pi * date.dayofweek / 7),
        "month_sin": math.sin(2 * math.pi * date.month / 12),
        "month_cos": math.cos(2 * math.pi * date.month / 12),
    }


def one_feature_row(history: list[float], date: pd.Timestamp, product_code: int) -> dict:
    values = np.asarray(history, dtype=float)
    row = {
        "product_code": product_code,
        "lag_1": values[-1],
        "lag_7": values[-7],
        "lag_14": values[-14],
        "lag_28": values[-28],
        "rolling_7": values[-7:].mean(),
        "rolling_28": values[-28:].mean(),
    }
    row.update(calendar_features(date))
    return row


def supervised_rows(series_by_product: dict, cutoff: pd.Timestamp, codes: dict) -> pd.DataFrame:
    records = []
    for product_id, daily in series_by_product.items():
        training = daily.loc[daily["date"] < cutoff].copy()
        sales = training["sales_clean"].to_numpy(dtype=float)
        dates = training["date"].tolist()
        for index in range(28, len(training)):
            row = one_feature_row(sales[:index].tolist(), dates[index], codes[product_id])
            row["target"] = sales[index]
            records.append(row)
    return pd.DataFrame.from_records(records)


def recursive_forecast(model, history: list[float], dates, product_code: int) -> np.ndarray:
    values = list(map(float, history))
    predictions = []
    for date in dates:
        row = pd.DataFrame([one_feature_row(values, date, product_code)])[FEATURE_COLUMNS]
        prediction = max(0.0, float(model.predict(row)[0]))
        predictions.append(prediction)
        values.append(prediction)
    return np.asarray(predictions)


def prediction_frame(model_name, series_by_product, cutoff, horizon, codes, model=None, logger=None):
    rows = []
    for product_id, daily in series_by_product.items():
        train = daily.loc[daily["date"] < cutoff].copy()
        test = daily.loc[(daily["date"] >= cutoff)].head(horizon).copy()
        if len(test) != horizon:
            raise ValueError(f"{product_id} has only {len(test)} test days; expected {horizon}.")
        history = train["sales_clean"].tail(730).tolist()
        if model_name == "seasonal_naive":
            last_week = np.asarray(history[-7:], dtype=float)
            predicted = np.resize(last_week, horizon)
        elif model_name in {"linear_regression", "random_forest"}:
            predicted = recursive_forecast(model, history, test["date"].tolist(), codes[product_id])
        elif model_name == "arima":
            order = tuple(model)
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                result = ARIMA(history, order=order).fit()
            predicted = np.clip(np.asarray(result.forecast(horizon), dtype=float), 0, None)
        else:
            raise ValueError(f"Unknown model: {model_name}")
        if logger:
            logger.info("%s completed for %s", model_name, product_id)
        for date, actual, forecast in zip(test["date"], test["actual_sales"], predicted):
            rows.append(
                {
                    "model": model_name,
                    "product_id": product_id,
                    "date": date.date().isoformat(),
                    "actual": actual,
                    "predicted": round(float(forecast), 4),
                }
            )
    return pd.DataFrame(rows)


def calculate_metrics(predictions: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for (model, product_id), group in predictions.groupby(["model", "product_id"], dropna=False):
        valid = group.dropna(subset=["actual", "predicted"])
        if valid.empty:
            continue
        error = valid["actual"].astype(float) - valid["predicted"].astype(float)
        rows.append(
            {
                "model": model,
                "scope": product_id,
                "observations": len(valid),
                "mae": float(error.abs().mean()),
                "rmse": float(np.sqrt(np.mean(np.square(error)))),
            }
        )
    for model, group in predictions.groupby("model"):
        valid = group.dropna(subset=["actual", "predicted"])
        error = valid["actual"].astype(float) - valid["predicted"].astype(float)
        rows.append(
            {
                "model": model,
                "scope": "OVERALL",
                "observations": len(valid),
                "mae": float(error.abs().mean()),
                "rmse": float(np.sqrt(np.mean(np.square(error)))),
            }
        )
    return pd.DataFrame(rows).sort_values(["scope", "mae", "rmse"])


def main() -> int:
    parser = argparse.ArgumentParser(description="Train and compare StockGuard AI pilot models.")
    parser.add_argument("--config", default="configs/pilot.json")
    parser.add_argument(
        "--models",
        default="seasonal_naive,linear_regression,random_forest,arima",
        help="Comma-separated model names.",
    )
    parser.add_argument("--quick", action="store_true", help="Use three products and fewer trees.")
    parser.add_argument("--resume", action="store_true", help="Reuse completed prediction files.")
    arguments = parser.parse_args()

    config, root = load_config(arguments.config)
    data_path = root / config["processed_csv"]
    if not data_path.exists():
        raise FileNotFoundError(f"Prepared data not found: {data_path}. Run prepare_data.py first.")

    run_name = "smoke" if arguments.quick else "pilot"
    output_dir = root / "artifacts" / run_name
    model_dir = output_dir / "models"
    model_dir.mkdir(parents=True, exist_ok=True)
    logger = configure_logging(output_dir)

    data = pd.read_csv(data_path, parse_dates=["date"], low_memory=False)
    product_ids = config["product_ids"][:3] if arguments.quick else config["product_ids"]
    data = data.loc[data["product_id"].isin(product_ids)].copy()
    series_by_product = {
        product_id: clean_daily_series(group)
        for product_id, group in data.groupby("product_id", observed=True)
    }
    if set(product_ids) != set(series_by_product):
        missing = sorted(set(product_ids) - set(series_by_product))
        raise ValueError(f"Configured products missing from prepared data: {missing}")

    horizon = int(config["forecast_horizon_days"])
    latest_actual_date = min(
        frame.loc[frame["actual_sales"].notna(), "date"].max()
        for frame in series_by_product.values()
    )
    if pd.isna(latest_actual_date):
        raise ValueError("No observed sales values are available for evaluation.")
    cutoff = latest_actual_date - pd.Timedelta(int(horizon - 1), unit="D")
    minimum_history = int(config["minimum_history_days"])
    for product_id, daily in series_by_product.items():
        history_days = int((daily["date"] < cutoff).sum())
        if history_days < minimum_history:
            raise ValueError(f"{product_id} has only {history_days} training days.")

    codes = {product_id: index for index, product_id in enumerate(sorted(product_ids))}
    supervised = supervised_rows(series_by_product, cutoff, codes)
    max_days = 365 if arguments.quick else int(config["maximum_training_days"])
    supervised = (
        supervised.groupby("product_code", group_keys=False)
        .tail(max_days)
        .reset_index(drop=True)
    )
    logger.info(
        "Run=%s products=%s training_rows=%s cutoff=%s horizon=%s",
        run_name,
        len(product_ids),
        len(supervised),
        cutoff.date(),
        horizon,
    )

    requested_models = [name.strip() for name in arguments.models.split(",") if name.strip()]
    allowed_models = {"seasonal_naive", "linear_regression", "random_forest", "arima"}
    unknown = sorted(set(requested_models) - allowed_models)
    if unknown:
        raise ValueError(f"Unknown models: {unknown}")

    prediction_sets = []
    for model_name in requested_models:
        prediction_path = output_dir / f"predictions_{model_name}.csv"
        if arguments.resume and prediction_path.exists():
            logger.info("Resuming: loading completed %s predictions", model_name)
            prediction_sets.append(pd.read_csv(prediction_path))
            continue

        logger.info("Starting %s", model_name)
        fitted_model = None
        model_argument = None
        if model_name == "linear_regression":
            fitted_model = LinearRegression().fit(supervised[FEATURE_COLUMNS], supervised["target"])
            joblib.dump(fitted_model, model_dir / "linear_regression.joblib")
        elif model_name == "random_forest":
            settings = dict(config["random_forest"])
            if arguments.quick:
                settings["n_estimators"] = min(40, int(settings["n_estimators"]))
            fitted_model = RandomForestRegressor(
                random_state=int(config["random_seed"]), **settings
            ).fit(supervised[FEATURE_COLUMNS], supervised["target"])
            joblib.dump(fitted_model, model_dir / "random_forest.joblib")
        elif model_name == "arima":
            model_argument = tuple(config["arima_order"])

        predictions = prediction_frame(
            model_name,
            series_by_product,
            cutoff,
            horizon,
            codes,
            model=fitted_model if fitted_model is not None else model_argument,
            logger=logger,
        )
        predictions.to_csv(prediction_path, index=False)
        prediction_sets.append(predictions)
        logger.info("Saved %s", prediction_path)

    all_predictions = pd.concat(prediction_sets, ignore_index=True)
    all_predictions.to_csv(output_dir / "predictions_all.csv", index=False)
    metrics = calculate_metrics(all_predictions)
    metrics.to_csv(output_dir / "metrics.csv", index=False)
    overall = (
        metrics.loc[metrics["scope"] == "OVERALL"]
        .dropna(subset=["mae", "rmse"])
        .sort_values(["mae", "rmse"])
    )
    if overall.empty or int(overall["observations"].max()) == 0:
        raise ValueError("Evaluation produced no labelled observations; no best model was selected.")
    best = overall.iloc[0].to_dict()
    with (output_dir / "best_model.json").open("w", encoding="utf-8") as handle:
        json.dump(best, handle, indent=2)

    logger.info("Overall results:\n%s", overall.to_string(index=False))
    logger.info("Best model by MAE: %s", best["model"])
    logger.info("Results saved in %s", output_dir)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception:
        logging.exception("Training failed")
        raise
