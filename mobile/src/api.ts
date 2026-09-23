import * as SecureStore from 'expo-secure-store';

const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'https://stockguard-ai-ten.vercel.app/api').replace(/\/+$/, '');
const REFRESH_KEY = 'stockguard_refresh_token';

export type NotificationSettings = { uploadCompleted: boolean; lowStock: boolean; criticalInventory: boolean; forecastReady: boolean; weeklySummary: boolean; demandSpike: boolean; newLogin: boolean; email: boolean; push: boolean };
export type NotificationRecord = { id: string; type: 'upload_completed' | 'forecast_ready' | 'low_stock' | 'critical_inventory'; title: string; message: string; severity: 'info' | 'success' | 'warning' | 'critical'; link: string; readAt: string | null; createdAt: string; delivery: { email: { status: string; error?: string }; push: { status: string; error?: string } } };
export type User = {
  id: string; name: string; email: string; role: string; status?: string; lastLoginAt?: string | null; permissions?: string[]; permissionsCustomized?: boolean;
  preferences?: { notifications?: Partial<NotificationSettings>; theme?: 'dark' | 'system' };
  business: { id?: string; name: string; timezone?: string; currency: string } | null;
};
export type RecommendationRecord = { id: string; runId: string; type: string; risk: 'low' | 'medium' | 'high'; suggestedQuantity: number; currentStock: number; reorderPoint: number; targetStock: number; safetyStock: number; estimatedRevenue: number; daysOfCover: number | null; demandChangePercent: number; reason: string; status: 'open' | 'approved' | 'dismissed' | 'completed'; product?: { id: string; name: string; sku: string } | null; store?: { id: string; code: string; name: string } | null; createdAt: string };
export type Product = { id: string; name: string; sku: string; category: string; supplier: string; price: number; stock: number; reorder: number; leadTimeDays: number; status: string; recommendation?: Pick<RecommendationRecord, 'id' | 'type' | 'risk' | 'suggestedQuantity' | 'reason' | 'status'> | null };
export type Series = { storeId: string; storeCode: string; productId: string; sku: string; productName: string; observations: number; latestActualDate: string };
export type ForecastRun = { id: string; storeCode: string; sku: string; productName: string; model: string; modelVersion: string; modelSelection?: string | null; comparisonServiceVersion?: string | null; comparisons: { model: string; modelVersion: string; mae: number; rmse: number; selected: boolean; durationMs: number }[]; horizon: number; forecastTotal: number; forecastRevenue: number; revenueEstimate: { unitRevenue: number; source: string; forecastRevenue: number }; inventoryPlan: { currentStock: number; reservedStock: number; availableStock: number; leadTimeDays: number; safetyStockPercent: number; serviceLevelFactor: number; historicalAverageDailyDemand: number; demandStdDev: number; averageDailyDemand: number; demandChangePercent: number; demandSpike: boolean; leadTimeDemand: number; variabilitySafetyStock: number; policySafetyStock: number; safetyStock: number; reorderPoint: number; targetStock: number; recommendedOrderQuantity: number; daysOfCover: number | null; action: 'reorder' | 'overstock' | 'none'; risk: 'low' | 'medium' | 'high' } | null; recommendations: Pick<RecommendationRecord, 'id' | 'type' | 'risk' | 'suggestedQuantity' | 'reason' | 'status'>[]; recommendation: Pick<RecommendationRecord, 'id' | 'type' | 'risk' | 'suggestedQuantity' | 'reason' | 'status'> | null; latestActualDate: string; forecastStartDate: string; backtest: { observations: number; mae: number; rmse: number }; predictions: { date: string; forecast_sales: number; forecast_revenue: number }[] };
export type Overview = {
  period: { days: number; startDate: string | null; endDate: string | null; referenceDate?: string | null; recordedDays?: number };
  totals: { revenue: number; units: number; saleRecords: number; lowStockLocations: number; averageRecordedDayRevenue?: number };
  daily: { date: string; revenue: number; units: number; records?: number }[];
  categories: { name: string; revenue: number; units: number }[];
  productSales: { productId: string; name: string; sku: string; category?: string; revenue: number; units: number }[];
  inventory: { productId: string; name: string; sku: string; category?: string; store: string; stock: number; reorderPoint: number; lowStock: boolean }[];
  latestForecast: { productName: string; store?: string; model: string; forecastTotal: number; forecastRevenue: number; horizonDays: number; generatedAt?: string; inventoryPlan?: ForecastRun['inventoryPlan'] } | null;
  recommendations: RecommendationRecord[];
};
export type ImportRecord = { id: string; name: string; records: number; date: string; status: string; canDelete?: boolean };
export type ReportRecord = { id: string; name: string; type: 'sales' | 'inventory' | 'forecast'; format: string; days?: number; filename: string; sizeBytes: number; createdAt: string };
export type AdminUser = { id: string; name: string; email: string; role: string; status: string; lastLoginAt: string | null; createdAt: string; uploads: number; permissions: string[]; permissionsCustomized: boolean };
export type AuditEntry = { id: string; action: string; actorName: string; targetType: string; targetLabel: string; severity: string; createdAt: string };
export type SystemActivity = { generatedAt: string; users: { total: number; active: number; invited: number; suspended: number }; data: { products: number; sales: number; imports: number; importsToday: number; forecasts: number; forecastsToday: number; reports: number }; securityEvents: number; services: { mongodb: { state: string }; productionModel: { available: boolean; model?: string; version?: string }; pythonMl: { state: string; models?: string[] } }; recent: AuditEntry[] };
export type SettingsData = {
  notifications: NotificationSettings;
  theme: 'dark' | 'system';
  business: { safetyStockPercent: number; defaultLeadTimeDays: number; forecastHorizonDays: 7 | 14 | 28 | 30 };
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

export async function requestPasswordReset(email: string) {
  const response = await fetch(`${API_URL}/auth/password/forgot`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
  });
  return readResponse<{ message: string; delivery: 'email' | 'administrator' }>(response);
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
