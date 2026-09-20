const defaultApiBase = import.meta.env.DEV ? "http://127.0.0.1:5000/api" : "/api";
const apiBase = (import.meta.env.VITE_API_URL || defaultApiBase).replace(/\/$/, "");
const sessionKey = "stockguard_session";

export function getSession() {
  try { return JSON.parse(localStorage.getItem(sessionKey)); } catch { return null; }
}

function saveSession(session) {
  localStorage.setItem(sessionKey, JSON.stringify(session));
  return session;
}

export function clearSession() { localStorage.removeItem(sessionKey); }

async function readResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `Request failed with status ${response.status}.`);
  return data;
}

async function refreshSession() {
  const response = await fetch(`${apiBase}/auth/refresh`, { method: "POST", credentials: "include" });
  return saveSession(await readResponse(response));
}

export async function apiRequest(path, options = {}, retry = true) {
  const session = getSession();
  const headers = { ...options.headers };
  if (options.body && !(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  if (session?.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;
  let response;
  try {
    response = await fetch(`${apiBase}${path}`, { ...options, headers, credentials: "include" });
  } catch {
    throw new Error("StockGuard API is not responding. Start the backend and check the API URL.");
  }
  if (response.status === 401 && retry && path !== "/auth/refresh") {
    try { await refreshSession(); return apiRequest(path, options, false); }
    catch { clearSession(); }
  }
  return readResponse(response);
}

export async function login(credentials) {
  return saveSession(await apiRequest("/auth/login", { method: "POST", body: JSON.stringify(credentials) }, false));
}

export async function register(account) {
  return saveSession(await apiRequest("/auth/register", { method: "POST", body: JSON.stringify(account) }, false));
}

export async function loadInvitation(token) {
  return apiRequest(`/auth/invitations/${encodeURIComponent(token)}`, {}, false);
}

export async function acceptInvitation(token, password) {
  return saveSession(await apiRequest(`/auth/invitations/${encodeURIComponent(token)}/accept`, {
    method: "POST", body: JSON.stringify({ password }),
  }, false));
}

export async function loadCurrentUser() {
  const data = await apiRequest("/auth/me");
  saveSession({ ...(getSession() || {}), user: data.user });
  return data.user;
}

export async function logout() {
  try { await apiRequest("/auth/logout", { method: "POST" }, false); }
  finally { clearSession(); }
}
