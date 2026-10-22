import PDFDocument from "pdfkit";

const palette = {
  navy: "#07162b",
  navySoft: "#102541",
  blue: "#2f6df6",
  teal: "#13c995",
  amber: "#f5a524",
  red: "#ef5b67",
  ink: "#172033",
  muted: "#66758d",
  line: "#dce4ef",
  panel: "#f4f7fb",
  white: "#ffffff",
};

const titles = {
  sales: "Sales Performance Report",
  inventory: "Inventory Health Report",
  forecast: "AI Forecast Report",
};

const number = (value, digits = 0) => new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: digits,
}).format(Number(value) || 0);
const money = (value) => `PKR ${number(value, 2)}`;
const day = (value) => value ? new Date(value).toISOString().slice(0, 10) : "Not available";
const humanModel = (value) => String(value || "Not available").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

function reportContext(options) {
  return {
    title: titles[options.type],
    businessName: options.businessName || "StockGuard AI Workspace",
    generatedAt: options.generatedAt || new Date(),
    layout: options.type === "inventory" ? "landscape" : "portrait",
  };
}

function brandMark(doc, x, y) {
  doc.roundedRect(x, y, 40, 40, 9).fill(palette.white);
  doc.save();
  doc.translate(x + 20, y + 20);
  doc.moveTo(0, -13).lineTo(12, -6).lineTo(10, 8).lineTo(0, 14).lineTo(-10, 8).lineTo(-12, -6).closePath();
  doc.fill(palette.blue);
  doc.moveTo(-7, 5).lineTo(-2, -1).lineTo(2, 3).lineTo(8, -7).lineWidth(2.2).stroke(palette.teal);
  doc.restore();
}

function pageHeader(doc, context) {
  const width = doc.page.width;
  doc.rect(0, 0, width, 86).fill(palette.navy);
  doc.rect(0, 82, width, 4).fill(palette.teal);
  brandMark(doc, 42, 22);
  doc.fillColor(palette.white).font("Helvetica-Bold").fontSize(17).text("StockGuard AI", 92, 25);
  doc.fillColor("#9fb1c9").font("Helvetica").fontSize(8.5).text("PREDICT TODAY. PROTECT TOMORROW.", 92, 49, { characterSpacing: 1.05 });
  doc.fillColor(palette.white).font("Helvetica-Bold").fontSize(14).text(context.title, width - 280, 27, 238, { align: "right" });
  doc.fillColor("#9fb1c9").font("Helvetica").fontSize(8.5).text(context.businessName, width - 280, 49, 238, { align: "right" });
  doc.y = 108;
}

function addPage(doc, context) {
  doc.addPage({ size: "A4", layout: context.layout, margin: 42 });
  pageHeader(doc, context);
}

function ensureSpace(doc, context, required = 50) {
  if (doc.y + required > doc.page.height - 54) addPage(doc, context);
}

function sectionTitle(doc, context, title, subtitle = "") {
  ensureSpace(doc, context, subtitle ? 54 : 35);
  doc.x = 42;
  doc.fillColor(palette.ink).font("Helvetica-Bold").fontSize(14).text(title, 42, doc.y, doc.page.width - 84);
  if (subtitle) doc.fillColor(palette.muted).font("Helvetica").fontSize(8.5).text(subtitle, { lineGap: 2 });
  doc.moveDown(0.65);
}

function summaryCards(doc, context, cards) {
  ensureSpace(doc, context, 92);
  const gap = 10;
  const width = (doc.page.width - 84 - gap * (cards.length - 1)) / cards.length;
  const y = doc.y;
  cards.forEach((card, index) => {
    const x = 42 + index * (width + gap);
    doc.roundedRect(x, y, width, 72, 8).fill(card.tint || palette.panel);
    doc.rect(x, y, 4, 72).fill(card.color || palette.blue);
    doc.fillColor(palette.muted).font("Helvetica-Bold").fontSize(7.5).text(card.label.toUpperCase(), x + 15, y + 14, width - 24, { characterSpacing: 0.55 });
    doc.fillColor(palette.ink).font("Helvetica-Bold").fontSize(card.size || 15).text(card.value, x + 15, y + 34, width - 24, { ellipsis: true });
  });
  doc.x = 42;
  doc.y = y + 88;
}

function noteBox(doc, context, title, text, tone = "blue") {
  const color = tone === "red" ? palette.red : tone === "amber" ? palette.amber : tone === "teal" ? palette.teal : palette.blue;
  const width = doc.page.width - 84;
  const textHeight = doc.heightOfString(text, { width: width - 34, lineGap: 2 });
  const height = Math.max(58, textHeight + 36);
  ensureSpace(doc, context, height + 12);
  const y = doc.y;
  doc.roundedRect(42, y, width, height, 8).fill(palette.panel);
  doc.rect(42, y, 4, height).fill(color);
  doc.fillColor(color).font("Helvetica-Bold").fontSize(9).text(title.toUpperCase(), 58, y + 12, width - 28, { characterSpacing: 0.45 });
  doc.fillColor(palette.ink).font("Helvetica").fontSize(9).text(text, 58, y + 28, width - 28, { lineGap: 2 });
  doc.x = 42;
  doc.y = y + height + 14;
}

function lineChart(doc, context, rows, valueKey, formatter, title) {
  if (!rows.length) return;
  ensureSpace(doc, context, 190);
  sectionTitle(doc, context, title, "Trend based on recorded business data");
  const x = 54; const y = doc.y + 4; const width = doc.page.width - 108; const height = 126;
  const values = rows.map((row) => Number(row[valueKey]) || 0);
  const max = Math.max(...values, 1);
  doc.roundedRect(42, y - 8, doc.page.width - 84, height + 38, 8).fill("#fbfcfe").stroke(palette.line);
  for (let index = 0; index <= 4; index += 1) {
    const gy = y + (height * index) / 4;
    doc.moveTo(x, gy).lineTo(x + width, gy).lineWidth(0.5).stroke("#e5ebf3");
    doc.fillColor(palette.muted).font("Helvetica").fontSize(7).text(formatter(max * (4 - index) / 4), 44, gy - 3, width, { align: "left" });
  }
  const points = rows.map((row, index) => ({
    x: x + (rows.length === 1 ? width / 2 : (width * index) / (rows.length - 1)),
    y: y + height - ((Number(row[valueKey]) || 0) / max) * height,
  }));
  doc.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) doc.lineTo(point.x, point.y);
  doc.lineWidth(2).stroke(palette.blue);
  for (const point of [points[0], points.at(-1)]) doc.circle(point.x, point.y, 3).fill(palette.teal);
  doc.fillColor(palette.muted).font("Helvetica").fontSize(7.5).text(rows[0].date, x, y + height + 8);
  doc.text(rows.at(-1).date, x + width - 70, y + height + 8, 70, { align: "right" });
  doc.x = 42;
  doc.y = y + height + 48;
}

function categoryBars(doc, context, categories) {
  if (!categories?.length) return;
  sectionTitle(doc, context, "Category performance", "Recorded revenue contribution by product category");
  const rows = categories.slice(0, 6);
  const max = Math.max(...rows.map((row) => row.revenue), 1);
  ensureSpace(doc, context, rows.length * 29 + 14);
  for (const row of rows) {
    const y = doc.y;
    doc.fillColor(palette.ink).font("Helvetica-Bold").fontSize(8.5).text(row.name, 42, y + 2, 110);
    doc.roundedRect(158, y + 2, doc.page.width - 310, 8, 4).fill("#e7edf6");
    doc.roundedRect(158, y + 2, Math.max(3, (doc.page.width - 310) * row.revenue / max), 8, 4).fill(palette.teal);
    doc.fillColor(palette.muted).font("Helvetica").fontSize(8).text(money(row.revenue), doc.page.width - 142, y, 100, { align: "right" });
    doc.y += 28;
  }
  doc.x = 42;
  doc.moveDown(0.4);
}

function table(doc, context, columns, rows, options = {}) {
  const startX = 42;
  const rowHeight = options.rowHeight || 24;
  const headerHeight = 24;
  const drawHeader = () => {
    ensureSpace(doc, context, headerHeight + rowHeight);
    const y = doc.y;
    doc.rect(startX, y, columns.reduce((sum, col) => sum + col.width, 0), headerHeight).fill(palette.navySoft);
    let x = startX;
    for (const column of columns) {
      doc.fillColor(palette.white).font("Helvetica-Bold").fontSize(7.2).text(column.label.toUpperCase(), x + 6, y + 8, column.width - 12, { align: column.align || "left", ellipsis: true });
      x += column.width;
    }
    doc.y = y + headerHeight;
  };
  drawHeader();
  rows.forEach((row, index) => {
    if (doc.y + rowHeight > doc.page.height - 54) {
      addPage(doc, context);
      drawHeader();
    }
    const y = doc.y;
    if (index % 2 === 0) doc.rect(startX, y, columns.reduce((sum, col) => sum + col.width, 0), rowHeight).fill("#f8fafc");
    let x = startX;
    for (const column of columns) {
      const raw = typeof column.value === "function" ? column.value(row) : row[column.key];
      const value = column.format ? column.format(raw) : String(raw ?? "");
      doc.fillColor(column.color ? column.color(raw, row) : palette.ink).font(column.bold ? "Helvetica-Bold" : "Helvetica").fontSize(7.5)
        .text(value, x + 6, y + 7, column.width - 12, { align: column.align || "left", ellipsis: true, height: rowHeight - 9 });
      x += column.width;
    }
    doc.y = y + rowHeight;
  });
  doc.x = 42;
  doc.moveDown(0.9);
}

function salesReport(doc, context, overview) {
  sectionTitle(doc, context, "Executive summary", `${overview.period.startDate} to ${overview.period.endDate} - ${overview.period.recordedDays} recorded sales days`);
  summaryCards(doc, context, [
    { label: "Recorded revenue", value: money(overview.totals.revenue), color: palette.blue, size: 10.5 },
    { label: "Units sold", value: number(overview.totals.units), color: palette.teal },
    { label: "Sales records", value: number(overview.totals.saleRecords), color: palette.amber },
    { label: "Average / day", value: money(overview.totals.averageRecordedDayRevenue), color: "#8466d9", size: 10.5 },
  ]);
  lineChart(doc, context, overview.daily, "revenue", (value) => number(value, 0), "Revenue trend");
  categoryBars(doc, context, overview.categories);
  sectionTitle(doc, context, "Daily performance", "Every recorded day in the selected reporting period");
  table(doc, context, [
    { key: "date", label: "Date", width: 105, bold: true },
    { key: "units", label: "Units", width: 90, align: "right", format: (value) => number(value) },
    { key: "records", label: "Records", width: 90, align: "right", format: (value) => number(value) },
    { key: "revenue", label: "Revenue", width: 225, align: "right", format: money },
  ], overview.daily);
}

function inventoryReport(doc, context, overview) {
  const low = overview.inventory.filter((item) => item.lowStock).length;
  const open = overview.recommendations.filter((item) => item.status === "open");
  const orderUnits = open.reduce((sum, item) => sum + (item.suggestedQuantity || 0), 0);
  sectionTitle(doc, context, "Inventory overview", "Current stock position and AI-assisted replenishment actions");
  summaryCards(doc, context, [
    { label: "Tracked locations", value: number(overview.inventory.length), color: palette.blue },
    { label: "Low-stock locations", value: number(low), color: low ? palette.red : palette.teal },
    { label: "Open AI actions", value: number(open.length), color: palette.amber },
    { label: "Recommended units", value: number(orderUnits), color: "#8466d9" },
  ]);
  if (open.length) noteBox(doc, context, "Priority action", `${open[0].productName} at ${open[0].store}: ${open[0].reason}`, open[0].risk === "high" ? "red" : "amber");
  sectionTitle(doc, context, "Stock and replenishment register", "Status is calculated against the configured reorder point");
  table(doc, context, [
    { key: "store", label: "Store", width: 78, bold: true },
    { key: "name", label: "Product", width: 154 },
    { key: "sku", label: "SKU", width: 92 },
    { key: "category", label: "Category", width: 76 },
    { key: "stock", label: "Stock", width: 54, align: "right", format: number },
    { key: "reorderPoint", label: "Reorder", width: 58, align: "right", format: number },
    { key: "lowStock", label: "Status", width: 66, value: (row) => row.lowStock ? "Low stock" : "Healthy", color: (_value, row) => row.lowStock ? palette.red : palette.teal, bold: true },
    { key: "action", label: "AI action", width: 112, value: (row) => {
      const action = open.find((item) => item.productId === row.productId && item.store === row.store);
      return action ? `Order ${number(action.suggestedQuantity)} (${action.risk})` : "No open action";
    } },
  ], overview.inventory, { rowHeight: 20 });
}

function forecastReport(doc, context, overview, run, predictions) {
  const plan = run.inventoryPlan || {};
  const selected = humanModel(run.modelName);
  sectionTitle(doc, context, "Forecast decision summary", `${overview.latestForecast?.productName || "Product"} at ${overview.latestForecast?.store || "Store"} - ${run.horizonDays}-day horizon`);
  summaryCards(doc, context, [
    { label: "Selected model", value: selected, color: palette.blue, size: 12 },
    { label: "Forecast units", value: number(run.forecastTotal, 1), color: palette.teal },
    { label: "Forecast revenue", value: money(run.revenueEstimate?.forecastRevenue), color: palette.amber, size: 10.5 },
    { label: "Recommended order", value: number(plan.recommendedOrderQuantity), color: plan.recommendedOrderQuantity ? palette.red : palette.teal },
  ]);
  noteBox(doc, context, "Automatic model selection", `${selected} was selected using the lowest holdout MAE, with RMSE as the tie-breaker. Holdout observations: ${number(run.backtest?.observations)}. MAE: ${number(run.backtest?.mae, 3)}. RMSE: ${number(run.backtest?.rmse, 3)}.`, "teal");
  sectionTitle(doc, context, "Inventory decision", "Lead-time demand, safety stock and target stock calculated from the saved forecast");
  summaryCards(doc, context, [
    { label: "Available stock", value: number(plan.availableStock), color: palette.blue },
    { label: "Lead-time demand", value: number(plan.leadTimeDemand, 1), color: palette.amber },
    { label: "Safety stock", value: number(plan.safetyStock, 1), color: "#8466d9" },
    { label: "Target stock", value: number(plan.targetStock), color: palette.teal },
  ]);
  lineChart(doc, context, predictions.map((item) => ({ date: day(item.forecastDate), quantity: item.predictedQuantity })), "quantity", (value) => number(value, 0), "Daily demand forecast");
  sectionTitle(doc, context, "Daily forecast schedule", `Forecast starts ${day(run.forecastStartDate)} and contains ${predictions.length} saved daily predictions`);
  table(doc, context, [
    { key: "forecastDate", label: "Date", width: 130, bold: true, format: day },
    { key: "predictedQuantity", label: "Predicted units", width: 155, align: "right", format: (value) => number(value, 2) },
    { key: "predictedRevenue", label: "Estimated revenue", width: 225, align: "right", format: money },
  ], predictions, { rowHeight: 22 });
}

function addFooters(doc, context) {
  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    const y = doc.page.height - 34;
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.moveTo(42, y - 8).lineTo(doc.page.width - 42, y - 8).lineWidth(0.5).stroke(palette.line);
    doc.fillColor(palette.muted).font("Helvetica").fontSize(7.5).text(`Generated ${context.generatedAt.toISOString().slice(0, 19).replace("T", " ")} UTC`, 42, y, 210, { lineBreak: false });
    doc.text("Confidential business report", (doc.page.width - 180) / 2, y, 180, { align: "center", lineBreak: false });
    doc.text(`Page ${index - range.start + 1} of ${range.count}`, doc.page.width - 142, y, 100, { align: "right", lineBreak: false });
    doc.page.margins.bottom = bottomMargin;
  }
}

export function createProfessionalReportPdf(options) {
  const context = reportContext(options);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: context.layout, margin: 42, bufferPages: true,
      info: { Title: context.title, Author: "StockGuard AI", Subject: `${context.businessName} business intelligence report`, Creator: "StockGuard AI Reporting Engine" } });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    pageHeader(doc, context);
    if (options.type === "sales") salesReport(doc, context, options.overview);
    else if (options.type === "inventory") inventoryReport(doc, context, options.overview);
    else forecastReport(doc, context, options.overview, options.run, options.predictions);
    addFooters(doc, context);
    doc.end();
  });
}
