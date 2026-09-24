# StockGuard AI FYP presentation flow

## Five-minute live demo

1. Open the production website and sign in to the dedicated StockGuard demo workspace.
2. Show **Dashboard** totals, inventory mix, latest forecast and recommended order quantity.
3. Open **Products** and demonstrate search, low-stock state, edit and replenishment action.
4. Open **CSV Upload** and show the validated demo file format and upload history.
5. Open **AI Forecast**, select a product, choose **30D**, and run the live comparison.
6. Explain that Linear Regression, ARIMA, Random Forest and XGBoost/seasonal candidate use the same holdout; lowest MAE then RMSE wins.
7. Show forecast revenue, lead-time demand, safety stock, target stock and recommended order quantity.
8. Open **Reports** and download the saved sales, inventory and forecast reports.
9. Open **Insights** and approve or dismiss a replenishment recommendation.
10. Show **Admin**, **Profile**, **Notifications** and **Settings** to demonstrate MongoDB persistence, RBAC and audit logging.

## Demo recovery

- If a live forecast takes a few seconds, explain that all three Python models are being trained and evaluated on demand.
- If the internet becomes unavailable, use the already saved dashboard, forecast and report screenshots in the project documentation.
- Keep `demo/stockguard-demo-sales.csv` available locally if the examiner asks to see a fresh CSV import.
- Do not remove the demo import immediately before presenting because doing so also clears saved forecasts and open recommendations.

## Verification

Run `npm.cmd --prefix server run check`, `npm.cmd --prefix frontend run build`,
and `npm.cmd --prefix mobile run check` before the presentation. Production health
is available at `https://stockguard-ai-ten.vercel.app/api/health`.
