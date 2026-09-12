import argparse
import hashlib
import json
import sys
import zipfile
from pathlib import Path

import pandas as pd


REQUIRED_COLUMNS = [
    "product_id",
    "store_id",
    "date",
    "sales",
    "revenue",
    "stock",
    "price",
    "promo_type_1",
    "promo_bin_1",
    "promo_type_2",
    "promo_bin_2",
    "promo_discount_2",
    "promo_discount_type_2",
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


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description="Prepare the StockGuard AI pilot dataset.")
    parser.add_argument("--config", default="configs/pilot.json")
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--chunk-size", type=int, default=500_000)
    arguments = parser.parse_args()

    config, root = load_config(arguments.config)
    zip_path = root / config["dataset_zip"]
    output_path = root / config["processed_csv"]
    metadata_path = root / config["metadata_json"]

    if not zip_path.exists():
        raise FileNotFoundError(f"Dataset ZIP not found: {zip_path}")
    if output_path.exists() and not arguments.overwrite:
        print(f"Prepared data already exists: {output_path}")
        print("Use --overwrite to rebuild it.")
        return 0

    selected_products = set(config["product_ids"])
    selected_store = config["store_id"]
    chunks = []
    scanned_rows = 0

    with zipfile.ZipFile(zip_path) as archive:
        if config["sales_member"] not in archive.namelist():
            raise KeyError(f"ZIP member not found: {config['sales_member']}")
        source = archive.open(config["sales_member"])
        for index, chunk in enumerate(
            pd.read_csv(source, chunksize=arguments.chunk_size, low_memory=False), start=1
        ):
            scanned_rows += len(chunk)
            missing_columns = sorted(set(REQUIRED_COLUMNS) - set(chunk.columns))
            if missing_columns:
                raise ValueError(f"Missing required columns: {missing_columns}")
            keep = (chunk["store_id"] == selected_store) & chunk["product_id"].isin(selected_products)
            if keep.any():
                chunks.append(chunk.loc[keep, REQUIRED_COLUMNS].copy())
            if index % 10 == 0:
                print(f"Scanned {scanned_rows:,} rows...", flush=True)

    if not chunks:
        raise ValueError("No rows matched the configured store and products.")

    pilot = pd.concat(chunks, ignore_index=True)
    pilot["date"] = pd.to_datetime(pilot["date"], errors="coerce")
    if pilot["date"].isna().any():
        raise ValueError("Invalid dates found in selected pilot rows.")
    duplicate_count = int(pilot.duplicated(["store_id", "product_id", "date"]).sum())
    if duplicate_count:
        raise ValueError(
            f"Found {duplicate_count} duplicate store/product/date rows. "
            "Resolve their business meaning before aggregating them."
        )

    for column in ["sales", "revenue", "stock", "price", "promo_discount_2"]:
        pilot[column] = pd.to_numeric(pilot[column], errors="coerce")
    pilot["sales_missing"] = pilot["sales"].isna().astype("int8")
    pilot["promo_active"] = (
        pilot[["promo_bin_1", "promo_bin_2", "promo_discount_2"]].notna().any(axis=1)
    ).astype("int8")
    pilot = pilot.sort_values(["product_id", "date"]).reset_index(drop=True)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    pilot.to_csv(output_path, index=False, date_format="%Y-%m-%d")

    metadata = {
        "dataset_zip": str(zip_path),
        "dataset_sha256": file_sha256(zip_path),
        "source_rows_scanned": scanned_rows,
        "pilot_rows": len(pilot),
        "store_id": selected_store,
        "configured_products": config["product_ids"],
        "products_found": sorted(pilot["product_id"].unique().tolist()),
        "date_min": pilot["date"].min().date().isoformat(),
        "date_max": pilot["date"].max().date().isoformat(),
        "missing_by_column": {
            column: int(value) for column, value in pilot.isna().sum().items()
        },
        "duplicate_store_product_dates": duplicate_count,
    }
    with metadata_path.open("w", encoding="utf-8") as handle:
        json.dump(metadata, handle, indent=2)

    print(f"Prepared {len(pilot):,} pilot rows for {pilot['product_id'].nunique()} products.")
    print(f"Output: {output_path}")
    print(f"Metadata: {metadata_path}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise
