import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Boxes,
  BrainCircuit,
  CalendarDays,
  ChevronRight,
  CircleAlert,
  PackageCheck,
  ShieldCheck,
  Sparkles,
  Store,
  TrendingUp,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const API_URL = import.meta.env.VITE_API_URL || "";
const staticStoreCache = new Map();

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

async function staticApi(path) {
  const cleanPath = path.split("?")[0];
  const directFiles = {
    "/health": "/data/health.json",
    "/api/model": "/data/model.json",
    "/api/stores": "/data/stores.json",
    "/api/top-forecasts": "/data/top-forecasts.json",
  };

  if (directFiles[cleanPath]) {
    return fetchJson(directFiles[cleanPath]);
  }

  const productMatch = cleanPath.match(/^\/api\/stores\/([^/]+)\/products$/);
  const forecastMatch = cleanPath.match(/^\/api\/forecast\/([^/]+)\/([^/]+)$/);
  const storeId = productMatch?.[1] || forecastMatch?.[1];
  if (!storeId) throw new Error("Unknown data request.");

  if (!staticStoreCache.has(storeId)) {
    staticStoreCache.set(
      storeId,
      fetchJson(`/data/forecasts/${storeId}.json`),
    );
  }
  const store = await staticStoreCache.get(storeId);

  if (productMatch) {
    return { store_id: storeId, products: Object.keys(store.products) };
  }

  const productId = forecastMatch[2];
  const saved = store.products[productId];
  if (!saved) throw new Error("No saved forecast exists for this series.");
  return {
    store_id: storeId,
    product_id: productId,
    model: saved.model,
    horizon: saved.predictions.length,
    forecast_total: saved.forecast_total,
    predictions: saved.predictions.map(([date, forecast_sales]) => ({
      date,
      forecast_sales,
    })),
  };
}

async function api(path) {
  if (!API_URL) return staticApi(path);
  const response = await fetch(API_URL + path);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }
  return response.json();
}

function formatNumber(value, digits = 0) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
  }).format(value || 0);
}

function shortDate(value) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
  }).format(new Date(value + "T00:00:00"));
}

function MetricCard({ icon: Icon, label, value, note, accent }) {
  return (
    <article className="metric-card">
      <div className={`metric-icon ${accent}`}><Icon size={20} /></div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{note}</span>
      </div>
    </article>
  );
}

export default function App() {
  const [health, setHealth] = useState(null);
  const [model, setModel] = useState(null);
  const [stores, setStores] = useState([]);
  const [products, setProducts] = useState([]);
  const [topForecasts, setTopForecasts] = useState([]);
  const [storeId, setStoreId] = useState("S0085");
  const [productId, setProductId] = useState("P0131");
  const [forecast, setForecast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api("/health"),
      api("/api/model"),
      api("/api/stores"),
      api("/api/top-forecasts?limit=5"),
    ])
      .then(([healthData, modelData, storeData, topData]) => {
        setHealth(healthData);
        setModel(modelData);
        setStores(storeData.stores);
        setTopForecasts(topData.items);
      })
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!storeId) return;
    api(`/api/stores/${storeId}/products`)
      .then((data) => {
        setProducts(data.products);
        if (!data.products.includes(productId)) {
          setProductId(data.products[0] || "");
        }
      })
      .catch((requestError) => setError(requestError.message));
  }, [storeId]);

  useEffect(() => {
    if (!storeId || !productId) return;
    setForecastLoading(true);
    setError("");
    api(`/api/forecast/${storeId}/${productId}`)
      .then(setForecast)
      .catch((requestError) => setError(requestError.message))
      .finally(() => setForecastLoading(false));
  }, [storeId, productId]);

  const stats = useMemo(() => {
    const values = forecast?.predictions?.map((item) => item.forecast_sales) || [];
    const total = forecast?.forecast_total || 0;
    const peak = values.length ? Math.max(...values) : 0;
    const average = values.length ? total / values.length : 0;
    const buffer = Math.ceil(total * 0.15);
    return { total, peak, average, buffer };
  }, [forecast]);

  const chartData = useMemo(
    () => (forecast?.predictions || []).map((item) => ({
      ...item,
      label: shortDate(item.date),
    })),
    [forecast],
  );

  function selectTop(item) {
    setStoreId(item.store_id);
    setProductId(item.product_id);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><ShieldCheck size={25} /></div>
          <div><strong>StockGuard</strong><span>AI demand intelligence</span></div>
        </div>
        <nav>
          <a className="active"><Activity size={18} />Overview</a>
          <a><Boxes size={18} />Forecasts</a>
          <a><Store size={18} />Stores</a>
          <a><BrainCircuit size={18} />Model</a>
        </nav>
        <div className="model-card">
          <div className="status-row">
            <span className="status-dot" />
            <span>Model online</span>
          </div>
          <strong>v{health?.model_version || "1.0.0"}</strong>
          <small>{model?.model_type?.replaceAll("_", " ") || "global xgboost"}</small>
        </div>
      </aside>

      <main>
        <header>
          <div>
            <p className="eyebrow">Inventory intelligence</p>
            <h1>Demand overview</h1>
            <p className="subtitle">Plan stock with a 28-day AI sales forecast.</p>
          </div>
          <div className="live-badge"><span /> Live API</div>
        </header>

        <section className="selector-panel">
          <div>
            <label htmlFor="store">Store</label>
            <select id="store" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
              {stores.map((store) => (
                <option key={store.store_id} value={store.store_id}>
                  {store.store_id} - {store.product_count} products
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="product">Product</label>
            <select id="product" value={productId} onChange={(e) => setProductId(e.target.value)}>
              {products.map((product) => <option key={product}>{product}</option>)}
            </select>
          </div>
          <div className="selection-copy">
            <span>Selected series</span>
            <strong>{storeId} / {productId}</strong>
          </div>
        </section>

        {error && <div className="error-banner"><CircleAlert size={18} />{error}</div>}

        <section className="metrics-grid">
          <MetricCard icon={TrendingUp} label="28-day demand" value={formatNumber(stats.total, 1)} note="forecast units" accent="mint" />
          <MetricCard icon={CalendarDays} label="Daily average" value={formatNumber(stats.average, 1)} note="units per day" accent="blue" />
          <MetricCard icon={Sparkles} label="Peak demand" value={formatNumber(stats.peak, 1)} note="highest forecast day" accent="amber" />
          <MetricCard icon={PackageCheck} label="Safety buffer" value={formatNumber(stats.buffer)} note="15% planning buffer" accent="violet" />
        </section>

        <section className="dashboard-grid">
          <article className="chart-card">
            <div className="section-heading">
              <div><p>Demand curve</p><h2>Next 28 days</h2></div>
              <div className="model-pill"><BrainCircuit size={15} />{forecast?.model || "xgboost"}</div>
            </div>
            <div className="chart-wrap">
              {forecastLoading || loading ? (
                <div className="loading">Loading forecast&</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 8, left: -16, bottom: 0 }}>
                    <defs>
                      <linearGradient id="demandFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#39d98a" stopOpacity={0.38} />
                        <stop offset="100%" stopColor="#39d98a" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#20352d" strokeDasharray="4 5" vertical={false} />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#82968e", fontSize: 11 }} interval={4} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: "#82968e", fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: "#10241c", border: "1px solid #29483b", borderRadius: 12 }} labelStyle={{ color: "#b8c8c1" }} />
                    <Area type="monotone" dataKey="forecast_sales" name="Forecast units" stroke="#39d98a" strokeWidth={2.5} fill="url(#demandFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </article>

          <article className="top-card">
            <div className="section-heading">
              <div><p>Network watch</p><h2>Highest demand</h2></div>
            </div>
            <div className="top-list">
              {topForecasts.map((item, index) => (
                <button key={item.store_id + item.product_id} onClick={() => selectTop(item)}>
                  <span className="rank">{String(index + 1).padStart(2, "0")}</span>
                  <span><strong>{item.product_id}</strong><small>{item.store_id}</small></span>
                  <b>{formatNumber(item.forecast_28_day_total, 1)}</b>
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>
          </article>
        </section>

        <section className="table-card">
          <div className="section-heading">
            <div><p>Forecast detail</p><h2>Daily plan</h2></div>
            <span className="accuracy">12.72% better MAE than baseline</span>
          </div>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Date</th><th>Day</th><th>Forecast sales</th><th>Demand level</th></tr></thead>
              <tbody>
                {chartData.map((item) => {
                  const level = item.forecast_sales >= stats.average * 1.2 ? "High" : item.forecast_sales <= stats.average * 0.8 ? "Low" : "Normal";
                  return (
                    <tr key={item.date}>
                      <td>{new Date(item.date + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}</td>
                      <td>{new Date(item.date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long" })}</td>
                      <td><strong>{formatNumber(item.forecast_sales, 1)}</strong> units</td>
                      <td><span className={`demand-tag ${level.toLowerCase()}`}>{level}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
