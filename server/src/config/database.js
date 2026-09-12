import mongoose from "mongoose";
import { env } from "./env.js";

mongoose.set("strictQuery", true);
mongoose.set("bufferCommands", false);

export async function connectDatabase() {
  if (!env.mongodbUri) {
    console.warn("MongoDB is not configured. Add MONGODB_URI to server/.env.");
    return false;
  }

  await mongoose.connect(env.mongodbUri, {
    serverSelectionTimeoutMS: 8_000,
    maxPoolSize: 10,
    autoIndex: env.nodeEnv !== "production",
  });

  console.log(`MongoDB connected: ${mongoose.connection.name}`);
  return true;
}

export function databaseStatus() {
  const states = ["disconnected", "connected", "connecting", "disconnecting"];
  return {
    configured: Boolean(env.mongodbUri),
    state: states[mongoose.connection.readyState] || "unknown",
    database: mongoose.connection.name || null,
  };
}

export async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
}
