# StockGuard AI submission checklist

## Required deliverables

- [x] Proposal and SRS reviewed against the final implementation.
- [x] Web application deployed and reachable.
- [x] Node.js API and MongoDB Atlas connected.
- [x] Python Linear Regression, ARIMA and Random Forest service connected.
- [x] XGBoost production model and seasonal fallback available.
- [x] Complete 30-day forecasts and MAE/RMSE comparison verified.
- [x] Product, CSV, replenishment, reports, insights and administration workflows verified.
- [x] Mobile TypeScript validation and Android export verified.
- [x] Daily encrypted backup and isolated restore verified.
- [x] Production health monitoring workflow included.
- [x] EAS Android APK, Android AAB and iOS build profiles included.
- [x] Final project report included.
- [x] User, QA, compliance, backup and presentation documentation included.
- [ ] Generate an installable preview APK from the Expo account.
- [ ] Configure SMTP only if real email delivery is required for the demonstration.
- [ ] Confirm one remote push notification on a physical development/store build.

## Submission package contents

- Source code from the `main` branch.
- `README.md` setup and architecture overview.
- `docs/FINAL_PROJECT_REPORT.md` and formatted report outputs.
- `docs/SRS_COMPLIANCE.md`.
- `docs/QA_REPORT.md`.
- `docs/USER_GUIDE.md`.
- `docs/PRESENTATION_GUIDE.md`.
- `docs/BACKUP_RECOVERY.md`.
- `docs/evidence` performance and recovery results.
- `demo/stockguard-demo-sales.csv`.
- Submitted proposal and SRS as separate university documents.

Do not include `.env` files, MongoDB credentials, JWT secrets, SMTP passwords,
backup encryption keys, `node_modules`, caches or local build directories.

## Five-minute demonstration

1. Sign in to the dedicated demo workspace.
2. Show dashboard metrics and inventory risks.
3. Create or edit a product.
4. Show CSV validation and upload history.
5. Run a 30-day live model comparison.
6. Explain MAE, RMSE and automatic best-model selection.
7. Show revenue, safety stock and recommended order quantity.
8. Download a report.
9. Approve or dismiss a replenishment recommendation.
10. Show the mobile dashboard, notifications and administrator audit log.

## Final safety check

- [ ] Demo login works in a private browser window.
- [ ] A saved forecast and reports are available before the presentation.
- [ ] Phone, laptop and charger are ready.
- [ ] Expo Go or the preview APK opens successfully.
- [ ] Demo CSV is stored locally.
- [ ] Screenshots are available if the venue internet fails.
- [ ] No passwords, reset links, database URIs or API secrets appear in screenshots.
