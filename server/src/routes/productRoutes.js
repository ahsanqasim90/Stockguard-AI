import crypto from "node:crypto";
import mongoose from "mongoose";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { Product } from "../models/Product.js";
import { Inventory } from "../models/Inventory.js";
import { Store } from "../models/Store.js";
import { writeAudit } from "../services/auditService.js";
import { notifyInventoryLevel } from "../services/notificationService.js";

const router = Router();
router.use(requireAuth);
const write = requirePermission("products.write");
const schema = z.object({
  name: z.string().trim().min(1).max(160),
  sku: z.string().trim().min(1).max(80).transform((s) => s.toUpperCase()),
  category: z.string().trim().max(100).default(""),
  supplier: z.string().trim().max(120).default(""),
  stock: z.coerce.number().int().min(0).default(0),
  reorder: z.coerce.number().int().min(0).default(0),
  price: z.coerce.number().min(0).default(0),
});

function badRequest(message) { const error = new Error(message); error.statusCode = 400; return error; }
function missing() { const error = new Error("Product was not found."); error.statusCode = 404; return error; }
function parse(body, partial = false) {
  const result = (partial ? schema.partial() : schema).safeParse(body);
  if (!result.success) throw badRequest(result.error.issues.map((issue) => issue.message).join(" "));
  return partial ? Object.fromEntries(Object.entries(result.data).filter(([key]) => Object.hasOwn(body, key))) : result.data;
}
function businessId(request) { return request.auth.business._id; }
async function defaultStore(business) {
  return Store.findOneAndUpdate({ business, storeId: "DEFAULT" }, { $setOnInsert: { business, storeId: "DEFAULT", name: "Main store" } }, { upsert: true, returnDocument: "after" });
}
async function view(product, store) {
  const inventory = await Inventory.findOne({ business: product.business, store: store._id, product: product._id }).lean();
  return { id: product._id.toString(), name: product.name, sku: product.sku || product.productId,
    category: product.category || "", supplier: product.supplier || "", price: product.price,
    stock: inventory?.quantityOnHand || 0, reorder: inventory?.reorderPoint || 0, status: product.status };
}

router.get("/", requirePermission("products.read"), async (request, response) => {
  const business = businessId(request);
  const store = await defaultStore(business);
  const products = await Product.find({ business, status: { $ne: "discontinued" } }).sort({ name: 1 }).limit(500).lean();
  const inventory = await Inventory.find({ business, store: store._id, product: { $in: products.map((p) => p._id) } }).lean();
  const byProduct = new Map(inventory.map((i) => [i.product.toString(), i]));
  response.json({ products: products.map((p) => ({ id: p._id.toString(), name: p.name, sku: p.sku || p.productId,
    category: p.category || "", supplier: p.supplier || "", price: p.price,
    stock: byProduct.get(p._id.toString())?.quantityOnHand || 0,
    reorder: byProduct.get(p._id.toString())?.reorderPoint || 0, status: p.status })) });
});

router.post("/", write, async (request, response) => {
  const data = parse(request.body);
  const business = businessId(request);
  if (await Product.exists({ business, sku: data.sku })) { const error = new Error("This SKU already exists."); error.statusCode = 409; throw error; }
  const store = await defaultStore(business);
  const product = await Product.create({ business, productId: `ITEM-${crypto.randomBytes(6).toString("hex").toUpperCase()}`,
    name: data.name, sku: data.sku, category: data.category, supplier: data.supplier, price: data.price });
  const inventory = await Inventory.findOneAndUpdate({ business, store: store._id, product: product._id },
    { $set: { quantityOnHand: data.stock, reorderPoint: data.reorder } }, { upsert: true, returnDocument: "after" });
  await writeAudit(request, { action: "product.created", targetType: "product", targetId: product._id, targetLabel: product.name });
  await notifyInventoryLevel({ business, product, inventory, storeLabel: store.name });
  response.status(201).json({ product: await view(product, store) });
});

router.patch("/:id", write, async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.id)) throw badRequest("Invalid product ID.");
  const data = parse(request.body, true);
  if (!Object.keys(data).length) throw badRequest("Provide at least one product field.");
  const business = businessId(request);
  const product = await Product.findOne({ _id: request.params.id, business, status: { $ne: "discontinued" } });
  if (!product) throw missing();
  for (const key of ["name", "sku", "category", "supplier", "price"]) if (key in data) product[key] = data[key];
  await product.save();
  const store = await defaultStore(business);
  const inventoryUpdate = {};
  if ("stock" in data) inventoryUpdate.quantityOnHand = data.stock;
  if ("reorder" in data) inventoryUpdate.reorderPoint = data.reorder;
  if (Object.keys(inventoryUpdate).length) await Inventory.findOneAndUpdate(
    { business, store: store._id, product: product._id }, { $set: inventoryUpdate }, { upsert: true });
  await writeAudit(request, { action: "product.updated", targetType: "product", targetId: product._id, targetLabel: product.name,
    metadata: { fields: Object.keys(data) } });
  if (Object.keys(inventoryUpdate).length) {
    const inventory = await Inventory.findOne({ business, store: store._id, product: product._id });
    await notifyInventoryLevel({ business, product, inventory, storeLabel: store.name });
  }
  response.json({ product: await view(product, store) });
});

router.delete("/:id", write, async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.id)) throw badRequest("Invalid product ID.");
  const product = await Product.findOneAndUpdate({ _id: request.params.id, business: businessId(request), status: { $ne: "discontinued" } },
    { $set: { status: "discontinued" } });
  if (!product) throw missing();
  await writeAudit(request, { action: "product.deleted", targetType: "product", targetId: product._id,
    targetLabel: product.name, severity: "warning" });
  response.status(204).end();
});

export default router;
