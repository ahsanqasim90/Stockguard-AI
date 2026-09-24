import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";

import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import authRoutes from "./routes/authRoutes.js";
import healthRoutes from "./routes/healthRoutes.js";
import importRoutes from "./routes/importRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import forecastRoutes from "./routes/forecastRoutes.js";
import analyticsRoutes from "./routes/analyticsRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import settingsRoutes from "./routes/settingsRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import recommendationRoutes from "./routes/recommendationRoutes.js";

const app = express();
const allowedOrigins = new Set(env.clientUrl.split(",").map((origin) => origin.trim()).filter(Boolean));

app.disable("x-powered-by");
if (env.nodeEnv === "production") app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({
  credentials: true,
  origin(origin, callback) {
    const localDevelopmentOrigin = env.nodeEnv !== "production" && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin || "");
    if (!origin || allowedOrigins.has(origin) || localDevelopmentOrigin) return callback(null, true);
    const error = new Error("This website origin is not allowed to access the API.");
    error.statusCode = 403;
    return callback(error);
  },
}));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

if (env.nodeEnv !== "test") {
  app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));
}

app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    // Dashboard, mobile and presentation clients legitimately fan out into
    // multiple API calls. Authentication endpoints have a tighter limiter.
    limit: 1_200,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
);

app.get("/", (_request, response) => {
  response.json({ name: "StockGuard AI API", version: "1.0.0", health: "/api/health" });
});

app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/imports", importRoutes);
app.use("/api/forecasts", forecastRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/recommendations", recommendationRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
