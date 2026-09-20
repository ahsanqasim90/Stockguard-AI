export const permissions = Object.freeze([
  "products.read", "products.write",
  "imports.read", "imports.write",
  "forecasts.read", "forecasts.run",
  "reports.read", "reports.create",
  "analytics.read", "settings.manage",
  "users.manage", "audit.read", "system.read",
]);

const operational = [
  "products.read", "products.write", "imports.read", "imports.write",
  "forecasts.read", "forecasts.run", "reports.read", "reports.create", "analytics.read",
];

export const rolePermissions = Object.freeze({
  owner: permissions,
  admin: permissions,
  manager: [...operational, "system.read"],
  analyst: operational,
  staff: ["products.read", "imports.read", "forecasts.read", "reports.read", "analytics.read"],
});

export function effectivePermissions(user) {
  if (user?.role === "owner") return [...permissions];
  if (user?.permissionsCustomized) return [...new Set(user.permissions || [])];
  return [...(rolePermissions[user?.role] || [])];
}

export function userCan(user, permission) {
  return effectivePermissions(user).includes(permission);
}
