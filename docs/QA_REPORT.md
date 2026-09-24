# StockGuard AI final QA report

Verified on 24 September 2026 against the application source and the isolated
`stockguard_ai` MongoDB Atlas database.

## Automated checks

| Area | Check | Result |
| --- | --- | --- |
| Backend | Static API/model/permission/forecast assertions | Passed |
| Authentication | Registration, web/mobile refresh, logout and revocation | Passed |
| Account | MongoDB profile persistence and audited password change | Passed |
| Recovery | Single-use password reset and previous-session invalidation | Passed |
| Products/imports | Tenant CRUD, 10 MB CSV validation, idempotency and rollback | Passed |
| Forecasting | Signed Python ML comparison, XGBoost/seasonal candidates and saved 30-day predictions | Passed |
| Replenishment | Safety stock, order quantity, recommendation lifecycle and alerts | Passed |
| Analytics | Date windows, revenue, categories, low stock and tenant isolation | Passed |
| Python models | 30-day Linear Regression, ARIMA and Random Forest with MAE/RMSE | Passed |
| Web | Vite production build | Passed |
| Mobile | TypeScript validation and Expo Android production export | Passed |
| Dependencies | Production server audit (including Nodemailer 10.0.10) | 0 vulnerabilities |
| Performance | Production load, dashboard, login, CSV and forecast thresholds | Passed |
| Usability | Web/mobile Quick Start, forecast ETA and 15-minute recovery guide | Passed |
| Backup | AES-256-GCM encrypted backup codec and tamper detection | Passed |
| Recovery | 1,055 documents across 16 collections restored and verified | Passed in 13.914 seconds |

## Presentation smoke test

The dedicated production demo workspace was checked end to end through the live
Vercel API. It contains 8 products, 800 sales rows, a complete 30-day forecast,
3 downloadable reports, 14 notifications and 4 replenishment recommendations.
The smoke test also verified MongoDB connectivity, Python ML health, the default
30-day horizon, administration data and the workspace audit trail.

## Production performance evidence

The production deployment runs its Node and Python functions in Vercel's Mumbai
region beside the Atlas `ap-south-1` database, with Fluid Compute enabled. The
repeatable performance check passed with 100 authenticated virtual users over a
10-second ramp: all 100 requests returned HTTP 200, average response time was
259 ms, p95 was 832 ms and the maximum was 1,210 ms. Normal login completed in
855 ms, the dashboard in 843 ms, a live 30-day forecast in 2,224 ms, and local
validation of a 10,000-row CSV in 61 ms. Full machine-readable results are saved
in `docs/evidence/SRS-performance-evidence.json`.

## Security behaviour verified

- User passwords are stored as bcrypt hashes.
- Web refresh credentials use an HttpOnly cookie; mobile refresh credentials use
  Expo SecureStore.
- A password change requires the current password and revokes older access and
  refresh sessions.
- Profile changes and password changes are recorded in the workspace audit log.
- All business records are queried within the authenticated tenant.

## Production operations

The application includes a scheduled encrypted backup and restore-verification
workflow. The workflow requires two encrypted GitHub repository secrets before its
daily schedule can run. Email delivery still requires SMTP environment variables;
in-app notifications work independently of SMTP.
