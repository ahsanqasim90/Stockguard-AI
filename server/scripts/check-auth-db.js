const remoteBaseUrl = process.env.STOCKGUARD_AUTH_BASE_URL?.replace(/\/+$/, "") || "";
process.env.NODE_ENV = remoteBaseUrl ? "production" : "test";
if (remoteBaseUrl) {
  process.env.JWT_ACCESS_SECRET ||= "unused-by-remote-auth-integration-check";
  process.env.JWT_REFRESH_SECRET ||= "unused-by-remote-auth-integration-check";
}

const [{ default: app }, database, models] = await Promise.all([
  import("../src/app.js"),
  import("../src/config/database.js"),
  import("../src/models/index.js"),
]);

const email = `codex-auth-test-${Date.now()}@example.com`;
const password = "Temporary-Test-Password-2026";
let businessId;
let server;

function cookieFrom(response) {
  return (response.headers.get("set-cookie") || "").split(";")[0];
}

async function json(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status}: ${body.message || "request failed"}`);
  return body;
}

try {
  await database.connectDatabase();
  if (!remoteBaseUrl) server = app.listen(0);
  const baseUrl = remoteBaseUrl
    ? `${remoteBaseUrl}/api/auth`
    : `http://127.0.0.1:${server.address().port}/api/auth`;

  const registration = await fetch(`${baseUrl}/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Temporary Auth Test", businessName: "Temporary StockGuard Test", email, password }),
  });
  if (registration.status !== 201) throw new Error(`Expected registration 201, received ${registration.status}.`);
  const registrationBody = await json(registration);
  businessId = registrationBody.user.business.id;
  const refreshCookie = cookieFrom(registration);

  const profile = await fetch(`${baseUrl}/me`, { headers: { authorization: `Bearer ${registrationBody.accessToken}` } });
  if (profile.status !== 200) throw new Error(`Expected protected profile 200, received ${profile.status}.`);

  const refresh = await fetch(`${baseUrl}/refresh`, { method: "POST", headers: { cookie: refreshCookie } });
  if (refresh.status !== 200) throw new Error(`Expected refresh 200, received ${refresh.status}.`);
  const rotatedCookie = cookieFrom(refresh);

  const logout = await fetch(`${baseUrl}/logout`, { method: "POST", headers: { cookie: rotatedCookie } });
  if (logout.status !== 204) throw new Error(`Expected logout 204, received ${logout.status}.`);

  const expiredProfile = await fetch(`${baseUrl}/me`, { headers: { authorization: `Bearer ${registrationBody.accessToken}` } });
  if (expiredProfile.status !== 401) throw new Error("Logout did not invalidate the earlier access session.");

  const login = await fetch(`${baseUrl}/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (login.status !== 200) throw new Error(`Expected login 200, received ${login.status}.`);

  const mobileLogin = await fetch(`${baseUrl}/mobile/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (mobileLogin.status !== 200 || mobileLogin.headers.get("set-cookie"))
    throw new Error("Mobile login should return 200 without a browser cookie.");
  const mobileSession = await json(mobileLogin);
  if (!mobileSession.accessToken || !mobileSession.refreshToken) throw new Error("Mobile tokens are missing.");

  const mobileRefresh = await fetch(`${baseUrl}/mobile/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken: mobileSession.refreshToken }),
  });
  if (mobileRefresh.status !== 200) throw new Error(`Expected mobile refresh 200, received ${mobileRefresh.status}.`);
  const refreshedMobileSession = await json(mobileRefresh);
  const mobileProfile = await fetch(`${baseUrl}/me`, { headers: { authorization: `Bearer ${refreshedMobileSession.accessToken}` } });
  if (mobileProfile.status !== 200) throw new Error("Refreshed mobile access token was rejected.");

  const mobileLogout = await fetch(`${baseUrl}/mobile/logout`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken: refreshedMobileSession.refreshToken }),
  });
  if (mobileLogout.status !== 204) throw new Error(`Expected mobile logout 204, received ${mobileLogout.status}.`);
  const revokedMobileProfile = await fetch(`${baseUrl}/me`, { headers: { authorization: `Bearer ${refreshedMobileSession.accessToken}` } });
  if (revokedMobileProfile.status !== 401) throw new Error("Mobile logout did not invalidate the access token.");

  const recoveryLogin = await fetch(`${baseUrl}/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const recoverySession = await json(recoveryLogin);
  const apiRoot = baseUrl.replace(/\/auth$/, "");
  const resetLinkResponse = await fetch(`${apiRoot}/admin/users/${registrationBody.user.id}/password-reset`, {
    method: "POST",
    headers: { authorization: `Bearer ${recoverySession.accessToken}` },
  });
  if (resetLinkResponse.status !== 201) throw new Error(`Expected password reset link 201, received ${resetLinkResponse.status}.`);
  const resetLinkBody = await json(resetLinkResponse);
  const resetToken = new URL(resetLinkBody.reset.resetUrl).pathname.split("/").filter(Boolean).at(-1);
  const inspectReset = await fetch(`${baseUrl}/password/reset/${encodeURIComponent(resetToken)}`);
  if (inspectReset.status !== 200) throw new Error("Password reset link could not be inspected.");
  const newPassword = "Updated-Test-Password-2026";
  const completeReset = await fetch(`${baseUrl}/password/reset/${encodeURIComponent(resetToken)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: newPassword }),
  });
  if (completeReset.status !== 200) throw new Error(`Expected password reset 200, received ${completeReset.status}.`);
  const reusedReset = await fetch(`${baseUrl}/password/reset/${encodeURIComponent(resetToken)}`);
  if (reusedReset.status !== 410) throw new Error("A used password reset link was accepted twice.");
  const oldPasswordLogin = await fetch(`${baseUrl}/login`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }),
  });
  if (oldPasswordLogin.status !== 401) throw new Error("The previous password still works after reset.");
  const newPasswordLogin = await fetch(`${baseUrl}/login`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: newPassword }),
  });
  if (newPasswordLogin.status !== 200) throw new Error("The new password was rejected after reset.");

  console.log(`${remoteBaseUrl ? "Live" : "Local"} MongoDB authentication integration check PASSED`);
  console.log("Web/mobile sessions, logout invalidation, one-time password recovery and session revocation verified.");
} finally {
  const createdUser = await models.User.findOne({ email }).select("business").lean().catch(() => null);
  businessId ||= createdUser?.business;
  await models.User.deleteOne({ email }).catch(() => {});
  if (businessId) await Promise.all([
    models.PasswordReset.deleteMany({ business: businessId }),
    models.AuditLog.deleteMany({ business: businessId }),
    models.Business.deleteOne({ _id: businessId }),
  ]).catch(() => {});
  if (server) await new Promise((resolve) => server.close(resolve));
  await database.disconnectDatabase().catch(() => {});
}
