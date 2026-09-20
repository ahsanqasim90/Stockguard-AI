# StockGuard AI mobile

This is the React Native/Expo mobile client for the same StockGuard business API and MongoDB data used by the web dashboard. It includes sign-in, dashboard, product create/edit/delete, CSV upload/history, live model comparison, reports, insights, profile and notification settings, plus invitation, permission, audit-log and system-health administration for authorized users.

## Run on a phone

1. Install Node.js 22.13+ and the Expo Go app on an Android or iOS phone.
2. In this folder run `npm install`, then `npm start`.
3. Scan the QR code in Expo Go. The phone and development computer should be on the same network for Metro. The API itself defaults to `https://stockguard-ai-ten.vercel.app/api`.
4. Sign in with a StockGuard web account. New accounts can currently be created on the web login page.

For another API, set `EXPO_PUBLIC_API_URL` before starting Expo. This value is public in the app bundle; never place credentials in it. Use an HTTPS URL reachable from the phone. A local `127.0.0.1` URL on the computer is not reachable as the same host from a physical phone.

Mobile refresh tokens are stored with Expo SecureStore. The access token is held in memory; `/api/auth/mobile/login`, `/api/auth/mobile/refresh`, and `/api/auth/mobile/logout` handle the native session without changing the website's cookie-based session. Signing out revokes the account's current tokens, including web sessions.

The Notifications screen contains the live MongoDB inbox, unread state, user
preferences, and an **Enable push on this device** action. The app is linked to
the `@ahsanqasim2003/stockguard-ai` EAS project and registers Expo push tokens
with the StockGuard API. Remote push requires an EAS development or store build;
current Expo Go versions only support the in-app notification experience. Android
builds also need FCM V1 credentials and iOS builds need Apple push credentials.

CSV uploads follow the **current backend** limit of 2 MB and 10,000 rows per file. Required columns are `date,sku,product_name,category,quantity_sold,revenue`; `store_id` is optional. Each business forecast measures Linear Regression, ARIMA, Random Forest and the available XGBoost/seasonal candidate on the same holdout. The API automatically saves the forecast with the lowest MAE (using RMSE as the tie-breaker).

## Checks

Run `npm run check` for TypeScript and `npx expo export --platform android` to verify the Android bundle. iOS needs a device or Mac build for native runtime verification.
