# StockGuard AI Node API

This is the MERN application backend. It owns authentication and business data in
MongoDB and calls the existing Python prediction API for ML inference.

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

Every operational collection includes a `business` tenant key so data is isolated
for each customer.
