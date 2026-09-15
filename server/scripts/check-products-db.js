const remoteBaseUrl = process.env.STOCKGUARD_PRODUCTS_BASE_URL?.replace(/\/+$/, "") || "";
process.env.NODE_ENV = remoteBaseUrl ? "production" : "test";
const [{ default: app }, database, models] = await Promise.all([
  import("../src/app.js"), import("../src/config/database.js"), import("../src/models/index.js"),
]);

const email = `codex-products-test-${Date.now()}@example.com`;
const password = "Temporary-Test-Password-2026";
let businessId; let secondBusinessId; let server;
async function expect(response, status) {
  const body = await response.json().catch(() => ({}));
  if (response.status !== status) throw new Error(`Expected ${status}, received ${response.status}: ${body.message || ""}`);
  return body;
}

try {
  await database.connectDatabase();
  if (!remoteBaseUrl) server = app.listen(0);
  const base = remoteBaseUrl ? `${remoteBaseUrl}/api` : `http://127.0.0.1:${server.address().port}/api`;
  const account = await expect(await fetch(`${base}/auth/register`, { method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Temporary Products Test", businessName: "Temporary StockGuard Products", email, password }),
  }), 201);
  businessId = account.user.business.id;
  const headers = { authorization: `Bearer ${account.accessToken}` };
  await expect(await fetch(`${base}/products`), 401);
  await expect(await fetch(`${base}/products`, { headers }), 200);

  const created = await expect(await fetch(`${base}/products`, { method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ name: "Test Widget", sku: "TEST-001", category: "Food", stock: 12, reorder: 5, price: 100 }),
  }), 201);
  if (created.product.stock !== 12 || created.product.reorder !== 5) throw new Error("Inventory was not saved.");
  const second = await expect(await fetch(`${base}/auth/register`, { method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Second Temporary Test", businessName: "Second Temporary Workspace",
      email: `codex-products-other-${Date.now()}@example.com`, password }),
  }), 201);
  secondBusinessId = second.user.business.id;
  const secondHeaders = { authorization: `Bearer ${second.accessToken}` };
  const isolated = await expect(await fetch(`${base}/products`, { headers: secondHeaders }), 200);
  if (isolated.products.length) throw new Error("A different business could see these products.");
  await expect(await fetch(`${base}/products/${created.product.id}`, { method: "PATCH",
    headers: { ...secondHeaders, "content-type": "application/json" }, body: JSON.stringify({ stock: 999 }) }), 404);
  const changed = await expect(await fetch(`${base}/products/${created.product.id}`, { method: "PATCH",
    headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ stock: 3 }) }), 200);
  if (changed.product.stock !== 3 || changed.product.reorder !== 5) throw new Error("Product update lost inventory fields.");

  const invalid = new FormData(); invalid.append("file", new Blob(["date,sku\n2026-09-01,TEST-001\n"], { type: "text/csv" }), "bad.csv");
  await expect(await fetch(`${base}/imports/sales`, { method: "POST", headers, body: invalid }), 400);
  if (await models.Sale.countDocuments({ business: businessId })) throw new Error("Invalid CSV wrote sales records.");

  const csv = "date,product_name,sku,quantity_sold,revenue,category\n2026-09-01,Test Widget,TEST-001,2,200,Food\n2026-09-02,Test Widget,TEST-001,0,0,Food\n";
  const file = () => { const form = new FormData(); form.append("file", new Blob([csv], { type: "text/csv" }), "test-sales.csv"); return form; };
  const imported = await expect(await fetch(`${base}/imports/sales`, { method: "POST", headers, body: file() }), 201);
  if (imported.import.records !== 2) throw new Error("CSV record count was incorrect.");
  await expect(await fetch(`${base}/imports/sales`, { method: "POST", headers, body: file() }), 201);
  if (await models.Sale.countDocuments({ business: businessId }) !== 2) throw new Error("Repeated CSV import duplicated sales.");
  const history = await expect(await fetch(`${base}/imports`, { headers }), 200);
  if (history.imports.length !== 2) throw new Error("Import history was not saved.");

  await expect(await fetch(`${base}/products/${created.product.id}`, { method: "DELETE", headers }), 204);
  const list = await expect(await fetch(`${base}/products`, { headers }), 200);
  if (list.products.length !== 0) throw new Error("Deleted product remains active.");
  console.log(`${remoteBaseUrl ? "Live" : "Local"} StockGuard Products + CSV MongoDB integration PASSED`);
  console.log("Tenant auth, CRUD, inventory, invalid-file rejection, idempotent sales import, history and soft delete verified.");
} finally {
  for (const id of [businessId, secondBusinessId].filter(Boolean)) {
    const filter = { business: id };
    await Promise.all([models.Sale.deleteMany(filter), models.ImportBatch.deleteMany(filter),
      models.Inventory.deleteMany(filter), models.Product.deleteMany(filter), models.Store.deleteMany(filter),
      models.User.deleteMany(filter)]);
    await models.Business.deleteOne({ _id: id });
  }
  if (server) await new Promise((resolve) => server.close(resolve));
  await database.disconnectDatabase();
}
