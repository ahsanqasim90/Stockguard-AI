import { Router } from "express";

import { databaseStatus } from "../config/database.js";
import { env } from "../config/env.js";
import { productionModelStatus } from "../services/xgboostRuntime.js";

const router = Router();

router.get("/", (_request, response) => {
  response.status(200).json({
    status: "ok",
    service: "StockGuard AI API",
    environment: env.nodeEnv,
    timestamp: new Date().toISOString(),
    mongodb: databaseStatus(),
    businessForecast: {
      defaultModel: "global_xgboost",
      fallbackModel: "seasonal_naive",
      available: true,
    },
    productionModel: productionModelStatus(),
  });
});

export default router;
