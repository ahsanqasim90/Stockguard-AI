import mongoose from "mongoose";
import { baseOptions, objectId } from "./shared.js";

const userSchema = new mongoose.Schema({
  business: { type: objectId, ref: "Business", default: null, index: true },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true },
  passwordHash: { type: String, required: true, select: false },
  role: {
    type: String,
    enum: ["owner", "admin", "manager", "analyst", "staff"],
    default: "owner",
    index: true,
  },
  status: { type: String, enum: ["active", "invited", "disabled"], default: "active", index: true },
  tokenVersion: { type: Number, default: 0, select: false },
  lastLoginAt: { type: Date, default: null },
}, baseOptions);

export const User = mongoose.model("User", userSchema);
