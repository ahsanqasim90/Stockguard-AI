import app from "../server/src/app.js";
import { connectDatabase } from "../server/src/config/database.js";

let connectionPromise;

function databaseErrorDetails(error) {
  const servers = error?.reason?.servers;
  const serverErrors = servers instanceof Map
    ? [...servers.entries()].map(([host, description]) => ({
        host,
        type: description?.type,
        error: description?.error?.message || null,
      }))
    : [];

  return {
    name: error?.name,
    code: error?.code,
    codeName: error?.codeName,
    message: error?.message,
    topologyType: error?.reason?.type,
    servers: serverErrors,
  };
}

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
    console.error("Database connection failed:", JSON.stringify(databaseErrorDetails(error)));
    return response.status(503).json({
      error: "Service Unavailable",
      message: "The database connection is unavailable. Please try again shortly.",
    });
  }
}
