import { useEffect, useMemo, useState } from "react";
import {
  Activity, Boxes, BrainCircuit, CalendarDays, ChevronRight, CircleAlert,
  CircleCheck, Gauge, PackageCheck, Search, ShieldAlert, ShieldCheck,
  Sparkles, Store, TrendingUp, Warehouse,
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import LandingPage from "./LandingPage";

const API_URL = import.meta.env.VITE_API_URL || "";
const staticStoreCache = new Map();

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
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
  if (directFiles[cleanPath]) return fetchJson(directFiles[cleanPath]);

  const productMatch = cleanPath.match(/^\/api\/stores\/([^/]+)\/products$/);
  const forecastMatch = cleanPath.match(/^\/api\/forecast\/([^/]+)\/([^/]+)$/);
  const storeId = productMatch?.[1] || forecastMatch?.[1];
  if (!storeId) throw new Error("Unknown data request.");
  if (!staticStoreCache.has(storeId)) {
    staticStoreCache.set(storeId, fetchJson(`/data/forecasts/${storeId}.json`));
  }
  const store = await staticStoreCache.get(storeId);
  if (productMatch) return { store_id: storeId, products: Object.keys(store.products) };

  const productId = forecastMatch[2];
  const saved = store.products[productId];
  if (!saved) throw new Error("No saved forecast exists for this series.");
  return {
    store_id: storeId,
    product_id: productId,
    model: saved.model,
    horizon: saved.predictions.length,
    forecast_total: saved.forecast_total,
    predictions: saved.predictions.map(([date, forecast_sales]) => ({ date, forecast_sales })),
  };
}

async function api(path) {
  if (!API_URL) return staticApi(path);
  const response = await fetch(API_URL + path);
  if (!response.ok) throw new Error((await response.text()) || `Request failed: ${response.status}`);
  return response.json();
}

function formatNumber(value, digits = 0) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value || 0);
}

function shortDate(value) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" })
    .format(new Date(`${value}T00:00:00`));
}

function MetricCard({ icon: Icon, label, value, note, accent }) {
  return <article className="metric-card"><div className={`metric-icon ${accent}`}><Icon size={20} /></div><div><p>{label}</p><strong>{value}</strong><span>{note}</span></div></article>;
}

function SelectorPanel({ stores, products, storeId, productId, setStoreId, setProductId }) {
  return <section className="selector-panel"><div><label htmlFor="store">Store</label><select id="store" value={storeId} onChange={(event) => setStoreId(event.target.value)}>{stores.map((store) => <option key={store.store_id} value={store.store_id}>{store.store_id} - {store.product_count} products</option>)}</select></div><div><label htmlFor="product">Product</label><select id="product" value={productId} onChange={(event) => setProductId(event.target.value)}>{products.map((product) => <option key={product}>{product}</option>)}</select></div><div className="selection-copy"><span>Selected series</span><strong>{storeId} / {productId}</strong></div></section>;
}

function DemandChart({ chartData, forecast, loading, large = false }) {
  return <article className={`chart-card ${large ? "chart-card-large" : ""}`}><div className="section-heading"><div><p>Demand curve</p><h2>Next 28 days</h2></div><div className="model-pill"><BrainCircuit size={15} />{forecast?.model || "xgboost"}</div></div><div className="chart-wrap">{loading ? <div className="loading">Loading forecast...</div> : <ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 10, right: 8, left: -16, bottom: 0 }}><defs><linearGradient id="demandFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#39d98a" stopOpacity={0.38} /><stop offset="100%" stopColor="#39d98a" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid stroke="#20352d" strokeDasharray="4 5" vertical={false} /><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#82968e", fontSize: 11 }} interval={4} /><YAxis axisLine={false} tickLine={false} tick={{ fill: "#82968e", fontSize: 11 }} /><Tooltip contentStyle={{ background: "#10241c", border: "1px solid #29483b", borderRadius: 12 }} labelStyle={{ color: "#b8c8c1" }} /><Area type="monotone" dataKey="forecast_sales" name="Forecast units" stroke="#39d98a" strokeWidth={2.5} fill="url(#demandFill)" /></AreaChart></ResponsiveContainer>}</div></article>;
}

function DailyTable({ chartData, average }) {
  return <section className="table-card"><div className="section-heading"><div><p>Forecast detail</p><h2>Daily plan</h2></div><span className="accuracy">12.72% better MAE than baseline</span></div><div className="table-scroll"><table><thead><tr><th>Date</th><th>Day</th><th>Forecast sales</th><th>Demand level</th></tr></thead><tbody>{chartData.map((item) => { const level = item.forecast_sales >= average * 1.2 ? "High" : item.forecast_sales <= average * 0.8 ? "Low" : "Normal"; const date = new Date(`${item.date}T00:00:00`); return <tr key={item.date}><td>{date.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}</td><td>{date.toLocaleDateString("en-GB", { weekday: "long" })}</td><td><strong>{formatNumber(item.forecast_sales, 1)}</strong> units</td><td><span className={`demand-tag ${level.toLowerCase()}`}>{level}</span></td></tr>; })}</tbody></table></div></section>;
}

const PAGE_COPY = {
  overview: ["Inventory intelligence", "Demand overview", "Plan stock with a 28-day AI sales forecast."],
  forecasts: ["Forecast explorer", "Forecasts", "Inspect daily demand for every store and product series."],
  inventory: ["Replenishment planning", "Inventory planner", "Turn forecast demand into an actionable stock order."],
  stores: ["Network coverage", "Stores", "Review forecast coverage across the retail network."],
  model: ["Model governance", "Model performance", "Review training, validation and production model details."],
};

export function DashboardApp() {
  const [activePage, setActivePage] = useState("overview");
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
  const [storeSearch, setStoreSearch] = useState("");
  const [currentStock, setCurrentStock] = useState(1000);
  const [leadTime, setLeadTime] = useState(7);

  useEffect(() => {
    Promise.all([api("/health"), api("/api/model"), api("/api/stores"), api("/api/top-forecasts?limit=5")])
      .then(([healthData, modelData, storeData, topData]) => { setHealth(healthData); setModel(modelData); setStores(storeData.stores); setTopForecasts(topData.items); })
      .catch((requestError) => setError(requestError.message)).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!storeId) return;
    api(`/api/stores/${storeId}/products`).then((data) => { setProducts(data.products); if (!data.products.includes(productId)) setProductId(data.products[0] || ""); }).catch((requestError) => setError(requestError.message));
  }, [storeId]);

  useEffect(() => {
    if (!storeId || !productId) return;
    setForecastLoading(true); setError("");
    api(`/api/forecast/${storeId}/${productId}`).then(setForecast).catch((requestError) => setError(requestError.message)).finally(() => setForecastLoading(false));
  }, [storeId, productId]);

  const stats = useMemo(() => { const values = forecast?.predictions?.map((item) => item.forecast_sales) || []; const total = forecast?.forecast_total || 0; const peak = values.length ? Math.max(...values) : 0; const average = values.length ? total / values.length : 0; return { total, peak, average, buffer: Math.ceil(total * 0.15) }; }, [forecast]);
  const chartData = useMemo(() => (forecast?.predictions || []).map((item) => ({ ...item, label: shortDate(item.date) })), [forecast]);
  const filteredStores = useMemo(() => stores.filter((store) => store.store_id.toLowerCase().includes(storeSearch.toLowerCase())), [stores, storeSearch]);
  const maxProducts = useMemo(() => Math.max(...stores.map((store) => store.product_count), 1), [stores]);
  const coverageSeries = stores.reduce((total, store) => total + store.product_count, 0);
  const reorderPoint = Math.ceil(stats.average * leadTime + stats.buffer);
  const targetStock = Math.ceil(stats.total + stats.buffer);
  const suggestedOrder = Math.max(0, targetStock - Number(currentStock || 0));
  const stockRisk = Number(currentStock) < reorderPoint ? "High" : Number(currentStock) < stats.total ? "Medium" : "Low";
  const selectors = <SelectorPanel {...{ stores, products, storeId, productId, setStoreId, setProductId }} />;
  const metrics = <section className="metrics-grid"><MetricCard icon={TrendingUp} label="28-day demand" value={formatNumber(stats.total, 1)} note="forecast units" accent="mint" /><MetricCard icon={CalendarDays} label="Daily average" value={formatNumber(stats.average, 1)} note="units per day" accent="blue" /><MetricCard icon={Sparkles} label="Peak demand" value={formatNumber(stats.peak, 1)} note="highest forecast day" accent="amber" /><MetricCard icon={PackageCheck} label="Safety buffer" value={formatNumber(stats.buffer)} note="15% planning buffer" accent="violet" /></section>;

  let pageContent;
  if (activePage === "forecasts") {
    pageContent = <>{selectors}{metrics}<DemandChart chartData={chartData} forecast={forecast} loading={loading || forecastLoading} large /><DailyTable chartData={chartData} average={stats.average} /></>;
  } else if (activePage === "inventory") {
    pageContent = <>{selectors}<section className="planner-grid"><article className="planning-form panel-card"><div className="section-heading"><div><p>Planning inputs</p><h2>Stock position</h2></div><Warehouse size={22} /></div><label>Current stock<input type="number" min="0" value={currentStock} onChange={(event) => setCurrentStock(event.target.value)} /></label><label>Supplier lead time<div className="input-with-unit"><input type="number" min="1" max="90" value={leadTime} onChange={(event) => setLeadTime(Number(event.target.value))} /><span>days</span></div></label><small>Safety stock uses 15% of the selected series' 28-day demand.</small></article><article className="recommendation-card"><div className="recommendation-icon"><PackageCheck size={26} /></div><p>Recommended order</p><strong>{formatNumber(suggestedOrder)}</strong><span>units</span><div className="recommendation-meta"><span>Target stock <b>{formatNumber(targetStock)}</b></span><span>Reorder point <b>{formatNumber(reorderPoint)}</b></span></div></article></section><section className="metrics-grid inventory-metrics"><MetricCard icon={Warehouse} label="Current stock" value={formatNumber(currentStock)} note="entered inventory" accent="blue" /><MetricCard icon={Gauge} label="Reorder point" value={formatNumber(reorderPoint)} note={`${leadTime}-day lead time + buffer`} accent="amber" /><MetricCard icon={Boxes} label="Target stock" value={formatNumber(targetStock)} note="demand plus safety stock" accent="mint" /><MetricCard icon={stockRisk === "High" ? ShieldAlert : CircleCheck} label="Stockout risk" value={stockRisk} note="based on reorder threshold" accent={stockRisk === "High" ? "amber" : "violet"} /></section></>;
  } else if (activePage === "stores") {
    pageContent = <><section className="metrics-grid network-metrics"><MetricCard icon={Store} label="Forecast stores" value={formatNumber(stores.length)} note="covered locations" accent="mint" /><MetricCard icon={Boxes} label="Forecast series" value={formatNumber(coverageSeries)} note="store-product pairs" accent="blue" /><MetricCard icon={TrendingUp} label="Average coverage" value={formatNumber(coverageSeries / Math.max(stores.length, 1), 1)} note="products per store" accent="violet" /><MetricCard icon={CircleCheck} label="Data status" value="Ready" note="production forecast bundle" accent="amber" /></section><section className="table-card stores-card"><div className="section-heading"><div><p>Store directory</p><h2>Forecast coverage</h2></div><label className="search-box"><Search size={16} /><input placeholder="Search store" value={storeSearch} onChange={(event) => setStoreSearch(event.target.value)} /></label></div><div className="table-scroll"><table><thead><tr><th>Store</th><th>Products covered</th><th>Coverage</th><th>Action</th></tr></thead><tbody>{filteredStores.map((store) => <tr key={store.store_id}><td><strong>{store.store_id}</strong></td><td>{store.product_count}</td><td><div className="coverage-bar"><span style={{ width: `${store.product_count / maxProducts * 100}%` }} /></div></td><td><button className="text-button" onClick={() => { setStoreId(store.store_id); setActivePage("forecasts"); }}>View forecast <ChevronRight size={14} /></button></td></tr>)}</tbody></table></div></section></>;
  } else if (activePage === "model") {
    const backtest = model?.three_fold_recursive_backtest || {};
    pageContent = <><section className="model-hero panel-card"><div className="model-orb"><BrainCircuit size={32} /></div><div><p>Production model</p><h2>{model?.model_type?.replaceAll("_", " ") || "Global XGBoost"}</h2><span>Version {model?.model_version || "1.0.0"} · trained on {formatNumber(model?.training_rows)} rows</span></div><span className="ready-pill"><CircleCheck size={15} /> Production ready</span></section><section className="metrics-grid"><MetricCard icon={Gauge} label="XGBoost MAE" value={formatNumber(backtest.xgboost_mae, 3)} note="3-fold recursive backtest" accent="mint" /><MetricCard icon={TrendingUp} label="MAE improvement" value={`${formatNumber(backtest.mae_improvement_percent, 2)}%`} note="against seasonal baseline" accent="blue" /><MetricCard icon={Boxes} label="Series evaluated" value={formatNumber(model?.forecastable_series)} note="production forecast series" accent="violet" /><MetricCard icon={CalendarDays} label="Forecast horizon" value={`${model?.forecast_horizon_days || 28} days`} note={`starts ${model?.forecast_start_date || "2019-11-01"}`} accent="amber" /></section><section className="model-details"><article className="panel-card"><div className="section-heading"><div><p>Input schema</p><h2>Model features</h2></div></div><div className="feature-list">{model?.feature_columns?.map((feature) => <span key={feature}>{feature.replaceAll("_", " ")}</span>)}</div></article><article className="panel-card"><div className="section-heading"><div><p>Production policy</p><h2>Prediction routing</h2></div></div><div className="policy-row"><span>Default model</span><strong>{model?.production_policy?.default_model || "xgboost"}</strong></div><div className="policy-row"><span>Fallback model</span><strong>{model?.production_policy?.fallback_model || "seasonal naive"}</strong></div><div className="policy-row"><span>Training device</span><strong>{model?.training_device || "cuda:0"}</strong></div></article></section></>;
  } else {
    pageContent = <>{selectors}{metrics}<section className="dashboard-grid"><DemandChart chartData={chartData} forecast={forecast} loading={loading || forecastLoading} /><article className="top-card"><div className="section-heading"><div><p>Network watch</p><h2>Highest demand</h2></div></div><div className="top-list">{topForecasts.map((item, index) => <button key={item.store_id + item.product_id} onClick={() => { setStoreId(item.store_id); setProductId(item.product_id); }}><span className="rank">{String(index + 1).padStart(2, "0")}</span><span><strong>{item.product_id}</strong><small>{item.store_id}</small></span><b>{formatNumber(item.forecast_28_day_total, 1)}</b><ChevronRight size={16} /></button>)}</div></article></section></>;
  }

  const [eyebrow, title, subtitle] = PAGE_COPY[activePage];
  const navItems = [["overview", Activity, "Overview"], ["forecasts", Boxes, "Forecasts"], ["inventory", Warehouse, "Inventory"], ["stores", Store, "Stores"], ["model", BrainCircuit, "Model"]];
  return <div className="app-shell"><aside className="sidebar"><div className="brand"><div className="brand-mark"><ShieldCheck size={25} /></div><div><strong>StockGuard</strong><span>AI demand intelligence</span></div></div><nav>{navItems.map(([id, Icon, label]) => <button key={id} className={activePage === id ? "active" : ""} onClick={() => setActivePage(id)}><Icon size={18} />{label}</button>)}</nav><div className="model-card"><div className="status-row"><span className="status-dot" /><span>Model online</span></div><strong>v{health?.model_version || "1.0.0"}</strong><small>{model?.model_type?.replaceAll("_", " ") || "global xgboost"}</small></div></aside><main><header><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="subtitle">{subtitle}</p></div><div className="live-badge"><span /> Model ready</div></header>{error && <div className="error-banner"><CircleAlert size={18} />{error}</div>}{pageContent}</main></div>;
}

export default function App() {
  return window.location.pathname.startsWith("/dashboard") ? <DashboardApp /> : <LandingPage />;
}
