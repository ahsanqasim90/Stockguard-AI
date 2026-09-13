import app from "../server/src/app.js";
import { connectDatabase } from "../server/src/config/database.js";

let connectionPromise;

export default async function handler(request, response) {
  try {
    if (!connectionPromise) {
      connectionPromise = connectDatabase().catch((error) => {
        connectionPromise = undefined;
        throw error;
      });
    }
    await connectionPromise;
    return app(request, response);
  } catch (error) {
    console.error("Database connection failed:", error.message);
    return response.status(503).json({
      error: "Service Unavailable",
      message: "The database connection is unavailable. Please try again shortly.",
    });
  }
}
