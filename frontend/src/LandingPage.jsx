import { useState } from "react";
import {
  Activity, ArrowRight, BarChart3, BellRing, BrainCircuit, Check,
  ChevronRight, CircleGauge, Database, FileUp, Layers3, LockKeyhole,
  Menu, PackageCheck, Play, ShieldCheck, Sparkles, TrendingUp, Users,
  Warehouse, X,
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis,
} from "recharts";
import "./landing.css";

const previewData = [
  { month: "Jun", actual: 42, forecast: 44 },
  { month: "Jul", actual: 48, forecast: 47 },
  { month: "Aug", actual: 45, forecast: 46 },
  { month: "Sep", actual: 53, forecast: 52 },
  { month: "Oct", actual: 58, forecast: 57 },
  { month: "Nov", forecast: 65 },
  { month: "Dec", forecast: 73 },
];

const capabilities = [
  [BrainCircuit, "AI demand forecasting", "A production XGBoost model turns sales history into a practical 28-day demand plan."],
  [TrendingUp, "Product-level analytics", "Inspect daily demand, peak days and trends for every supported store-product series."],
  [Warehouse, "Smart inventory", "Convert forecasts into reorder points, safety stock and recommended order quantities."],
  [BarChart3, "Decision dashboards", "Clear KPIs, charts and tables make model output useful to owners and operations teams."],
  [LockKeyhole, "Role-based security", "The MERN application will protect business data with JWT authentication and access roles."],
  [FileUp, "CSV data workflow", "Upload historical sales, validate the file and prepare structured data for forecasting."],
];

const faqItems = [
  ["Is the forecasting model already trained?", "Yes. The current XGBoost production model was trained on 8.17 million feature rows and validated across three recursive backtest folds."],
  ["What technology stack does StockGuard AI use?", "The proposal architecture uses React, Node.js, Express and MongoDB, with a separate Python machine-learning service. The mobile application will use React Native."],
  ["Can I import existing sales data?", "CSV upload and validation are part of the planned MERN application workflow. The current live demo uses the verified retail dataset and exported model forecasts."],
  ["How does inventory planning work?", "The dashboard combines forecast demand, supplier lead time and a safety buffer to calculate reorder points and suggested order quantities."],
  ["Does it support multiple stores and products?", "Yes. The current forecast bundle covers 137 stores and 11,626 eligible store-product series."],
  ["Are these live business forecasts?", "The demo dataset ends on 31 October 2019. Live forecasts will begin when a business uploads current sales and inventory data."],
];

function Brand() {
  return <a className="landing-brand" href="#top" aria-label="StockGuard AI home"><span><Activity size={19} /></span><b>StockGuard <em>AI</em></b></a>;
}

function MiniDashboard({ expanded = false }) {
  return <div className={`mini-dashboard ${expanded ? "expanded" : ""}`}>
    <div className="browser-bar"><i /><i /><i /><span>app.stockguard.ai/dashboard</span><a href="/dashboard">Open live <ArrowRight size={13} /></a></div>
    <div className="mini-kpis">
      <div><span>28-day demand</span><strong>1,830.8</strong><small>units forecast</small></div>
      <div><span>Daily average</span><strong>65.4</strong><small>units per day</small></div>
      <div><span>Safety buffer</span><strong>275</strong><small>recommended units</small></div>
      <div><span>Model MAE</span><strong>0.575</strong><small>3-fold backtest</small></div>
    </div>
    <div className="mini-lower">
      <div className="mini-chart"><div className="mini-title"><b>Demand forecast</b><span>Next 28 days</span></div><ResponsiveContainer width="100%" height="100%"><AreaChart data={previewData} margin={{ top: 12, right: 4, bottom: 0, left: -28 }}><defs><linearGradient id={expanded ? "landingFillLarge" : "landingFill"} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2f73ff" stopOpacity=".34" /><stop offset="1" stopColor="#2f73ff" stopOpacity="0" /></linearGradient></defs><CartesianGrid stroke="#23304a" strokeDasharray="3 4" vertical={false} /><XAxis dataKey="month" tick={{ fill: "#64728b", fontSize: 9 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: "#64728b", fontSize: 9 }} axisLine={false} tickLine={false} /><Area type="monotone" dataKey="forecast" stroke="#2f73ff" strokeWidth={2.5} fill={`url(#${expanded ? "landingFillLarge" : "landingFill"})`} connectNulls /><Area type="monotone" dataKey="actual" stroke="#21d49b" strokeWidth={2} fill="transparent" /></AreaChart></ResponsiveContainer></div>
      <div className="mini-insights"><b>AI recommendations</b><p><i className="red" />Restock P0131 at S0085</p><p><i className="amber" />Sunday demand peak expected</p><p><i className="green" />XGBoost model ready</p></div>
    </div>
  </div>;
}

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  return <div className="landing" id="top">
    <header className="landing-nav"><Brand /><nav className={menuOpen ? "open" : ""} aria-label="Primary navigation"><a href="#features" onClick={() => setMenuOpen(false)}>Features</a><a href="#workflow" onClick={() => setMenuOpen(false)}>How it works</a><a href="#technology" onClick={() => setMenuOpen(false)}>Technology</a><a href="#faq" onClick={() => setMenuOpen(false)}>FAQ</a></nav><div className="landing-nav-actions"><a className="nav-ghost" href="/dashboard">Dashboard</a><a className="nav-primary" href="/dashboard">Open Demo <ArrowRight size={15} /></a></div><button className="menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle navigation">{menuOpen ? <X /> : <Menu />}</button></header>

    <main>
      <section className="landing-hero"><div className="hero-glow" /><div className="hero-copy"><div className="landing-pill"><Sparkles size={14} /> Powered by machine learning</div><h1>Predict tomorrow's <span>business demand</span> today.</h1><p>StockGuard AI helps SMEs forecast sales, plan inventory and make faster decisions using a validated machine-learning model.</p><div className="hero-actions"><a className="primary-cta" href="/dashboard">Explore live dashboard <ArrowRight size={17} /></a><a className="secondary-cta" href="#workflow"><Play size={16} /> See how it works</a></div><div className="hero-stats"><div><strong>12.72%</strong><span>MAE improvement</span></div><div><strong>11,626</strong><span>forecast series</span></div><div><strong>8.17M</strong><span>training rows</span></div></div></div><div className="hero-visual"><MiniDashboard /><span className="floating-accuracy"><Activity size={14} /> Production model ready</span></div></section>

      <section className="technology-strip" aria-label="Technology stack"><p>BUILT ON THE PROPOSAL'S REQUIRED ARCHITECTURE</p><div><span>React</span><span>Node.js</span><span>Express</span><span>MongoDB</span><span>Python ML</span></div></section>

      <section className="landing-section" id="features"><div className="section-intro"><span>Why StockGuard AI</span><h2>The intelligence your business <em>was missing</em></h2><p>Forecast demand and turn it into concrete inventory actions from one clean workspace.</p></div><div className="capability-grid">{capabilities.map(([Icon, title, copy], index) => <article key={title}><div className={`capability-icon tone-${index % 4}`}><Icon size={21} /></div><h3>{title}</h3><p>{copy}</p></article>)}</div></section>

      <section className="landing-section suite-section"><div className="section-intro"><span>Full feature suite</span><h2>Everything you need to <em>plan smarter</em></h2></div><div className="suite-grid"><div className="suite-list">{[
        ["Multi-store forecasting", "Explore 28-day demand across every supported store and product."],
        ["Inventory recommendations", "Calculate target stock, reorder points and safety buffers."],
        ["Role-based access", "Separate owner, manager and staff permissions with JWT."],
        ["Automated notifications", "Surface low stock, demand spikes and model events."],
        ["Export and reporting", "Prepare forecast and inventory reports for operational use."],
      ].map(([title, copy]) => <article key={title}><span><Check size={15} /></span><div><h3>{title}</h3><p>{copy}</p></div></article>)}</div><div className="suite-chart"><div className="suite-chart-title"><span>Demand forecast vs actual</span><small>Validated model</small></div><div className="suite-chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={previewData}><CartesianGrid stroke="#202b41" strokeDasharray="3 4" vertical={false} /><XAxis dataKey="month" tick={{ fill: "#66738d", fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: "#66738d", fontSize: 10 }} axisLine={false} tickLine={false} /><Area type="monotone" dataKey="actual" stroke="#2f73ff" strokeWidth={2.5} fill="transparent" /><Area type="monotone" dataKey="forecast" stroke="#21d49b" strokeWidth={2.5} strokeDasharray="5 4" fill="transparent" connectNulls /></AreaChart></ResponsiveContainer></div><div className="chart-legend"><span><i className="blue" />Actual sales</span><span><i className="green" />AI forecast</span></div></div></div></section>

      <section className="landing-section workflow-section" id="workflow"><div className="section-intro"><span>Simple 3-step workflow</span><h2>From raw data to <em>AI insights</em></h2></div><div className="workflow-grid">{[[FileUp,"01","Upload sales data","Import CSV sales history and validate required fields."],[BrainCircuit,"02","Generate forecasts","The Python model produces demand forecasts through a secure API."],[PackageCheck,"03","Act on insights","Review stock risk and place informed replenishment orders."]].map(([Icon,number,title,copy]) => <article key={number}><div className="step-icon"><span>{number}</span><Icon size={24} /></div><h3>{title}</h3><p>{copy}</p></article>)}</div></section>

      <section className="model-showcase" id="technology"><div className="model-copy"><div className="landing-pill violet"><BrainCircuit size={14} /> Production forecasting engine</div><h2>One validated model.<br /><span>Reliable forecasts.</span></h2><p>We compared forecasting approaches through recursive backtesting and selected a global XGBoost model for production demand planning.</p><div className="score-row"><div><b>XGBoost</b><span>Production model</span><strong>0.575 MAE</strong></div><div><b>Seasonal naive</b><span>Baseline model</span><strong>0.659 MAE</strong></div><div><b>Validation</b><span>Recursive backtest</span><strong>3 folds</strong></div></div></div><div className="model-numbers"><article><Database /><strong>8.17M</strong><span>training rows</span></article><article><Layers3 /><strong>11,626</strong><span>forecast series</span></article><article><CircleGauge /><strong>83</strong><span>boosting rounds</span></article><article><Activity /><strong>28 days</strong><span>forecast horizon</span></article></div></section>

      <section className="landing-section dashboard-showcase"><div className="section-intro"><span>Live dashboard preview</span><h2>Your inventory intelligence <em>command centre</em></h2><p>Explore the real trained-model output already running in the StockGuard AI dashboard.</p></div><MiniDashboard expanded /></section>

      <section className="architecture-section"><div className="section-intro"><span>Proposal-aligned platform</span><h2>A clear, scalable <em>system architecture</em></h2></div><div className="architecture-grid"><article><div><Users /></div><span>Client layer</span><h3>React + React Native</h3><p>Responsive web dashboard now, mobile application after the API stabilises.</p></article><ChevronRight /><article><div><Layers3 /></div><span>Business layer</span><h3>Node.js + Express</h3><p>Authentication, product management, sales uploads and application APIs.</p></article><ChevronRight /><article><div><Database /></div><span>Data layer</span><h3>MongoDB</h3><p>Users, products, sales, inventory, forecasts and recommendations.</p></article><ChevronRight /><article><div><BrainCircuit /></div><span>Intelligence layer</span><h3>Python ML API</h3><p>Feature processing, XGBoost inference and model validation.</p></article></div></section>

      <section className="landing-section faq-section" id="faq"><div className="section-intro"><span>Questions and answers</span><h2>Frequently asked <em>questions</em></h2></div><div className="faq-list">{faqItems.map(([question, answer]) => <details key={question}><summary>{question}<span>+</span></summary><p>{answer}</p></details>)}</div></section>

      <section className="landing-cta"><div><ShieldCheck size={30} /><h2>Ready to explore StockGuard AI?</h2><p>Open the live dashboard and inspect forecasts from the trained production model.</p><div><a className="primary-cta" href="/dashboard">Open live dashboard <ArrowRight size={17} /></a><a className="secondary-cta" href="#features">Review features</a></div></div></section>
    </main>

    <footer className="landing-footer"><div className="footer-brand"><Brand /><p>A predictive business intelligence system for SMEs, built around demand forecasting and smarter inventory planning.</p></div><div><b>Product</b><a href="#features">Features</a><a href="/dashboard">Dashboard</a><a href="#technology">Technology</a></div><div><b>Project</b><a href="#workflow">How it works</a><a href="#faq">FAQ</a><a href="https://github.com/ahsanqasim90/Stockguard-AI">GitHub</a></div><div><b>Architecture</b><span>React</span><span>Node + Express</span><span>MongoDB + Python</span></div><p className="footer-note">StockGuard AI · Final Year Project · Lahore Garrison University</p></footer>
  </div>;
}
