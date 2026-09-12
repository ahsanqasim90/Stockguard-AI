import app from "./app.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { env } from "./config/env.js";

async function startServer() {
  try {
    await connectDatabase();

    const server = app.listen(env.port, () => {
      console.log(`StockGuard API listening on http://127.0.0.1:${env.port}`);
    });

    const shutdown = (signal) => {
      console.log(`${signal} received. Shutting down...`);
      server.close(async () => {
        await disconnectDatabase();
        process.exit(0);
      });
    };

    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));
  } catch (error) {
    console.error("Unable to start StockGuard API:", error.message);
    process.exit(1);
  }
}

startServer();
