# StockGuard AI SRS compliance

This matrix maps the submitted StockGuard AI SRS requirements to the production
implementation. It describes application behaviour and separates it from cloud
operations that must be configured in MongoDB Atlas or Vercel.

| SRS requirement | Implementation evidence | Status |
| --- | --- | --- |
| REQ-1 registration and validation | `POST /api/auth/register`, Zod validation, isolated Business tenant | Complete |
| REQ-2 JWT login | Web HttpOnly refresh cookie, mobile SecureStore refresh token, 15-minute access token | Complete |
| REQ-3 protected business data | Password hashing, HTTPS production deployment, tenant filters on business data | Complete |
| REQ-4 10 MB CSV and 10,000 rows | Multer 10 MB limit, strict CSV parser, row/header/date/number/duplicate validation | Complete |
| REQ-5 product demand forecast | Product/store series forecasting through Node and Python ML services | Complete |
| REQ-6 Linear Regression, ARIMA, Random Forest | Python service executes all three candidates for each forecast | Complete |
| REQ-7 MAE/RMSE and automatic choice | Same holdout comparison; lowest MAE, then RMSE, is saved | Complete |
| REQ-8 authorized forecast access | JWT and `forecasts.read`/`forecasts.run` permissions | Complete |
| REQ-9 product management | Web/mobile/API create, update, remove, inventory sync | Complete |
| REQ-10 revenue and replenishment insight | Revenue estimate plus lead-time, variability, safety stock, target stock and order quantity | Complete |
| REQ-11 responsive analytics | MongoDB aggregation endpoints and responsive React dashboard | Complete |
| REQ-12 operational alerts | Immediate under-10-second forecast estimate plus upload, forecast, low-stock and critical inventory in-app/email/push pipeline | Complete |
| REQ-13 administration | Invitations, user edits, suspension, roles, custom permissions and service activity | Complete |
| REQ-14 audit retention | Login/administration/data/forecast events; one-year TTL exceeds 90-day requirement | Complete |
| REQ-15 role-based access | Owner/admin/manager/analyst/staff permission sets and route middleware | Complete |
| REQ-16 graceful errors | Central JSON error middleware, retry states and error boundaries | Complete |
| REQ-17 backup and recovery | AES-256-GCM daily workflow, tamper check, isolated restore verification, 1,055-document restore drill | Application complete; scheduler activation pending |
| REQ-18 privacy and secure communication | Tenant isolation, password hashing, JWT, RBAC and HTTPS on Vercel | Complete |
| NFR performance and concurrent use | Mumbai data locality, Fluid Compute, production load test with 100 authenticated virtual users, p95 832 ms and zero errors | Complete |
| NFR usability and onboarding | Web/mobile Quick Start screens, 15-minute user guide and actionable recovery instructions | Complete |
| NFR scalability and extensibility | Candidate-model pipeline, tenant-indexed MongoDB schemas and Vercel Fluid Compute concurrency | Complete |

## Additional submitted requirements

- Password recovery uses hashed, single-use 30-minute tokens. Completing a reset
  invalidates all previous web and mobile sessions. SMTP can deliver the link; a
  workspace administrator can also create and securely share it.
- Forecast horizons support 7, 14, 28 and 30 days on backend, Python models,
  XGBoost/seasonal candidates, web and mobile.
- Reports and business insights include saved revenue forecasts and replenishment
  recommendations.
- Web and mobile use the same tenant-isolated MongoDB data and Express API.
- Web and mobile profiles persist name, phone, bio and permitted workspace fields
  through `PATCH /api/auth/me`; profile updates are added to the audit trail.
- Authenticated password changes verify the current bcrypt password, rotate the
  session version, revoke older web/mobile sessions and create a security audit event.

## Operational deployment checklist

These controls live outside the application repository and must be enabled for the
production account:

1. Add the StockGuard-only MongoDB URI and generated backup encryption key as the
   two encrypted GitHub repository secrets documented in `docs/BACKUP_RECOVERY.md`,
   then run the daily-backup workflow once. The restore drill already passed against
   isolated temporary collections and removed them afterward.
2. Optionally enable Atlas continuous backup/PITR in addition to the repository's
   encrypted daily snapshot workflow if the production plan supports it.
3. Configure SMTP variables in Vercel to deliver password reset and alert emails.
4. Keep Vercel HTTPS enabled and restrict MongoDB network access to required clients.
5. Run the integration checks after every production deployment and remove their
   temporary tenant data.

## Verification commands

```powershell
npm.cmd --prefix server run check
npm.cmd --prefix server run check:auth-db
npm.cmd --prefix server run check:forecasts-db
npm.cmd --prefix server run check:analytics-db
npm.cmd --prefix frontend run build
npm.cmd --prefix mobile run check
```
