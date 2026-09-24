# StockGuard AI 15-minute user guide

This guide takes a new business user from sign-in to an inventory decision using
the web dashboard or mobile app. Both clients use the same protected MongoDB
workspace and API.

## Minute 0-2: sign in and check the dashboard

1. Sign in with your StockGuard email and password.
2. Confirm the workspace name shown in the header.
3. Review inventory units, low-stock count and the most recent forecast.

If the session has expired, sign in again. If the API is temporarily unavailable,
use **Retry connection**; a previous saved forecast remains available after the
service recovers.

## Minute 2-5: prepare products

Open **Products** and create or update every SKU that you intend to forecast.
Record its current stock, reorder point, selling price, supplier and supplier lead
time. These values drive the replenishment calculation.

## Minute 5-8: upload daily sales

Open **CSV Upload**. A file can be up to 10 MB and contain up to 10,000 rows. It
must contain these columns:

```text
date,product_name,sku,quantity_sold,revenue,category
```

`store_id` is optional; omitted rows are assigned to Main store. Use one row per
date, SKU and store. Include zero-sales days so dates remain continuous. A 30-day
Python comparison needs at least 44 consecutive dates for a series.

## Minute 8-11: run a forecast

1. Open **AI Forecast** and choose a store/product series.
2. Select **30D** or another allowed horizon.
3. Select **Run live comparison**.

StockGuard shows an estimate immediately and compares Linear Regression, ARIMA,
Random Forest and the available production candidate on the same holdout. It
saves the model with the lowest MAE, using RMSE as the tie-breaker. The result
contains every daily prediction, forecast revenue and a replenishment plan.

## Minute 11-13: make an inventory decision

Review lead-time demand, historical variability, safety stock, target stock and
recommended order quantity. Open **Insights** or **Replenishment** to approve,
dismiss or complete an open recommendation. High-risk recommendations also create
an operational notification.

## Minute 13-15: report and configure

- Use **Reports** to generate sales, inventory, forecast or replenishment exports.
- Use **Notifications** to review upload, forecast and inventory alerts.
- Use **Settings** to select the default forecast horizon and notification channels.
- Workspace owners and administrators can invite users, assign roles, customize
  permissions, inspect the audit log and review service health under **Admin**.

## Common problems and solutions

| Message or symptom | What to do |
| --- | --- |
| No sales series available | Upload a valid CSV for the required product and store. |
| Not enough observations | Supply at least 44 consecutive dates for a 30-day Python comparison; include zero-sales dates. |
| CSV rejected | Check the six required headers, date format, numeric values, duplicate date/SKU/store rows, 10 MB size and 10,000-row limit. |
| Permission denied | Ask a workspace owner or admin to grant the relevant role or permission. |
| Forecast service unavailable | Retry the run. The previous saved forecast remains unchanged until a new run succeeds. |
| Session expired | Sign in again; the application refreshes normal sessions automatically. |

Never share passwords, reset links, invitation links or API credentials in reports
or screenshots. Each business is isolated by its workspace identifier, and every
administrative or forecast action is recorded in the audit trail.
