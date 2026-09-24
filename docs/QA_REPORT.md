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

## Presentation smoke test

The dedicated production demo workspace was checked end to end through the live
Vercel API. It contains 8 products, 800 sales rows, a complete 30-day forecast,
3 downloadable reports, 14 notifications and 4 replenishment recommendations.
The smoke test also verified MongoDB connectivity, Python ML health, the default
30-day horizon, administration data and the workspace audit trail.

## Security behaviour verified

- User passwords are stored as bcrypt hashes.
- Web refresh credentials use an HttpOnly cookie; mobile refresh credentials use
  Expo SecureStore.
- A password change requires the current password and revokes older access and
  refresh sessions.
- Profile changes and password changes are recorded in the workspace audit log.
- All business records are queried within the authenticated tenant.

## Production operations

The application is ready for the FYP demo after deployment. Email delivery still
requires SMTP environment variables, and the production Atlas project should have
scheduled backup/PITR enabled and restore-tested by the account owner. These are
cloud account controls rather than missing application code.
