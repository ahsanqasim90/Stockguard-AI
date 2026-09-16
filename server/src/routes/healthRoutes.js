import { Router } from "express";

import { databaseStatus } from "../config/database.js";
import { env } from "../config/env.js";

const router = Router();

router.get("/", (_request, response) => {
  response.status(200).json({
    status: "ok",
    service: "StockGuard AI API",
    environment: env.nodeEnv,
    timestamp: new Date().toISOString(),
    mongodb: databaseStatus(),
    businessForecast: { model: "seasonal_naive", available: true },
    mlService: {
      url: process.env.ML_API_URL || null,
      configured: Boolean(process.env.ML_API_URL),
    },
  });
});

export default router;
