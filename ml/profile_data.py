import argparse
import json
import zipfile
from pathlib import Path

import pandas as pd

from prepare_data import load_config


def main():
    parser = argparse.ArgumentParser(description="Profile all StockGuard store-product series.")
    parser.add_argument("--config", default="configs/pilot.json")
    parser.add_argument("--chunk-size", type=int, default=500_000)
    parser.add_argument("--minimum-observations", type=int, default=180)
    parser.add_argument("--minimum-positive-days", type=int, default=30)
    parser.add_argument("--maximum-inactive-days", type=int, default=90)
    args = parser.parse_args()

    config, root = load_config(args.config)
    zip_path = root / config["dataset_zip"]
    output_dir = root / "data" / "processed"
    output_dir.mkdir(parents=True, exist_ok=True)
    csv_path = output_dir / "series_profile.csv"
    summary_path = output_dir / "series_profile_summary.json"

    partials = []
    scanned = 0
    columns = ["store_id", "product_id", "date", "sales"]
    with zipfile.ZipFile(zip_path) as archive:
        with archive.open(config["sales_member"]) as source:
            reader = pd.read_csv(
                source,
                usecols=columns,
                chunksize=args.chunk_size,
                low_memory=False,
            )
            for chunk_number, chunk in enumerate(reader, start=1):
                scanned += len(chunk)
                chunk["date"] = pd.to_datetime(chunk["date"], errors="coerce")
                chunk["sales"] = pd.to_numeric(chunk["sales"], errors="coerce")
                if chunk["date"].isna().any():
                    raise ValueError(f"Invalid dates found in chunk {chunk_number}.")

                chunk["observed"] = chunk["sales"].notna().astype("int32")
                chunk["positive"] = chunk["sales"].gt(0).astype("int32")
                chunk["zero"] = chunk["sales"].eq(0).astype("int32")
                chunk["observed_date"] = chunk["date"].where(chunk["sales"].notna())
                chunk["positive_date"] = chunk["date"].where(chunk["sales"].gt(0))

                partial = (
                    chunk.groupby(["store_id", "product_id"], observed=True)
                    .agg(
                        rows=("date", "size"),
                        first_date=("date", "min"),
                        last_date=("date", "max"),
                        observed_sales_days=("observed", "sum"),
                        positive_sales_days=("positive", "sum"),
                        zero_sales_days=("zero", "sum"),
                        total_sales=("sales", "sum"),
                        last_actual_date=("observed_date", "max"),
                        last_positive_date=("positive_date", "max"),
                    )
                    .reset_index()
                )
                partials.append(partial)
                if chunk_number % 5 == 0:
                    print(f"Scanned {scanned:,} rows...", flush=True)

    profile = (
        pd.concat(partials, ignore_index=True)
        .groupby(["store_id", "product_id"], observed=True, as_index=False)
        .agg(
            rows=("rows", "sum"),
            first_date=("first_date", "min"),
            last_date=("last_date", "max"),
            observed_sales_days=("observed_sales_days", "sum"),
            positive_sales_days=("positive_sales_days", "sum"),
            zero_sales_days=("zero_sales_days", "sum"),
            total_sales=("total_sales", "sum"),
            last_actual_date=("last_actual_date", "max"),
            last_positive_date=("last_positive_date", "max"),
        )
    )

    latest_actual = profile["last_actual_date"].max()
    profile["history_span_days"] = (
        profile["last_actual_date"] - profile["first_date"]
    ).dt.days + 1
    profile["days_since_last_actual"] = (
        latest_actual - profile["last_actual_date"]
    ).dt.days
    profile["missing_sales_rate"] = (
        1 - profile["observed_sales_days"] / profile["rows"]
    ).round(6)
    profile["eligible"] = (
        profile["observed_sales_days"].ge(args.minimum_observations)
        & profile["history_span_days"].ge(args.minimum_observations)
        & profile["positive_sales_days"].ge(args.minimum_positive_days)
        & profile["days_since_last_actual"].le(args.maximum_inactive_days)
    )

    reasons = []
    for row in profile.itertuples(index=False):
        failed = []
        if row.observed_sales_days < args.minimum_observations:
            failed.append("insufficient_observations")
        if row.history_span_days < args.minimum_observations:
            failed.append("short_history")
        if row.positive_sales_days < args.minimum_positive_days:
            failed.append("too_few_positive_days")
        if row.days_since_last_actual > args.maximum_inactive_days:
            failed.append("inactive")
        reasons.append("eligible" if not failed else "|".join(failed))
    profile["eligibility_reason"] = reasons

    profile = profile.sort_values(
        ["eligible", "store_id", "product_id"],
        ascending=[False, True, True],
    )
    date_columns = ["first_date", "last_date", "last_actual_date", "last_positive_date"]
    profile.to_csv(csv_path, index=False, date_format="%Y-%m-%d")

    eligible = profile.loc[profile["eligible"]]
    summary = {
        "source_rows_scanned": int(scanned),
        "latest_actual_date": latest_actual.date().isoformat(),
        "total_series": int(len(profile)),
        "eligible_series": int(len(eligible)),
        "excluded_series": int((~profile["eligible"]).sum()),
        "stores": int(profile["store_id"].nunique()),
        "products": int(profile["product_id"].nunique()),
        "eligible_stores": int(eligible["store_id"].nunique()),
        "eligible_products": int(eligible["product_id"].nunique()),
        "thresholds": {
            "minimum_observations": args.minimum_observations,
            "minimum_positive_days": args.minimum_positive_days,
            "maximum_inactive_days": args.maximum_inactive_days,
        },
        "exclusion_reason_counts": {
            str(key): int(value)
            for key, value in profile.loc[~profile["eligible"], "eligibility_reason"]
            .value_counts()
            .items()
        },
    }
    with summary_path.open("w", encoding="utf-8") as handle:
        json.dump(summary, handle, indent=2)

    print(json.dumps(summary, indent=2))
    print(f"Series profile: {csv_path}")
    print(f"Summary: {summary_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
