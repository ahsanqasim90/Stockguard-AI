const required = ["date", "product_name", "sku", "quantity_sold", "revenue", "category"];

export function csvError(message) { const error = new Error(message); error.statusCode = 400; return error; }

function cells(text) {
  const rows = []; let row = []; let field = ""; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') {
      if (field.length) throw csvError("CSV contains an invalid quote.");
      quoted = true;
    } else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (quoted) throw csvError("CSV contains an unclosed quoted field.");
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim()));
}

function dateValue(value, line) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw csvError(`Row ${line}: date must be YYYY-MM-DD.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw csvError(`Row ${line}: invalid date.`);
  return date;
}
function nonnegative(value, label, line, integer = false) {
  if (!/^\d+(?:\.\d+)?$/.test(value)) throw csvError(`Row ${line}: ${label} must be nonnegative.`);
  const number = Number(value);
  if (!Number.isFinite(number) || (integer && !Number.isSafeInteger(number))) throw csvError(`Row ${line}: invalid ${label}.`);
  return number;
}

export function parseSalesCsv(text) {
  const rows = cells(text.replace(/^\uFEFF/, ""));
  if (rows.length < 2) throw csvError("CSV must contain a header and at least one sales row.");
  if (rows.length > 10001) throw csvError("Import at most 10,000 sales rows per file.");
  const header = rows[0].map((h) => h.trim().toLowerCase());
  if (new Set(header).size !== header.length) throw csvError("CSV has duplicate column names.");
  const missing = required.filter((h) => !header.includes(h));
  if (missing.length) throw csvError(`Missing CSV columns: ${missing.join(", ")}.`);
  const index = Object.fromEntries(header.map((h, i) => [h, i]));
  const seen = new Set();
  return rows.slice(1).map((cells, i) => {
    const line = i + 2;
    if (cells.length !== header.length) throw csvError(`Row ${line}: expected ${header.length} columns, found ${cells.length}.`);
    const get = (h) => (cells[index[h]] || "").trim();
    const sku = get("sku").toUpperCase(); const name = get("product_name"); const category = get("category");
    const storeId = index.store_id === undefined ? "DEFAULT" : (get("store_id").toUpperCase() || "DEFAULT");
    if (!sku || sku.length > 80 || !name || name.length > 160 || category.length > 100 || storeId.length > 80)
      throw csvError(`Row ${line}: SKU, product name, category or store ID is invalid.`);
    const date = dateValue(get("date"), line);
    const quantity = nonnegative(get("quantity_sold"), "quantity_sold", line, true);
    const revenue = nonnegative(get("revenue"), "revenue", line);
    const key = `${storeId}\0${sku}\0${date.toISOString()}`;
    if (seen.has(key)) throw csvError(`Row ${line}: duplicate store, SKU and date in this file.`);
    seen.add(key);
    return { date, sku, name, category, storeId, quantity, revenue };
  });
}
