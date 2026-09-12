import csv
import json
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PRODUCTION = ROOT / "artifacts" / "production"
CURRENT = json.loads((PRODUCTION / "current.json").read_text(encoding="utf-8-sig"))
VERSION_DIR = PRODUCTION / CURRENT["directory"]
OUTPUT = ROOT / "frontend" / "public" / "data"
FORECAST_OUTPUT = OUTPUT / "forecasts"


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, separators=(",", ":"), ensure_ascii=True),
        encoding="utf-8",
    )


manifest = json.loads(
    (VERSION_DIR / "training_manifest.json").read_text(encoding="utf-8")
)
stores: dict[str, dict[str, dict]] = defaultdict(dict)

with (VERSION_DIR / "forecast_28_days.csv").open(
    encoding="utf-8-sig", newline=""
) as source:
    for row in csv.DictReader(source):
        store_id = row["store_id"]
        product_id = row["product_id"]
        product = stores[store_id].setdefault(
            product_id,
            {"model": row["model"], "forecast_total": 0.0, "predictions": []},
        )
        value = round(float(row["forecast_sales"]), 4)
        product["forecast_total"] += value
        product["predictions"].append([row["date"], value])

totals = []
store_index = []
for store_id in sorted(stores):
    products = stores[store_id]
    store_index.append({"store_id": store_id, "product_count": len(products)})
    for product_id, product in products.items():
        product["forecast_total"] = round(product["forecast_total"], 2)
        totals.append(
            {
                "store_id": store_id,
                "product_id": product_id,
                "forecast_28_day_total": product["forecast_total"],
            }
        )
    write_json(
        FORECAST_OUTPUT / f"{store_id}.json",
        {"store_id": store_id, "products": products},
    )

totals.sort(key=lambda item: item["forecast_28_day_total"], reverse=True)
write_json(
    OUTPUT / "health.json",
    {
        "status": "ok",
        "model_version": manifest["model_version"],
        "model_type": manifest["model_type"],
    },
)
write_json(OUTPUT / "model.json", manifest)
write_json(OUTPUT / "stores.json", {"stores": store_index})
write_json(OUTPUT / "top-forecasts.json", {"items": totals[:5]})

print(
    f"Exported {len(stores):,} stores, {len(totals):,} series, "
    f"and {sum(len(item['predictions']) for products in stores.values() for item in products.values()):,} daily rows."
)
