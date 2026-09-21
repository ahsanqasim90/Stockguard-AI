# StockGuard AI Node API

This is the MERN application backend. It owns authentication and business data in
MongoDB and runs the verified production XGBoost model directly in Node.js. Series
whose store or product identifiers are outside the trained mappings use a seasonal
naive fallback automatically.

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
- `GET /api/auth/invitations/:token` validates a pending team invitation.
- `POST /api/auth/invitations/:token/accept` sets the invited user's password and activates the account.

## Administration API

The Admin dashboard is backed by MongoDB rather than browser seed data. Owners and
authorized administrators can create seven-day invitation links, renew or revoke
pending invitations, edit names and roles, assign custom permissions, and suspend
or reactivate accounts. Suspension increments the token version, immediately
invalidating that user's existing web and mobile sessions.

- `GET /api/admin/users` lists workspace users and upload counts.
- `POST /api/admin/invitations` creates a pending user and single-use invitation.
- `POST /api/admin/invitations/:userId/resend` rotates an invitation link.
- `DELETE /api/admin/invitations/:userId` revokes a pending invitation.
- `PATCH /api/admin/users/:id` edits role, status, name, or permission overrides.
- `GET /api/admin/roles` returns the enforceable role/permission matrix.
- `GET /api/admin/audit` returns the tenant's one-year audit trail.
- `GET /api/admin/activity` returns user, data, security, MongoDB and ML service activity.

## Notifications API

Upload completion, forecast readiness, low stock, and critical inventory events are
stored per user in MongoDB. Each user's preferences control event creation and
email/mobile delivery. Low stock is below the reorder point; critical inventory is
zero stock or below 60% of the reorder point. Notification records are retained for
180 days and record email and Expo push delivery status.

- `GET /api/notifications` returns the signed-in user's inbox and unread count.
- `PATCH /api/notifications/:id/read` marks one alert read.
- `POST /api/notifications/read-all` marks the inbox read.
- `POST /api/notifications/devices` registers an Expo push token.
- `DELETE /api/notifications/devices` disables a device token.

In-app notifications work without another provider. To deliver email, configure
`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `EMAIL_FROM`.
Mobile push uses Expo Push Service; the mobile app registers its EAS project token.
`EXPO_ACCESS_TOKEN` is only required when push access security is enabled in Expo.

Permission checks are enforced on product, import, forecast, report, analytics,
settings, audit and administration routes. Invitation tokens are stored only as
SHA-256 hashes. The raw token appears once in the generated link for the
administrator to share through an approved channel.

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
them into smaller CSV batches. Store IDs and SKUs that match the production
`S####` and `P####` mappings can use live XGBoost inference.

## Business forecasting API

`GET /api/forecasts/series` lists uploaded store/SKU sales series in the signed-in
business. `POST /api/forecasts/run` takes JSON such as
`{"storeId":"<MongoDB store ID>","productId":"<MongoDB product ID>","horizon":30}`.
Valid horizons are 7, 14, 28, and 30 days. The API requires at least
`max(28, horizon + 14)` consecutive daily sales records ending at the latest
actual date. Missing days are rejected rather than silently treated as zero;
upload explicit zero-sales rows. Forecast dates start on the day after the last
actual record, even when that record is historical.

The signed Python service backtests Linear Regression, ARIMA and Random Forest.
The Node API adds global XGBoost v1.0.0 for mapped store/product IDs or the
previous-week seasonal baseline for custom IDs. Every candidate uses the same
final `horizon` days as a recursive holdout. The API compares MAE and RMSE and
automatically saves the lowest-MAE forecast (RMSE breaks ties), its daily values,
the selection reason and all comparison metrics to MongoDB. A measured comparison
requires `horizon + 14` consecutive rows. `GET /api/forecasts/latest` restores the
latest run. Importing a new CSV invalidates that business's saved forecasts so
users rerun them on updated history.

Each saved run also estimates daily and total forecast revenue from the historical
average revenue per sold unit, falling back to the product price when revenue history
is unavailable. Stock decision support combines forecast demand, available inventory,
supplier lead time and the business safety-stock policy to calculate a reorder point,
target stock and recommended order quantity. `GET /api/recommendations` lists these
tenant-isolated actions; authorized users can update their workflow status with
`PATCH /api/recommendations/:id`.

The model bundle is checksum-verified during API startup. Run `npm run check:model`
inside `server` to compare the JavaScript scorer against official XGBoost 3.2
predictions and verify recursive feature engineering.
