import fs from "node:fs/promises";
import path from "node:path";

import mongoose from "mongoose";

import { decodeBackup, sha256 } from "../src/services/backupCodec.js";

const backupFile = path.resolve(process.env.STOCKGUARD_BACKUP_FILE || "");
const restoreUri = process.env.STOCKGUARD_RESTORE_URI;
const encryptionKey = process.env.STOCKGUARD_BACKUP_KEY;
const dropAfterVerification = process.env.STOCKGUARD_DROP_RESTORE_AFTER_VERIFY === "true";
const collectionPrefix = String(process.env.STOCKGUARD_RESTORE_COLLECTION_PREFIX || "").trim();
if (!process.env.STOCKGUARD_BACKUP_FILE) throw new Error("Set STOCKGUARD_BACKUP_FILE to an encrypted .sgbackup file.");
if (!restoreUri) throw new Error("Set STOCKGUARD_RESTORE_URI to a temporary restore database URI.");
if (!encryptionKey) throw new Error("Set STOCKGUARD_BACKUP_KEY before restoring a backup.");

const startedAt = Date.now();
const encrypted = await fs.readFile(backupFile);
const payload = decodeBackup(encrypted, encryptionKey);
const connection = await mongoose.createConnection(restoreUri, { serverSelectionTimeoutMS: 15_000, maxPoolSize: 3 }).asPromise();
const createdCollections = [];
let temporaryDatabase = false;

try {
  const targetDatabase = connection.db.databaseName;
  const separateDatabase = /_restore_verify$/i.test(targetDatabase) && targetDatabase !== payload.database;
  temporaryDatabase = separateDatabase;
  const isolatedCollections = targetDatabase === payload.database && /^restore_verify_[a-z\d_-]+__$/i.test(collectionPrefix);
  if (!separateDatabase && !isolatedCollections) {
    throw new Error("Restore target is blocked. Use a database ending in _restore_verify or an isolated restore_verify_*__ collection prefix.");
  }
  if (separateDatabase) await connection.dropDatabase();
  const existingCollections = new Set((await connection.db.listCollections({}, { nameOnly: true }).toArray()).map((item) => item.name));
  const targetName = (name) => isolatedCollections ? `${collectionPrefix}${name}` : name;
  const conflicts = payload.collections.map((entry) => targetName(entry.name)).filter((name) => existingCollections.has(name));
  if (conflicts.length) throw new Error(`Restore verification found existing target collections: ${conflicts.join(", ")}.`);
  const results = [];
  for (const entry of payload.collections) {
    const restoredName = targetName(entry.name);
    const collection = await connection.db.createCollection(restoredName);
    createdCollections.push(restoredName);
    if (entry.documents.length) await collection.insertMany(entry.documents, { ordered: true });
    for (const index of entry.indexes || []) {
      if (index.name === "_id_") continue;
      const { key, v: _version, ns: _namespace, background: _background, ...options } = index;
      await collection.createIndex(key, options);
    }
    const restored = await collection.countDocuments({});
    const expected = Number(entry.count);
    if (restored !== expected) throw new Error(`${entry.name} count mismatch: expected ${expected}, restored ${restored}.`);
    results.push({ name: entry.name, restoredAs: restoredName, expected, restored, verified: true });
  }
  const completedAt = new Date();
  const evidence = {
    result: "passed",
    sourceDatabase: payload.database,
    targetDatabase,
    restoreMode: isolatedCollections ? "isolated-collection-prefix" : "temporary-database",
    targetCollectionPrefix: isolatedCollections ? collectionPrefix : null,
    backupCreatedAt: payload.createdAt,
    verifiedAt: completedAt.toISOString(),
    backupSha256: sha256(encrypted),
    recoveryTimeMs: Date.now() - startedAt,
    recoveryWithinTenMinutes: Date.now() - startedAt < 10 * 60 * 1000,
    totalDocuments: results.reduce((total, item) => total + item.restored, 0),
    collections: results,
    targetDroppedAfterVerification: dropAfterVerification,
  };
  const evidencePath = path.resolve(process.env.STOCKGUARD_RESTORE_EVIDENCE || `${backupFile}.restore-evidence.json`);
  if (dropAfterVerification) {
    if (separateDatabase) await connection.dropDatabase();
    else for (const item of results) await connection.db.collection(item.restoredAs).drop();
    createdCollections.length = 0;
  }
  await fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  console.log("StockGuard backup restore verification PASSED");
  console.log(JSON.stringify({ evidencePath, ...evidence }, null, 2));
} catch (error) {
  if (dropAfterVerification) {
    if (temporaryDatabase) await connection.dropDatabase().catch(() => {});
    else for (const name of createdCollections) await connection.db.collection(name).drop().catch(() => {});
  }
  throw error;
} finally {
  await connection.close();
}
