# StockGuard AI

Live dashboard: https://stockguard-ai-ten.vercel.app

## Web administration panel

The responsive React administration panel includes dashboard analytics, product
management, CSV validation and upload history, the production AI forecast view,
downloadable reports, business insights, user administration, profile editing,
and notification, security, model, and appearance settings.

- Sign in: `https://stockguard-ai-ten.vercel.app/login`
Registration and login are connected to the Express authentication API. Create
the first owner account after setting `MONGODB_URI` in `server/.env`. Passwords
are bcrypt-hashed, the dashboard verifies a JWT session, and admin navigation is
limited to owner/admin roles. Product and report persistence will be migrated
from browser storage in the next backend phase.

StockGuard AI combines a React website, a Node.js/Express business API, MongoDB,
and the Python/XGBoost forecasting service. The pilot model uses store `S0085`
and products with dense daily sales history.

## MERN backend and MongoDB

The `server` folder contains the Node.js/Express API and Mongoose schemas for
businesses, users, stores, products, sales, inventory, forecasts, and
recommendations. Install and verify it with:

```powershell
.\setup_server.ps1
Copy-Item .\server\.env.example .\server\.env
```

Add the MongoDB Atlas connection string to `server\.env`, then start it with:

```powershell
.\run_server.ps1
```

The health endpoint is `http://127.0.0.1:5000/api/health`. The detailed server
guide is in `server/README.md`.

## Using the project in VS Code

Open `D:\Stockguard Ai` as the VS Code folder. Press `Ctrl+Shift+P`, select
`Tasks: Run Task`, and choose one of the `StockGuard:` tasks. The recommended order is Setup,
Prepare data, Smoke training, and then Pilot training.

The training launcher limits numerical libraries and Random Forest to three CPU workers and starts
Python at below-normal process priority. This keeps the computer responsive during a long run.

## First-time setup

Open PowerShell in this folder and run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\setup.ps1
```

## Prepare the pilot dataset

```powershell
.\run_prepare.ps1
```

The script reads `archive.zip` directly. It does not need the 1 GB sales file to be extracted.

## Run the short smoke test

```powershell
.\run_train.ps1 -Quick
```

This uses three products and a smaller Random Forest. Results are written to `artifacts\smoke`.

## Run the full pilot

```powershell
.\run_train.ps1
```

Results are written to `artifacts\pilot`. The main files are:

- `metrics.csv`: MAE and RMSE by model and product
- `best_model.json`: model selected by lowest overall MAE
- `predictions_all.csv`: actual and predicted daily sales
- `models\`: saved Linear Regression and Random Forest models
- `training_*.log`: progress and error logs

If an earlier run completed some models, reuse their saved predictions:

```powershell
.\run_train.ps1 -Resume
```

Run a smaller model selection when diagnosing an issue:

```powershell
.\run_train.ps1 -Quick -Models "seasonal_naive,linear_regression"
```

The last 28 days are held out for testing. Training features use only data available before the
forecast date. Explicit zero-sales days remain zero. Missing sales values are imputed only inside
the modelling series and remain missing in evaluation outputs.

The current computer exposes Intel UHD 620 integrated graphics and no NVIDIA CUDA device. The
required scikit-learn Random Forest, Linear Regression, and statsmodels ARIMA implementations run
on CPU. A CUDA training path would require a compatible NVIDIA GPU and different libraries.


## Rolling backtest (recommended next step)

Run the three-product validation first:

```powershell
.\run_backtest.ps1 -Quick
```

After it completes successfully, run all 13 pilot products across three historical 28-day windows:

```powershell
.\run_backtest.ps1
```

If the run is interrupted, continue with:

```powershell
.\run_backtest.ps1 -Resume
```

Backtest outputs are saved under `artifacts/backtest_smoke` or `artifacts/backtest`.
The final `model_registry.json` records the lowest-MAE model for each product across all folds.

## Run the trained model and dashboard

The imported Kaggle production bundle is served by FastAPI and displayed in the React dashboard.
Start both services with one command:

```powershell
.\start_app.ps1
```

The launcher opens the dashboard automatically. The local addresses are:

- Dashboard: `http://127.0.0.1:5173`
- API documentation: `http://127.0.0.1:8001/docs`

Stop both services with:

```powershell
.\stop_app.ps1
```

To verify a newly imported production model before starting the app, run:

```powershell
.\run_verify_model.ps1
```
