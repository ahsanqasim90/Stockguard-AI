import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { Router } from "express";
import { z } from "zod";

import { allowRoles, requireAuth } from "../middleware/auth.js";
import { User } from "../models/User.js";

const router = Router();
router.use(requireAuth, allowRoles("owner", "admin"));

const role = z.enum(["admin", "manager", "analyst", "staff"]);
const createSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128),
  role: role.default("staff"),
}).strict();
const updateSchema = z.object({
  role: role.optional(),
  status: z.enum(["active", "disabled"]).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Provide a role or status.");

function parse(schema, body) {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  const error = new Error(result.error.issues.map((issue) => issue.message).join(" "));
  error.statusCode = 400;
  throw error;
}

function view(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

router.get("/users", async (request, response) => {
  const users = await User.find({ business: request.auth.business._id }).sort({ role: 1, name: 1 }).lean();
  response.json({ users: users.map(view) });
});

router.post("/users", async (request, response) => {
  const data = parse(createSchema, request.body);
  if (await User.countDocuments({ business: request.auth.business._id }) >= 100) {
    const error = new Error("This workspace has reached its 100-user limit.");
    error.statusCode = 409;
    throw error;
  }
  if (await User.exists({ email: data.email })) {
    const error = new Error("An account with this email already exists.");
    error.statusCode = 409;
    throw error;
  }
  const user = await User.create({
    business: request.auth.business._id,
    name: data.name,
    email: data.email,
    passwordHash: await bcrypt.hash(data.password, 12),
    role: data.role,
    status: "active",
  });
  response.status(201).json({ user: view(user) });
});

router.patch("/users/:id", async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.id)) {
    const error = new Error("Invalid user ID.");
    error.statusCode = 400;
    throw error;
  }
  const data = parse(updateSchema, request.body);
  const user = await User.findOne({ _id: request.params.id, business: request.auth.business._id }).select("+tokenVersion");
  if (!user) {
    const error = new Error("User was not found.");
    error.statusCode = 404;
    throw error;
  }
  if (user.role === "owner") {
    const error = new Error("The workspace owner cannot be changed here.");
    error.statusCode = 403;
    throw error;
  }
  if (user._id.equals(request.auth.user._id) && data.status === "disabled") {
    const error = new Error("You cannot disable your own account.");
    error.statusCode = 400;
    throw error;
  }
  if (data.role) user.role = data.role;
  if (data.status && data.status !== user.status) {
    user.status = data.status;
    user.tokenVersion += 1;
  }
  await user.save();
  response.json({ user: view(user) });
});

export default router;
