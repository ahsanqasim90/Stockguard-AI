import argparse
import json
import logging
from datetime import datetime, timezone

import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LinearRegression

from train import (
    FEATURE_COLUMNS,
    calculate_metrics,
    clean_daily_series,
    configure_logging,
    load_config,
    prediction_frame,
    supervised_rows,
)

ALLOWED_MODELS = {"seasonal_naive", "linear_regression", "random_forest", "arima"}


def build_registry(metrics, folds, horizon):
    products = {}
    product_metrics = metrics.loc[metrics["scope"] != "OVERALL"]
    for product_id, group in product_metrics.groupby("scope"):
        ranked = group.sort_values(["mae", "rmse", "model"]).reset_index(drop=True)
        winner = ranked.iloc[0]
        products[str(product_id)] = {
            "selected_model": str(winner["model"]),
            "mae": round(float(winner["mae"]), 6),
            "rmse": round(float(winner["rmse"]), 6),
            "observations": int(winner["observations"]),
            "candidates": [
                {
                    "model": str(row["model"]),
                    "mae": round(float(row["mae"]), 6),
                    "rmse": round(float(row["rmse"]), 6),
                    "observations": int(row["observations"]),
                }
                for _, row in ranked.iterrows()
            ],
        }

    overall = (
        metrics.loc[metrics["scope"] == "OVERALL"]
        .sort_values(["mae", "rmse", "model"])
        .reset_index(drop=True)
    )
    return {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "selection_metric": "mae",
        "backtest_folds": folds,
        "forecast_horizon_days": horizon,
        "overall_ranking": [
            {
                "model": str(row["model"]),
                "mae": round(float(row["mae"]), 6),
                "rmse": round(float(row["rmse"]), 6),
                "observations": int(row["observations"]),
            }
            for _, row in overall.iterrows()
        ],
        "products": products,
    }


def main():
    parser = argparse.ArgumentParser(description="Rolling backtest for StockGuard AI.")
    parser.add_argument("--config", default="configs/pilot.json")
    parser.add_argument(
        "--models",
        default="seasonal_naive,linear_regression,random_forest,arima",
    )
    parser.add_argument("--folds", type=int)
    parser.add_argument("--quick", action="store_true")
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()

    config, root = load_config(args.config)
    models = [name.strip() for name in args.models.split(",") if name.strip()]
    unknown = sorted(set(models) - ALLOWED_MODELS)
    if unknown:
        raise ValueError(f"Unknown models: {unknown}")

    folds = args.folds or int(config.get("backtest_folds", 3))
    if folds < 2:
        raise ValueError("Backtesting requires at least two folds.")

    run_name = "backtest_smoke" if args.quick else "backtest"
    output_dir = root / "artifacts" / run_name
    output_dir.mkdir(parents=True, exist_ok=True)
    logger = configure_logging(output_dir)

    data_path = root / config["processed_csv"]
    if not data_path.exists():
        raise FileNotFoundError(f"Prepared data not found: {data_path}")

    data = pd.read_csv(data_path, parse_dates=["date"], low_memory=False)
    product_ids = config["product_ids"][:3] if args.quick else config["product_ids"]
    data = data.loc[data["product_id"].isin(product_ids)].copy()
    series = {
        product_id: clean_daily_series(group)
        for product_id, group in data.groupby("product_id", observed=True)
    }
    missing = sorted(set(product_ids) - set(series))
    if missing:
        raise ValueError(f"Configured products missing from prepared data: {missing}")

    horizon = int(config["forecast_horizon_days"])
    latest_actual = min(
        frame.loc[frame["actual_sales"].notna(), "date"].max()
        for frame in series.values()
    )
    newest_cutoff = latest_actual - pd.Timedelta(int(horizon - 1), unit="D")
    cutoffs = [
        newest_cutoff - pd.Timedelta(int(horizon * offset), unit="D")
        for offset in reversed(range(folds))
    ]
    minimum_history = int(config["minimum_history_days"])
    max_days = 365 if args.quick else int(config["maximum_training_days"])
    codes = {
        product_id: index for index, product_id in enumerate(sorted(product_ids))
    }

    logger.info(
        "Run=%s products=%s folds=%s horizon=%s first_cutoff=%s last_cutoff=%s",
        run_name,
        len(product_ids),
        folds,
        horizon,
        cutoffs[0].date(),
        cutoffs[-1].date(),
    )

    all_predictions = []
    all_fold_metrics = []
    for fold_number, cutoff in enumerate(cutoffs, start=1):
        fold_name = f"fold_{fold_number:02d}"
        fold_dir = output_dir / fold_name
        fold_dir.mkdir(parents=True, exist_ok=True)

        for product_id, daily in series.items():
            history_days = int((daily["date"] < cutoff).sum())
            if history_days < minimum_history:
                raise ValueError(
                    f"{product_id} has only {history_days} history days in {fold_name}."
                )

        supervised = supervised_rows(series, cutoff, codes)
        supervised = (
            supervised.groupby("product_code", group_keys=False)
            .tail(max_days)
            .reset_index(drop=True)
        )
        logger.info(
            "%s cutoff=%s training_rows=%s",
            fold_name,
            cutoff.date(),
            len(supervised),
        )

        fold_predictions = []
        for model_name in models:
            path = fold_dir / f"predictions_{model_name}.csv"
            if args.resume and path.exists():
                logger.info("%s resuming %s", fold_name, model_name)
                predictions = pd.read_csv(path)
            else:
                logger.info("%s starting %s", fold_name, model_name)
                model = None
                if model_name == "linear_regression":
                    model = LinearRegression().fit(
                        supervised[FEATURE_COLUMNS], supervised["target"]
                    )
                elif model_name == "random_forest":
                    settings = dict(config["random_forest"])
                    if args.quick:
                        settings["n_estimators"] = min(
                            40, int(settings["n_estimators"])
                        )
                    model = RandomForestRegressor(
                        random_state=int(config["random_seed"]), **settings
                    ).fit(supervised[FEATURE_COLUMNS], supervised["target"])
                elif model_name == "arima":
                    model = tuple(config["arima_order"])

                predictions = prediction_frame(
                    model_name,
                    series,
                    cutoff,
                    horizon,
                    codes,
                    model=model,
                    logger=logger,
                )
                predictions.insert(0, "fold", fold_number)
                predictions.insert(1, "cutoff", cutoff.date().isoformat())
                predictions.to_csv(path, index=False)

            if "fold" not in predictions:
                predictions.insert(0, "fold", fold_number)
            if "cutoff" not in predictions:
                predictions.insert(1, "cutoff", cutoff.date().isoformat())
            fold_predictions.append(predictions)

        fold_all = pd.concat(fold_predictions, ignore_index=True)
        fold_all.to_csv(fold_dir / "predictions_all.csv", index=False)
        fold_metrics = calculate_metrics(fold_all)
        fold_metrics.insert(0, "fold", fold_number)
        fold_metrics.insert(1, "cutoff", cutoff.date().isoformat())
        fold_metrics.to_csv(fold_dir / "metrics.csv", index=False)
        all_predictions.append(fold_all)
        all_fold_metrics.append(fold_metrics)

    combined = pd.concat(all_predictions, ignore_index=True)
    combined.to_csv(output_dir / "predictions_all_folds.csv", index=False)
    pd.concat(all_fold_metrics, ignore_index=True).to_csv(
        output_dir / "metrics_by_fold.csv", index=False
    )

    aggregate = calculate_metrics(combined)
    aggregate.to_csv(output_dir / "metrics_aggregate.csv", index=False)
    registry = build_registry(aggregate, folds, horizon)
    registry_path = output_dir / "model_registry.json"
    with registry_path.open("w", encoding="utf-8") as handle:
        json.dump(registry, handle, indent=2)

    overall = aggregate.loc[aggregate["scope"] == "OVERALL"].sort_values(
        ["mae", "rmse"]
    )
    winners = pd.Series(
        [item["selected_model"] for item in registry["products"].values()]
    ).value_counts()
    logger.info("Aggregate results across all folds:\n%s", overall.to_string(index=False))
    logger.info("Per-product winners:\n%s", winners.to_string())
    logger.info("Model registry saved: %s", registry_path)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception:
        logging.exception("Backtesting failed")
        raise
