import crypto from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { requireAuth, allowRoles } from "../middleware/auth.js";
import { ImportBatch } from "../models/ImportBatch.js";
import { Forecast } from "../models/Forecast.js";
import { ForecastRun } from "../models/ForecastRun.js";
import { Product } from "../models/Product.js";
import { Sale } from "../models/Sale.js";
import { Store } from "../models/Store.js";
import { csvError, parseSalesCsv } from "../services/salesCsv.js";

const router = Router();
router.use(requireAuth);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter(_request, file, callback) {
    if (!file.originalname.toLowerCase().endsWith(".csv")) return callback(csvError("Choose a .csv file."));
    callback(null, true);
  } });

router.get("/", async (request, response) => {
  const imports = await ImportBatch.find({ business: request.auth.business._id }).sort({ createdAt: -1 }).limit(30).lean();
  response.json({ imports: imports.map((item) => ({ id: item._id.toString(), name: item.fileName,
    records: item.records, date: item.createdAt, status: "Imported" })) });
});

router.post("/sales", allowRoles("owner", "admin", "analyst"), (request, response, next) => {
  upload.single("file")(request, response, (error) => {
    if (error?.code === "LIMIT_FILE_SIZE") return next(csvError("CSV file must be 2 MB or smaller."));
    if (error) return next(error);
    next();
  });
}, async (request, response) => {
  if (!request.file) throw csvError("Choose a CSV file to import.");
  const rows = parseSalesCsv(request.file.buffer.toString("utf8"));
  const business = request.auth.business._id;
  const productRows = new Map(rows.map((r) => [r.sku, r]));
  const storeIds = [...new Set(rows.map((r) => r.storeId))];
  await Store.bulkWrite(storeIds.map((storeId) => ({ updateOne: { filter: { business, storeId },
    update: { $setOnInsert: { business, storeId, name: storeId === "DEFAULT" ? "Main store" : storeId } }, upsert: true } })));
  await Product.bulkWrite([...productRows.values()].map((r) => ({ updateOne: { filter: { business, sku: r.sku },
    update: { $set: { name: r.name, category: r.category, status: "active" }, $setOnInsert: { business, sku: r.sku,
      productId: `ITEM-${crypto.randomBytes(6).toString("hex").toUpperCase()}` } }, upsert: true } })));
  const [stores, products] = await Promise.all([
    Store.find({ business, storeId: { $in: storeIds } }).select("_id storeId").lean(),
    Product.find({ business, sku: { $in: [...productRows.keys()] } }).select("_id sku").lean(),
  ]);
  const storeMap = new Map(stores.map((s) => [s.storeId, s._id]));
  const productMap = new Map(products.map((p) => [p.sku, p._id]));
  const batchId = crypto.randomUUID();
  const result = await Sale.bulkWrite(rows.map((r) => ({ updateOne: {
    filter: { business, store: storeMap.get(r.storeId), product: productMap.get(r.sku), date: r.date },
    update: { $set: { quantity: r.quantity, revenue: r.revenue, source: "csv", importBatchId: batchId } },
    upsert: true,
  } })), { ordered: false });
  const imported = result.upsertedCount + result.modifiedCount;
  await Promise.all([Forecast.deleteMany({ business }), ForecastRun.deleteMany({ business })]);
  const batch = await ImportBatch.create({ business, uploadedBy: request.auth.user._id,
    fileName: request.file.originalname.slice(0, 180), records: rows.length, salesUpserted: imported });
  response.status(201).json({ import: { id: batch._id.toString(), name: batch.fileName,
    records: batch.records, salesUpserted: imported, date: batch.createdAt, status: "Imported" } });
});

export default router;
