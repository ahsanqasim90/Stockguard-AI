import { Router } from "express";

import { databaseStatus } from "../config/database.js";
import { env } from "../config/env.js";
import { productionModelStatus } from "../services/xgboostRuntime.js";
import { pythonMlStatus } from "../services/pythonMlService.js";

const router = Router();

router.get("/", async (_request, response) => {
  const pythonMl = await pythonMlStatus();
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
    pythonMl,
  });
});

export default router;
