import { useEffect, useState } from "react";
import { Activity, BarChart3, BrainCircuit, Download, FileBarChart, Package, TrendingUp } from "lucide-react";
import { CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiRequest } from "./auth";

const colors = ["#2f6df6", "#13c995", "#f5a524", "#9c6fff", "#22cbd0", "#f57c7c"];
const count = (value, digits = 0) => new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value || 0);
const money = (value) => `Rs ${count(value, 2)}`;

function useAnalytics(days, refreshKey = 0) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    apiRequest(`/analytics/overview?days=${days}`).then((result) => {
      if (active) { setData(result); setError(""); }
    }).catch((cause) => { if (active) setError(cause.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [days, refreshKey]);
  return { data, error, loading };
}

function Periods({ days, setDays }) {
  return <div className="sg-periods">{[[30, "30D"], [90, "90D"], [180, "6M"], [365, "1Y"]].map(([value, label]) =>
    <button type="button" key={value} className={days === value ? "active" : ""} onClick={() => setDays(value)}>{label}</button>)}</div>;
}

function Heading({ title, subtitle, days, setDays }) {
  return <div className="sg-page-heading"><div><h1>{title}</h1><p>{subtitle}</p></div><Periods days={days} setDays={setDays}/></div>;
}

function Stat({ Icon, value, label, tone = "blue" }) {
  return <article className="sg-stat"><span className={`sg-icon ${tone}`}><Icon/></span><div><strong>{value}</strong><p>{label}</p></div></article>;
}

function Title({ title, subtitle }) {
  return <div className="sg-card-title"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div></div>;
}

function Empty({ children }) { return <p className="sg-data-note">{children}</p>; }

function downloadFile(filename, content, mimeType) {
  const url = URL.createObjectURL(new Blob([content], { type: `${mimeType};charset=utf-8` }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function RevenueChart({ daily }) {
  if (!daily.length) return <Empty>Upload sales CSV data to see your recorded revenue trend.</Empty>;
  return <div className="sg-chart"><ResponsiveContainer><LineChart data={daily}>
    <CartesianGrid stroke="var(--grid)" vertical={false}/><XAxis dataKey="date" tickFormatter={(date) => date.slice(5)} minTickGap={24}/>
    <YAxis tickFormatter={(value) => count(value)}/><Tooltip formatter={(value) => money(value)}/>
    <Line dataKey="revenue" name="Recorded revenue" stroke="#2f6df6" strokeWidth={2} dot={false}/>
  </LineChart></ResponsiveContainer></div>;
}

function CategoryChart({ categories }) {
  if (!categories.length) return <Empty>Categories will appear after sales are uploaded.</Empty>;
  return <><div className="sg-donut"><ResponsiveContainer><PieChart><Pie data={categories} dataKey="revenue" nameKey="name" innerRadius={52} outerRadius={80}>
    {categories.map((category, index) => <Cell key={category.name} fill={colors[index % colors.length]}/>)}</Pie>
    <Tooltip formatter={(value) => money(value)}/></PieChart></ResponsiveContainer></div>
    <div className="sg-legend">{categories.map((category, index) => <span key={category.name}>
      <i style={{ background: colors[index % colors.length] }}/>{category.name}<b>{money(category.revenue)}</b>
    </span>)}</div></>;
}

export function ConnectedReportsPage() {
  const [days, setDays] = useState(180);
  const { data, error, loading } = useAnalytics(days);
  const [reports, setReports] = useState([]);
  const [reportError, setReportError] = useState("");
  const [busy, setBusy] = useState("");
  useEffect(() => { apiRequest("/reports").then((result) => setReports(result.reports)).catch((cause) => setReportError(cause.message)); }, []);
  async function generate(type) {
    setBusy(type); setReportError("");
    try {
      const result = await apiRequest("/reports", { method: "POST", body: JSON.stringify({ type, days }) });
      setReports((old) => [result.report, ...old].slice(0, 100));
      downloadFile(result.report.filename, result.content, result.mimeType);
    } catch (cause) { setReportError(cause.message); }
    finally { setBusy(""); }
  }
  async function download(id) {
    setBusy(id); setReportError("");
    try {
      const result = await apiRequest(`/reports/${id}`);
      downloadFile(result.report.filename, result.content, result.mimeType);
    } catch (cause) { setReportError(cause.message); }
    finally { setBusy(""); }
  }
  const period = data?.period;
  const totals = data?.totals;
  return <>
    <Heading title="Reports & analytics" subtitle={period?.referenceDate ? `Recorded sales: ${period.startDate} to ${period.endDate} · latest available date ${period.referenceDate}` : "Reports from your uploaded business data"} days={days} setDays={setDays}/>
    {(error || reportError) && <p role="alert" className="sg-data-error">{error || reportError}</p>}
    {loading ? <Empty>Loading business analytics...</Empty> : data && <>
      {!period.referenceDate && <Empty>No sales have been uploaded yet. Revenue and units will appear after your first CSV import.</Empty>}
      <section className="sg-stat-grid">
        <Stat Icon={TrendingUp} value={money(totals.revenue)} label="Recorded revenue"/>
        <Stat Icon={Package} value={count(totals.units)} label="Units sold" tone="teal"/>
        <Stat Icon={Activity} value={count(period.recordedDays)} label="Days with records" tone="violet"/>
        <Stat Icon={FileBarChart} value={money(totals.averageRecordedDayRevenue)} label="Average per recorded day" tone="amber"/>
      </section>
      <section className="sg-two-one"><article className="sg-card"><Title title="Revenue over time" subtitle="Actual sales only · no estimated profit"/><RevenueChart daily={data.daily}/></article>
        <article className="sg-card"><Title title="Revenue by category"/><CategoryChart categories={data.categories}/></article></section>
      {data.latestForecast && <><Title title="Latest AI decision support" subtitle={`${data.latestForecast.productName} at ${data.latestForecast.store} · ${data.latestForecast.horizonDays}-day plan`}/><section className="sg-stat-grid">
        <Stat Icon={TrendingUp} value={money(data.latestForecast.forecastRevenue)} label="Estimated forecast revenue" tone="teal"/>
        <Stat Icon={Package} value={count(data.latestForecast.forecastTotal, 1)} label="Forecast units"/>
        <Stat Icon={Activity} value={count(data.latestForecast.inventoryPlan?.recommendedOrderQuantity || 0)} label="Recommended order units" tone="amber"/>
        <Stat Icon={BrainCircuit} value={count(data.latestForecast.inventoryPlan?.targetStock || 0)} label="Target stock" tone="violet"/>
      </section></>}
    </>}
    <article className="sg-card"><Title title="Generate a report" subtitle="Saved snapshots can be downloaded again later"/>
      <div className="sg-report-types">{[[TrendingUp, "sales", "Sales", "Daily revenue, units and records · CSV"], [Package, "inventory", "Inventory", "Current stock by store and product · CSV"], [BrainCircuit, "forecast", "AI Forecast", "Latest business forecast and backtest · JSON"]].map(([Icon, type, title, description]) =>
        <div key={type}><span className="sg-icon blue"><Icon/></span><h3>{title} report</h3><p>{description}</p>
          <button className="sg-button secondary" type="button" disabled={Boolean(busy) || (type === "forecast" && !data?.latestForecast)} onClick={() => generate(type)}><Download/> {busy === type ? "Generating..." : "Generate & download"}</button></div>)}</div>
    </article>
    <article className="sg-card no-pad"><Title title="Saved reports"/><div className="sg-table-wrap"><table className="sg-table"><thead><tr><th>Report</th><th>Type</th><th>Generated</th><th>Format</th><th>Action</th></tr></thead>
      <tbody>{reports.map((report) => <tr key={report.id}><td><b>{report.name}</b></td><td>{report.type}</td><td>{new Date(report.createdAt).toLocaleString()}</td><td><span className="sg-chip">{report.format.toUpperCase()}</span></td><td><button className="sg-link" disabled={Boolean(busy)} onClick={() => download(report.id)}><Download/> Download</button></td></tr>)}
        {!reports.length && <tr><td colSpan="5">No saved reports yet.</td></tr>}</tbody></table></div></article>
  </>;
}

function Signal({ tone, label, title, copy }) {
  return <article className={`sg-insight ${tone}`}><label>{label}</label><h3>{title}</h3><p>{copy}</p></article>;
}

export function ConnectedInsightsPage() {
  const [days, setDays] = useState(180);
  const [refreshKey, setRefreshKey] = useState(0);
  const [actionError, setActionError] = useState("");
  const { data, error, loading } = useAnalytics(days, refreshKey);
  const risks = data?.inventory.filter((row) => row.lowStock) || [];
  const top = data?.productSales.slice(0, 5) || [];
  const topCategory = data?.categories[0];
  const lead = top[0];
  const forecast = data?.latestForecast;
  async function updateRecommendation(id, status) {
    try {
      await apiRequest(`/recommendations/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      setActionError(""); setRefreshKey((value) => value + 1);
    } catch (cause) { setActionError(cause.message); }
  }
  return <>
    <Heading title="Business intelligence insights" subtitle={data?.period.referenceDate ? `Based on actual sales through ${data.period.referenceDate} and current inventory` : "Signals from your sales and inventory"} days={days} setDays={setDays}/>
    {(error || actionError) && <p role="alert" className="sg-data-error">{error || actionError}</p>}
    {loading ? <Empty>Loading business insights...</Empty> : data && <>
      <section className="sg-insight-grid">
        <Signal tone={risks.length ? "red" : "green"} label="Inventory" title={`${risks.length} low-stock locations`} copy={risks.length ? `${risks.slice(0, 3).map((row) => `${row.name} at ${row.store}`).join(", ")}${risks.length > 3 ? " and more" : ""} are below their set reorder points.` : "No tracked stock location is below its reorder point."}/>
        <Signal tone="blue" label="Sales" title={lead ? `${lead.name} leads sales` : "No sales recorded"} copy={lead ? `${count(lead.units)} units and ${money(lead.revenue)} revenue in the selected period.` : "Upload sales CSV data to identify top products."}/>
        <Signal tone="amber" label="Category" title={topCategory ? `${topCategory.name} is the top category` : "Category data pending"} copy={topCategory ? `${money(topCategory.revenue)} recorded revenue across ${count(topCategory.units)} units.` : "Category revenue will be calculated from uploaded sales."}/>
        <Signal tone="teal" label="Coverage" title={`${data.period.recordedDays} days with sales records`} copy={data.period.referenceDate ? `The selected ${days}-day window ends on the latest recorded sale, ${data.period.referenceDate}. Days without records are not assumed to have zero sales.` : "No sales date is available yet."}/>
        <Signal tone="violet" label="Forecast" title={forecast ? `${count(forecast.forecastTotal, 1)} units · ${money(forecast.forecastRevenue)}` : "No business forecast yet"} copy={forecast ? `${forecast.productName} at ${forecast.store}: ${forecast.horizonDays} days from ${forecast.forecastStartDate}, using ${forecast.model}.` : "Run a forecast for a store and product with sufficient daily history."}/>
        <Signal tone={forecast?.inventoryPlan?.action === "reorder" ? "red" : "green"} label="Replenishment" title={forecast?.inventoryPlan?.action === "reorder" ? `Order ${count(forecast.inventoryPlan.recommendedOrderQuantity)} units` : forecast ? "Inventory plan is healthy" : "Plan pending"} copy={forecast?.inventoryPlan ? `Available ${count(forecast.inventoryPlan.availableStock)}, reorder point ${count(forecast.inventoryPlan.reorderPoint)}, target stock ${count(forecast.inventoryPlan.targetStock)}.` : "Run a forecast to calculate lead-time demand, safety stock and target inventory."}/>
      </section>
      <section className="sg-two-one"><article className="sg-card"><Title title="Recorded revenue trend" subtitle="Only dates present in uploaded sales"/><RevenueChart daily={data.daily}/></article>
        <article className="sg-card"><Title title="Revenue mix"/><CategoryChart categories={data.categories}/></article></section>
      <section className="sg-two-one"><article className="sg-card"><Title title="Top products by revenue"/>
        {top.length ? <div className="sg-analytics-list">{top.map((row, index) => <div key={row.productId}><b>{index + 1}</b><span>{row.name}<small>{count(row.units)} units</small></span><strong>{money(row.revenue)}</strong></div>)}</div> : <Empty>Top products will appear after sales are uploaded.</Empty>}</article>
        <article className="sg-card"><Title title="Inventory actions" subtitle="Current stock versus configured reorder points"/>
          {risks.length ? <div className="sg-analytics-list">{risks.slice(0, 5).map((row) => <div key={`${row.store}-${row.productId}`}><b>!</b><span>{row.name}<small>{row.store}</small></span><strong>{count(row.stock)} / {count(row.reorderPoint)}</strong></div>)}</div> : <Empty>No low-stock actions are currently identified.</Empty>}</article></section>
      <article className="sg-card"><Title title="Replenishment recommendations" subtitle="Forecast demand, safety stock and current inventory"/>
        {data.recommendations?.length ? <div className="sg-analytics-list">{data.recommendations.slice(0, 12).map((item) => <div key={item.id}><b>{item.risk === "high" ? "!" : "AI"}</b><span><strong>{item.productName} · {item.store}</strong><small>{item.reason}</small></span><strong>{item.suggestedQuantity ? `Order ${count(item.suggestedQuantity)}` : item.type.replaceAll("_", " ")}</strong>{item.status === "open" && <span className="sg-row-actions"><button onClick={() => updateRecommendation(item.id, "approved")}>Approve</button><button onClick={() => updateRecommendation(item.id, "dismissed")}>Dismiss</button><button onClick={() => updateRecommendation(item.id, "completed")}>Complete</button></span>}</div>)}</div> : <Empty>Run a forecast to generate replenishment recommendations.</Empty>}
      </article>
    </>}
  </>;
}
