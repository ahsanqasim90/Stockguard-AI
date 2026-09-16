# StockGuard AI Node API

This is the MERN application backend. It owns authentication and business data in
MongoDB and runs a seasonal baseline for uploaded business sales. The Kaggle
XGBoost Python API remains a separate service for its historical store/product IDs.

## Run locally

```powershell
cd "D:\Stockguard Ai"
.\setup_server.ps1
Copy-Item .\server\.env.example .\server\.env
```

Edit `server/.env` and set `MONGODB_URI`. For MongoDB Atlas, use the SRV connection
string currently shown under **Connect → Drivers** for the active cluster. Use a
dedicated database user with `readWrite` on `stockguard_ai`; avoid changing a
shared database user's credentials when other apps use the same Atlas project.
Keep the URI in environment variables rather than Git. Then run:

```powershell
.\run_server.ps1
```

Open <http://127.0.0.1:5000/api/health>. A successful Atlas connection reports
`mongodb.state` as `connected`.

## Authentication API

The frontend now uses MongoDB-backed authentication. Passwords are hashed with
bcrypt, access tokens expire quickly, and refresh tokens are stored in an
HTTP-only cookie.

- `POST /api/auth/register` creates the first business owner and workspace.
- `POST /api/auth/login` verifies email and password.
- `POST /api/auth/refresh` renews an authenticated session.
- `GET /api/auth/me` returns the current user and requires a bearer token.
- `POST /api/auth/logout` invalidates the refresh session.

After the database is connected, open <http://127.0.0.1:5173/login>, choose
**Create account**, and register the first owner. Google/Microsoft sign-in is
intentionally deferred until the core application flow is complete.

## Initial collections

- businesses and users
- stores and products
- sales and inventory
- forecasts and recommendations
- import batches

Every operational collection includes a `business` tenant key so data is isolated
for each customer.

## Products and sales CSV

Authenticated business users can list products with `GET /api/products`; owners,
admins and analysts can add with `POST`, edit with `PATCH /api/products/:id`, or
soft-delete with `DELETE /api/products/:id`. Stock and reorder points are kept in
the Main store inventory record. Each request is restricted to the current
business, and SKU must be unique within that business.

`POST /api/imports/sales` accepts a multipart `.csv` file in the `file` field.
Required columns are `date,product_name,sku,quantity_sold,revenue,category`;
`store_id` is optional and defaults to `DEFAULT`. Dates use `YYYY-MM-DD`,
quantities and revenue must be nonnegative, and each date/SKU/store key must be
unique within the file. The import validates the whole CSV before writing, then
upserts products and daily sales so re-importing the same rows does not duplicate
sales. Upload history is available from `GET /api/imports`. The current endpoint
accepts up to 2 MB and 10,000 sales rows per file. For larger histories, split
them into smaller CSV batches. Imported business SKUs do not automatically map
to the historical Kaggle model's product IDs.

## Business forecasting API

`GET /api/forecasts/series` lists uploaded store/SKU sales series in the signed-in
business. `POST /api/forecasts/run` takes JSON such as
`{"storeId":"<MongoDB store ID>","productId":"<MongoDB product ID>","horizon":28}`.
Valid horizons are 7, 14, and 28 days. The API requires at least
`max(28, horizon + 7)` consecutive daily sales records ending at the latest
actual date. Missing days are rejected rather than silently treated as zero;
upload explicit zero-sales rows. Forecast dates start on the day after the last
actual record, even when that record is historical.

The current business model repeats the quantity from the same weekday in the
previous week. It also holds out the final `horizon` actual days and returns MAE
and RMSE for that series. Successful runs save daily predictions and backtest
metadata to MongoDB; `GET /api/forecasts/latest` restores the latest run for the
dashboard. This baseline runs in the Node API on Vercel and does not trigger
training on a user's computer. Kaggle XGBoost metrics shown in the UI are for
the historical Kaggle dataset, not an accuracy claim for uploaded business SKUs.
Importing a new CSV invalidates that business's saved forecasts so users rerun
them on the updated sales history.
