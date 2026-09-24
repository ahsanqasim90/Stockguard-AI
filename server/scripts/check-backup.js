import assert from "node:assert/strict";
import crypto from "node:crypto";

import mongoose from "mongoose";

import { backupKey, decodeBackup, encodeBackup, sha256 } from "../src/services/backupCodec.js";

const key = crypto.randomBytes(32).toString("base64");
const id = new mongoose.Types.ObjectId();
const createdAt = new Date("2026-09-24T00:00:00.000Z");
const payload = { version: 1, database: "stockguard_ai", collections: [{
  name: "products", count: 1, indexes: [{ name: "_id_", key: { _id: 1 } }],
  documents: [{ _id: id, createdAt, sku: "SG-001", stock: 42 }],
}] };
const encrypted = encodeBackup(payload, key);
assert.ok(encrypted.length > 60);
assert.equal(sha256(encrypted).length, 64);
const restored = decodeBackup(encrypted, key);
assert.equal(restored.collections[0].documents[0]._id.toHexString(), id.toHexString());
assert.equal(restored.collections[0].documents[0].createdAt.toISOString(), createdAt.toISOString());
assert.equal(Number(restored.collections[0].documents[0].stock), 42);
assert.throws(() => backupKey("too-short"), /32-byte key/);
const tampered = Buffer.from(encrypted); tampered[tampered.length - 1] ^= 1;
assert.throws(() => decodeBackup(tampered, key));
console.log("StockGuard encrypted backup codec check PASSED");
