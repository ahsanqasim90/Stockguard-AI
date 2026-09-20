import * as SecureStore from 'expo-secure-store';

const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'https://stockguard-ai-ten.vercel.app/api').replace(/\/+$/, '');
const REFRESH_KEY = 'stockguard_refresh_token';

export type NotificationSettings = { lowStock: boolean; forecastReady: boolean; weeklySummary: boolean; demandSpike: boolean; newLogin: boolean; email: boolean };
export type User = {
  id: string; name: string; email: string; role: string; status?: string; lastLoginAt?: string | null;
  preferences?: { notifications?: Partial<NotificationSettings>; theme?: 'dark' | 'system' };
  business: { id?: string; name: string; timezone?: string; currency: string } | null;
};
export type Product = { id: string; name: string; sku: string; category: string; supplier: string; price: number; stock: number; reorder: number; status: string };
export type Series = { storeId: string; storeCode: string; productId: string; sku: string; productName: string; observations: number; latestActualDate: string };
export type ForecastRun = { id: string; storeCode: string; sku: string; productName: string; model: string; modelVersion: string; modelSelection?: string | null; comparisonServiceVersion?: string | null; comparisons: { model: string; modelVersion: string; mae: number; rmse: number; selected: boolean; durationMs: number }[]; horizon: number; forecastTotal: number; latestActualDate: string; forecastStartDate: string; backtest: { observations: number; mae: number; rmse: number }; predictions: { date: string; forecast_sales: number }[] };
export type Overview = {
  period: { days: number; startDate: string | null; endDate: string | null; referenceDate?: string | null; recordedDays?: number };
  totals: { revenue: number; units: number; saleRecords: number; lowStockLocations: number; averageRecordedDayRevenue?: number };
  daily: { date: string; revenue: number; units: number; records?: number }[];
  categories: { name: string; revenue: number; units: number }[];
  productSales: { productId: string; name: string; sku: string; category?: string; revenue: number; units: number }[];
  inventory: { productId: string; name: string; sku: string; category?: string; store: string; stock: number; reorderPoint: number; lowStock: boolean }[];
  latestForecast: { productName: string; store?: string; model: string; forecastTotal: number; horizonDays: number; generatedAt?: string } | null;
};
export type ImportRecord = { id: string; name: string; records: number; date: string; status: string };
export type ReportRecord = { id: string; name: string; type: 'sales' | 'inventory' | 'forecast'; format: string; days?: number; filename: string; sizeBytes: number; createdAt: string };
export type AdminUser = { id: string; name: string; email: string; role: string; status: string; lastLoginAt: string | null; createdAt: string };
export type SettingsData = {
  notifications: NotificationSettings;
  theme: 'dark' | 'system';
  business: { safetyStockPercent: number; defaultLeadTimeDays: number; forecastHorizonDays: 7 | 14 | 28 };
};

type Session = { accessToken: string; refreshToken: string; user: User };
let accessToken: string | null = null;
let refreshInFlight: Promise<Session> | null = null;

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function readResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.message || `Request failed (${response.status}).`, response.status);
  return body as T;
}

async function saveSession(session: Session) {
  await SecureStore.setItemAsync(REFRESH_KEY, session.refreshToken);
  accessToken = session.accessToken;
  return session.user;
}

export async function login(email: string, password: string) {
  const response = await fetch(`${API_URL}/auth/mobile/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
  });
  return saveSession(await readResponse<Session>(response));
}

async function refresh() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const token = await SecureStore.getItemAsync(REFRESH_KEY);
    if (!token) throw new ApiError('Please sign in.', 401);
    const response = await fetch(`${API_URL}/auth/mobile/refresh`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: token }),
    });
    const session = await readResponse<Session>(response);
    await saveSession(session);
    return session;
  })();
  try { return await refreshInFlight; } finally { refreshInFlight = null; }
}

export async function restoreSession(): Promise<User | null> {
  if (!await SecureStore.getItemAsync(REFRESH_KEY)) return null;
  try { return (await refresh()).user; }
  catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      await SecureStore.deleteItemAsync(REFRESH_KEY);
      accessToken = null;
      return null;
    }
    throw error;
  }
}

export async function logout() {
  const token = await SecureStore.getItemAsync(REFRESH_KEY);
  accessToken = null;
  await SecureStore.deleteItemAsync(REFRESH_KEY);
  if (token) await fetch(`${API_URL}/auth/mobile/logout`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: token }),
  }).catch(() => {});
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!accessToken) await refresh();
  const send = () => fetch(`${API_URL}${path}`, {
    ...options, headers: { ...options.headers, Authorization: `Bearer ${accessToken}` },
  });
  let response = await send();
  if (response.status === 401) {
    await refresh();
    response = await send();
  }
  return readResponse<T>(response);
}

export function jsonBody(value: unknown, method: 'POST' | 'PATCH' = 'POST'): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) };
}
