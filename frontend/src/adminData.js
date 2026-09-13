export const productSeed = [
  { id: 1, name: "Samsung Galaxy S24", sku: "ELEC-001", category: "Electronics", stock: 124, reorder: 150, price: 189999, supplier: "Samsung PK" },
  { id: 2, name: "Nike Air Max 2024", sku: "SPRT-022", category: "Sports", stock: 380, reorder: 100, price: 38500, supplier: "Nike Distributors" },
  { id: 3, name: "Organic Rice 5kg", sku: "FOOD-088", category: "Food", stock: 1240, reorder: 500, price: 850, supplier: "AgriFresh PK" },
  { id: 4, name: "HP Laptop 15s", sku: "ELEC-045", category: "Electronics", stock: 48, reorder: 100, price: 124999, supplier: "HP Pakistan" },
  { id: 5, name: "Levi's 501 Jeans", sku: "FASH-104", category: "Fashion", stock: 210, reorder: 80, price: 8500, supplier: "Levi's PK" },
  { id: 6, name: "Sony WH-1000XM5", sku: "ELEC-067", category: "Electronics", stock: 62, reorder: 50, price: 94999, supplier: "Sony Pakistan" },
  { id: 7, name: "Reebok Classic", sku: "SPRT-045", category: "Sports", stock: 190, reorder: 120, price: 18500, supplier: "Reebok Dist." },
  { id: 8, name: "Basmati Rice 10kg", sku: "FOOD-112", category: "Food", stock: 890, reorder: 400, price: 1800, supplier: "Punjab Agri" },
];

export const userSeed = [
  { id: 1, name: "Muhammad Ahsan Qasim", email: "ahsan@stockguard.ai", role: "Admin", status: "Active", active: "Now", uploads: 12 },
  { id: 2, name: "Arslan Ahmad", email: "arslan@stockguard.ai", role: "Analyst", status: "Active", active: "1 hour ago", uploads: 8 },
  { id: 3, name: "Fatima Malik", email: "fatima@stockguard.ai", role: "Viewer", status: "Active", active: "3 hours ago", uploads: 0 },
  { id: 4, name: "Usman Tariq", email: "usman@stockguard.ai", role: "Analyst", status: "Inactive", active: "2 days ago", uploads: 4 },
];

export const reportSeed = [
  { id: 1, name: "Q3 Revenue Summary", type: "Revenue", date: "12 Sep 2026", format: "CSV" },
  { id: 2, name: "October Demand Forecast", type: "Forecast", date: "11 Sep 2026", format: "CSV" },
  { id: 3, name: "Inventory Health Report", type: "Inventory", date: "08 Sep 2026", format: "CSV" },
  { id: 4, name: "AI Model Validation", type: "AI", date: "05 Sep 2026", format: "JSON" },
];

export const revenueTrend = [
  { month: "May", actual: 520, forecast: 530 },
  { month: "Jun", actual: 610, forecast: 602 },
  { month: "Jul", actual: 584, forecast: 590 },
  { month: "Aug", actual: 720, forecast: 712 },
  { month: "Sep", actual: 835, forecast: 828 },
  { month: "Oct", forecast: 940 },
  { month: "Nov", forecast: 1070 },
];

export const weeklyDemand = [
  { week: "W1", electronics: 320, food: 210, sports: 170 },
  { week: "W2", electronics: 376, food: 242, sports: 190 },
  { week: "W3", electronics: 344, food: 268, sports: 214 },
  { week: "W4", electronics: 408, food: 302, sports: 252 },
];

export const categoryMix = [
  { name: "Electronics", value: 35, color: "#2f6df6" },
  { name: "Food", value: 25, color: "#15c894" },
  { name: "Sports", value: 22, color: "#f5a524" },
  { name: "Fashion", value: 18, color: "#8b5cf6" },
];
