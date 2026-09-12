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
string supplied by Atlas. Then run:

```powershell
.\run_server.ps1
```

Open <http://127.0.0.1:5000/api/health>. A successful Atlas connection reports
`mongodb.state` as `connected`.

## Initial collections

- businesses and users
- stores and products
- sales and inventory
- forecasts and recommendations

Every operational collection includes a `business` tenant key so data is isolated
for each customer.
