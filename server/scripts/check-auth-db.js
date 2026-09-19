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

  console.log(`${remoteBaseUrl ? "Live" : "Local"} MongoDB authentication integration check PASSED`);
  console.log("Web and mobile login, protected route, refresh, and logout invalidation verified.");
} finally {
  const createdUser = await models.User.findOne({ email }).select("business").lean().catch(() => null);
  businessId ||= createdUser?.business;
  await models.User.deleteOne({ email }).catch(() => {});
  if (businessId) await models.Business.deleteOne({ _id: businessId }).catch(() => {});
  if (server) await new Promise((resolve) => server.close(resolve));
  await database.disconnectDatabase().catch(() => {});
}
