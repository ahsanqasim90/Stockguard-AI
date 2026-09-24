import crypto from "node:crypto";
import zlib from "node:zlib";

import mongoose from "mongoose";

const MAGIC = Buffer.from("STOCKGUARD_BACKUP_V1\n", "ascii");
const IV_BYTES = 12;
const TAG_BYTES = 16;
const EJSON = mongoose.mongo.BSON.EJSON;

export function backupKey(value) {
  const input = String(value || "").trim();
  let key;
  if (/^[a-f\d]{64}$/i.test(input)) key = Buffer.from(input, "hex");
  else {
    try { key = Buffer.from(input, "base64"); } catch { key = Buffer.alloc(0); }
  }
  if (key.length !== 32) {
    throw new Error("STOCKGUARD_BACKUP_KEY must be a 32-byte key encoded as base64 or 64 hexadecimal characters.");
  }
  return key;
}

export function encodeBackup(payload, keyInput) {
  const key = backupKey(keyInput);
  const iv = crypto.randomBytes(IV_BYTES);
  const plaintext = Buffer.from(EJSON.stringify(payload, { relaxed: false }), "utf8");
  const compressed = zlib.gzipSync(plaintext, { level: zlib.constants.Z_BEST_COMPRESSION });
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(MAGIC);
  const encrypted = Buffer.concat([cipher.update(compressed), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([MAGIC, iv, tag, encrypted]);
}

export function decodeBackup(file, keyInput) {
  const key = backupKey(keyInput);
  if (!Buffer.isBuffer(file) || file.length <= MAGIC.length + IV_BYTES + TAG_BYTES || !file.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error("The selected file is not a supported StockGuard backup.");
  }
  const ivStart = MAGIC.length;
  const tagStart = ivStart + IV_BYTES;
  const contentStart = tagStart + TAG_BYTES;
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, file.subarray(ivStart, tagStart));
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(file.subarray(tagStart, contentStart));
  const compressed = Buffer.concat([decipher.update(file.subarray(contentStart)), decipher.final()]);
  return EJSON.parse(zlib.gunzipSync(compressed).toString("utf8"), { relaxed: false });
}

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
