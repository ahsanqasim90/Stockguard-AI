import fs from "node:fs/promises";
import path from "node:path";

import mongoose from "mongoose";

import { encodeBackup, sha256 } from "../src/services/backupCodec.js";

const uri = process.env.MONGODB_URI;
const encryptionKey = process.env.STOCKGUARD_BACKUP_KEY;
const outputDirectory = path.resolve(process.env.STOCKGUARD_BACKUP_DIR || "backups");
if (!uri) throw new Error("Set MONGODB_URI before creating a backup.");
if (!encryptionKey) throw new Error("Set STOCKGUARD_BACKUP_KEY before creating a backup.");

const startedAt = Date.now();
const connection = await mongoose.createConnection(uri, {
  serverSelectionTimeoutMS: 15_000,
  maxPoolSize: 3,
  readPreference: "primaryPreferred",
}).asPromise();

try {
  const database = connection.db.databaseName;
  const collectionInfo = await connection.db.listCollections({}, { nameOnly: true }).toArray();
  const collections = [];
  for (const { name } of collectionInfo.filter((item) => !item.name.startsWith("system.")).sort((a, b) => a.name.localeCompare(b.name))) {
    const collection = connection.db.collection(name);
    const [documents, indexes] = await Promise.all([
      collection.find({}).toArray(),
      collection.listIndexes().toArray().catch(() => []),
    ]);
    collections.push({ name, count: documents.length, indexes, documents });
  }
  const createdAt = new Date().toISOString();
  const payload = { format: "stockguard-encrypted-mongodb-backup", version: 1, createdAt, database, collections };
  const encrypted = encodeBackup(payload, encryptionKey);
  const timestamp = createdAt.replace(/[:.]/g, "-");
  const filename = `stockguard-${database}-${timestamp}.sgbackup`;
  const manifestName = `${filename}.manifest.json`;
  const totalDocuments = collections.reduce((total, item) => total + item.count, 0);
  const manifest = {
    format: payload.format,
    version: payload.version,
    createdAt,
    sourceDatabase: database,
    encrypted: true,
    encryption: "AES-256-GCM",
    compressed: true,
    checksumAlgorithm: "SHA-256",
    sha256: sha256(encrypted),
    sizeBytes: encrypted.length,
    totalDocuments,
    collections: collections.map(({ name, count, indexes }) => ({ name, count, indexes: indexes.length })),
    durationMs: Date.now() - startedAt,
    backupFile: filename,
  };
  await fs.mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(outputDirectory, filename), encrypted, { mode: 0o600 }),
    fs.writeFile(path.join(outputDirectory, manifestName), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 }),
  ]);
  console.log("StockGuard encrypted MongoDB backup created");
  console.log(JSON.stringify({ directory: outputDirectory, ...manifest }, null, 2));
} finally {
  await connection.close();
}
