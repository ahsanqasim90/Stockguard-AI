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
    mlService: {
      url: env.mlApiUrl,
      configured: Boolean(env.mlApiUrl),
    },
  });
});

export default router;
