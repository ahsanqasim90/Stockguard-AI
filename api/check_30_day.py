"""Deterministic smoke check for every proposal model at the 30-day horizon."""

from datetime import date, timedelta
from math import isfinite

try:
    from api.main import ComparisonRequest, compare_models
except ModuleNotFoundError:  # Support direct execution with `python api/check_30_day.py`.
    from main import ComparisonRequest, compare_models


start = date(2025, 1, 1)
dates = [start + timedelta(days=index) for index in range(80)]
values = [float(12 + (index % 7) * 2 + index * 0.05) for index in range(80)]
result = compare_models(ComparisonRequest(dates=dates, values=values, horizon=30))
comparisons = result["comparisons"]

assert len(comparisons) == 3
assert {item["model"] for item in comparisons} == {"linear_regression", "arima", "random_forest"}
for item in comparisons:
    assert item["status"] == "ready", item
    assert item["backtest"]["observations"] == 30
    assert isfinite(item["backtest"]["mae"])
    assert isfinite(item["backtest"]["rmse"])
    assert len(item["predictions"]) == 30
    assert item["predictions"][0]["date"] == (dates[-1] + timedelta(days=1)).isoformat()
    assert item["predictions"][-1]["date"] == (dates[-1] + timedelta(days=30)).isoformat()

print("StockGuard Python 30-day comparison PASSED")
for item in comparisons:
    print(f"{item['model']}: MAE={item['backtest']['mae']:.4f} RMSE={item['backtest']['rmse']:.4f} predictions={len(item['predictions'])}")
