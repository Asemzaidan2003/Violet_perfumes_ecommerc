// Logic for reports.html

// -----------------------------------------------------------------------
// State
// -----------------------------------------------------------------------
const state = {
  from: null, // Date
  to: null, // Date
  status: "completed",
  activeTab: "sales",
};

let charts = {}; // keyed by canvas id, so we can .destroy() before re-drawing

function destroyChart(key) {
  if (charts[key]) {
    charts[key].destroy();
    delete charts[key];
  }
}

// -----------------------------------------------------------------------
// Date range presets & filter bar
// -----------------------------------------------------------------------
function applyPreset(preset) {
  const now = new Date();
  let from, to;
  to = now;
  switch (preset) {
    case "today":
      from = now;
      break;
    case "week": {
      const day = now.getDay();
      from = new Date(now);
      from.setDate(now.getDate() - day);
      break;
    }
    case "month":
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case "90d":
      from = new Date(now);
      from.setDate(now.getDate() - 89);
      break;
    case "30d":
    default:
      from = new Date(now);
      from.setDate(now.getDate() - 29);
      break;
  }
  document.getElementById("fromDate").value = toDateInputValue(from);
  document.getElementById("toDate").value = toDateInputValue(to);

  document.querySelectorAll("#rangePresets [data-preset]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.preset === preset);
  });

  applyDateFilters(false);
}

function applyDateFilters(clearPresetActive = true) {
  if (clearPresetActive) {
    document.querySelectorAll("#rangePresets [data-preset]").forEach((btn) => btn.classList.remove("active"));
  }
  const from = document.getElementById("fromDate").value;
  const to = document.getElementById("toDate").value;
  state.from = from;
  state.to = to;
  state.status = document.getElementById("statusFilter").value;
  loadActiveTab();
}

function dateQuery() {
  const params = new URLSearchParams();
  if (state.from) params.set("from", state.from);
  if (state.to) params.set("to", state.to);
  if (state.status) params.set("status", state.status);
  return params.toString();
}

// -----------------------------------------------------------------------
// Tabs
// -----------------------------------------------------------------------
function initTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${tab}`));
      // Inventory tab is a live snapshot, not date-filtered
      document.getElementById("dateFilters").style.display = tab === "inventory" ? "none" : "grid";
      state.activeTab = tab;
      loadActiveTab();
    });
  });
}

function loadActiveTab() {
  if (state.activeTab === "sales") loadSalesTab();
  else if (state.activeTab === "products") loadProductsTab();
  else if (state.activeTab === "inventory") loadInventoryTab();
  else if (state.activeTab === "customers") loadCustomersTab();
}

// -----------------------------------------------------------------------
// SALES TAB
// -----------------------------------------------------------------------
let _lastSalesSeries = [];

async function loadSalesTab() {
  const groupBy = document.getElementById("salesGroupBy").value;
  document.getElementById("salesTable").innerHTML = `<tr class="loading-row"><td colspan="6"><span class="spinner"></span>جاري التحميل...</td></tr>`;
  try {
    const data = await apiGet(`/reports/sales?${dateQuery()}&groupBy=${groupBy}`);
    _lastSalesSeries = data.series;
    renderSalesStats(data.totals);
    renderSalesChart(data.series);
    renderSalesTable(data.series);
  } catch (err) {
    console.error("Error loading sales report:", err);
    document.getElementById("salesTable").innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="icon">⚠️</div>تعذر تحميل التقرير</div></td></tr>`;
  }
}

function renderSalesStats(t) {
  document.getElementById("salesStats").innerHTML = `
    <div class="stat-card"><div class="label">إجمالي المبيعات</div><div class="value">${money(t.revenue)}</div></div>
    <div class="stat-card"><div class="label">إجمالي التكلفة</div><div class="value">${money(t.cost)}</div></div>
    <div class="stat-card accent"><div class="label">إجمالي الربح</div><div class="value">${money(t.profit)}</div></div>
    <div class="stat-card"><div class="label">هامش الربح</div><div class="value">${t.profit_margin.toFixed(1)}%</div></div>
    <div class="stat-card"><div class="label">عدد الطلبات</div><div class="value">${num(t.orders_count)}</div></div>
    <div class="stat-card"><div class="label">متوسط قيمة الطلب</div><div class="value">${money(t.avg_order_value)}</div></div>
  `;
}

function renderSalesChart(series) {
  destroyChart("sales");
  charts.sales = new Chart(document.getElementById("salesChart"), {
    type: "bar",
    data: {
      labels: series.map((s) => s.period),
      datasets: [
        { label: "المبيعات", data: series.map((s) => s.revenue), backgroundColor: CHART_COLORS.brand, order: 2 },
        { label: "التكلفة", data: series.map((s) => s.cost), backgroundColor: CHART_COLORS.slate, order: 3 },
        {
          label: "الربح",
          data: series.map((s) => s.profit),
          type: "line",
          borderColor: CHART_COLORS.amber,
          backgroundColor: CHART_COLORS.amber,
          tension: 0.3,
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { position: "bottom" } },
      scales: { y: { beginAtZero: true } },
    },
  });
}

function renderSalesTable(series) {
  const tbody = document.getElementById("salesTable");
  if (!series.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="icon">🗒️</div>لا توجد بيانات لهذه الفترة</div></td></tr>`;
    return;
  }
  tbody.innerHTML = series
    .map(
      (s) => `
    <tr>
      <td class="cell-strong">${s.period}</td>
      <td class="num">${money(s.revenue)}</td>
      <td class="num">${money(s.cost)}</td>
      <td class="num">${money(s.profit)}</td>
      <td>${num(s.orders_count)}</td>
      <td class="num">${money(s.avg_order_value)}</td>
    </tr>`
    )
    .join("");
}

function exportSalesCsv() {
  exportTableToCsv(
    "sales-report.csv",
    ["Period", "Revenue", "Cost", "Profit", "Orders", "Avg Order Value"],
    _lastSalesSeries.map((s) => [s.period, s.revenue, s.cost, s.profit, s.orders_count, s.avg_order_value])
  );
}

// -----------------------------------------------------------------------
// PRODUCTS TAB
// -----------------------------------------------------------------------
let _lastProducts = [];

async function loadProductsTab() {
  const sortBy = document.getElementById("productsSortBy").value;
  const limit = document.getElementById("productsLimit").value;
  document.getElementById("productsTable").innerHTML = `<tr class="loading-row"><td colspan="7"><span class="spinner"></span>جاري التحميل...</td></tr>`;
  try {
    const data = await apiGet(`/reports/products?${dateQuery()}&sortBy=${sortBy}&limit=${limit}`);
    _lastProducts = data.top_products;
    renderProductsChart(data.top_products);
    renderCategoryChart(data.by_category);
    renderProductsTable(data.top_products);
    renderSizeTable(data.by_size);
  } catch (err) {
    console.error("Error loading products report:", err);
    document.getElementById("productsTable").innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="icon">⚠️</div>تعذر تحميل التقرير</div></td></tr>`;
  }
}

function renderProductsChart(products) {
  destroyChart("products");
  charts.products = new Chart(document.getElementById("productsChart"), {
    type: "bar",
    data: {
      labels: products.map((p) => p.name),
      datasets: [{ label: "الإيرادات", data: products.map((p) => p.revenue), backgroundColor: CHART_COLORS.brand }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true } },
    },
  });
}

function renderCategoryChart(categories) {
  destroyChart("category");
  charts.category = new Chart(document.getElementById("categoryChart"), {
    type: "pie",
    data: {
      labels: categories.map((c) => c.category),
      datasets: [{ data: categories.map((c) => c.revenue), backgroundColor: CHART_COLORS.palette }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } } },
    },
  });
}

function renderProductsTable(products) {
  const tbody = document.getElementById("productsTable");
  if (!products.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="icon">🗒️</div>لا توجد بيانات لهذه الفترة</div></td></tr>`;
    return;
  }
  tbody.innerHTML = products
    .map(
      (p) => `
    <tr>
      <td class="cell-strong">${p.name}</td>
      <td>${p.category || "-"}</td>
      <td>${num(p.quantity)}</td>
      <td class="num">${money(p.revenue)}</td>
      <td class="num">${money(p.cost)}</td>
      <td class="num">${money(p.profit)}</td>
      <td>${p.profit_margin.toFixed(1)}%</td>
    </tr>`
    )
    .join("");
}

function renderSizeTable(sizes) {
  const tbody = document.getElementById("sizeTable");
  tbody.innerHTML = sizes
    .map((s) => `<tr><td>${s.size}</td><td>${num(s.quantity)}</td><td class="num">${money(s.revenue)}</td></tr>`)
    .join("") || `<tr><td colspan="3"><div class="empty-state">لا توجد بيانات</div></td></tr>`;
}

function exportProductsCsv() {
  exportTableToCsv(
    "products-report.csv",
    ["Product", "Category", "Quantity", "Revenue", "Cost", "Profit", "Margin %"],
    _lastProducts.map((p) => [p.name, p.category, p.quantity, p.revenue, p.cost, p.profit, p.profit_margin])
  );
}

// -----------------------------------------------------------------------
// INVENTORY TAB
// -----------------------------------------------------------------------
let _lastOils = [];
let _lastBottles = [];

async function loadInventoryTab() {
  const oilThreshold = document.getElementById("oilThreshold").value || 100;
  const bottleThreshold = document.getElementById("bottleThreshold").value || 20;
  try {
    const data = await apiGet(`/reports/inventory?oilThreshold=${oilThreshold}&bottleThreshold=${bottleThreshold}`);
    _lastOils = data.oils;
    _lastBottles = data.bottles;
    renderInventoryStats(data.totals);
    renderLowStockLists(data.low_stock_oils, data.low_stock_bottles);
    renderOilsTable(data.oils);
    renderBottlesTable(data.bottles);
    renderAlcoholTable(data.alcohol);
  } catch (err) {
    console.error("Error loading inventory report:", err);
  }
}

function renderInventoryStats(t) {
  document.getElementById("inventoryStats").innerHTML = `
    <div class="stat-card"><div class="label">رأس مال الزيوت</div><div class="value">${money(t.oil_capital)}</div></div>
    <div class="stat-card"><div class="label">رأس مال الزجاجات</div><div class="value">${money(t.bottle_capital)}</div></div>
    <div class="stat-card"><div class="label">رأس مال الكحول</div><div class="value">${money(t.alcohol_capital)}</div></div>
    <div class="stat-card accent"><div class="label">إجمالي رأس المال</div><div class="value">${money(t.total_capital)}</div></div>
  `;
}

function renderLowStockLists(oils, bottles) {
  const oilsEl = document.getElementById("lowStockOilsList");
  oilsEl.innerHTML = oils.length
    ? oils.map((o) => `<li class="alert"><span class="name">${o.name}</span><span class="val">${num(o.quantity)} ML</span></li>`).join("")
    : `<li><span class="text-muted">✅ لا توجد تنبيهات</span></li>`;

  const bottlesEl = document.getElementById("lowStockBottlesList");
  bottlesEl.innerHTML = bottles.length
    ? bottles.map((b) => `<li class="alert"><span class="name">${b.name}</span><span class="val">${num(b.quantity)} قطعة</span></li>`).join("")
    : `<li><span class="text-muted">✅ لا توجد تنبيهات</span></li>`;
}

function stockBar(quantity, low) {
  const pct = Math.max(4, Math.min(100, quantity));
  return `<span class="stock-bar${low ? " low" : ""}"><span style="width:${pct}%"></span></span>`;
}

function renderOilsTable(oils) {
  const tbody = document.getElementById("oilsTable");
  tbody.innerHTML =
    oils
      .map(
        (o) => `
    <tr>
      <td class="cell-strong">${o.name}</td>
      <td class="num">${num(o.quantity)} ML ${stockBar(o.quantity, o.low_stock)}</td>
      <td class="num">${money(o.cost)}</td>
      <td class="num">${money(o.value)}</td>
      <td><span class="badge ${o.status === "available" ? "badge-available" : o.status === "out of stock" ? "badge-out" : "badge-discontinued"}">${o.status}</span></td>
    </tr>`
      )
      .join("") || `<tr><td colspan="5"><div class="empty-state">لا توجد بيانات</div></td></tr>`;
}

function renderBottlesTable(bottles) {
  const tbody = document.getElementById("bottlesTable");
  tbody.innerHTML =
    bottles
      .map(
        (b) => `
    <tr>
      <td class="cell-strong">${b.name}</td>
      <td>${num(b.capacity)} ML</td>
      <td class="num">${num(b.quantity)} ${stockBar(b.quantity, b.low_stock)}</td>
      <td class="num">${money(b.cost)}</td>
      <td class="num">${money(b.value)}</td>
    </tr>`
      )
      .join("") || `<tr><td colspan="5"><div class="empty-state">لا توجد بيانات</div></td></tr>`;
}

let _lastAlcohol = [];

function renderAlcoholTable(alcohol) {
  _lastAlcohol = alcohol;
  const tbody = document.getElementById("alcoholTable");
  tbody.innerHTML =
    alcohol
      .map(
        (a) => `
    <tr id="alcohol-row-${a.id}">
      <td class="cell-strong">${a.name}</td>
      <td>${a.type}</td>
      <td class="num">${num(a.quantity)}</td>
      <td class="num">${money(a.cost)}</td>
      <td class="num">${money(a.value)}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="editAlcoholRow('${a.id}')">✏️ تعديل</button></td>
    </tr>`
      )
      .join("") || `<tr><td colspan="6"><div class="empty-state">لا توجد بيانات</div></td></tr>`;
}

function editAlcoholRow(id) {
  const a = _lastAlcohol.find((x) => String(x.id) === String(id));
  if (!a) return;
  const row = document.getElementById(`alcohol-row-${id}`);
  row.innerHTML = `
    <td><input type="text" id="alcohol-name-${id}" value="${a.name}"></td>
    <td><input type="text" id="alcohol-type-${id}" value="${a.type}"></td>
    <td><input type="number" id="alcohol-quantity-${id}" value="${a.quantity}"><input type="number" id="alcohol-add-${id}" min="0" step="any" placeholder="+ إضافة"></td>
    <td><input type="number" step="0.01" id="alcohol-cost-${id}" value="${a.cost}"></td>
    <td class="num">${money(a.value)}</td>
    <td>
      <button class="btn btn-primary btn-sm" onclick="saveAlcoholRow('${id}')">💾 حفظ</button>
      <button class="btn btn-ghost btn-sm" onclick="renderAlcoholTable(_lastAlcohol)">✖️ إلغاء</button>
    </td>`;
}

async function saveAlcoholRow(id) {
  const a = _lastAlcohol.find((x) => String(x.id) === String(id));
  const name = document.getElementById(`alcohol-name-${id}`).value.trim();
  const type = document.getElementById(`alcohol-type-${id}`).value.trim();
  const quantity = Number(document.getElementById(`alcohol-quantity-${id}`).value);
  const cost = Number(document.getElementById(`alcohol-cost-${id}`).value);
  const addQuantityRaw = document.getElementById(`alcohol-add-${id}`).value;
  if (!name || !type || Number.isNaN(quantity) || Number.isNaN(cost)) {
    alert("يرجى تعبئة جميع الحقول بشكل صحيح");
    return;
  }
  const data = { name, type, cost };
  if (!a || quantity !== a.quantity) data.quantity = quantity;
  if (addQuantityRaw !== "" && Number(addQuantityRaw) > 0) data.add_quantity = Number(addQuantityRaw);
  try {
    await apiPut(`/alcohols/${id}`, data);
    await loadInventoryTab();
  } catch (err) {
    console.error("Error updating alcohol:", err);
    alert("تعذر حفظ التعديلات");
  }
}

function exportOilsCsv() {
  exportTableToCsv(
    "oils-inventory.csv",
    ["Name", "Quantity (ML)", "Cost/ML", "Value", "Status"],
    _lastOils.map((o) => [o.name, o.quantity, o.cost, o.value, o.status])
  );
}

function exportBottlesCsv() {
  exportTableToCsv(
    "bottles-inventory.csv",
    ["Name", "Capacity", "Quantity", "Cost", "Value"],
    _lastBottles.map((b) => [b.name, b.capacity, b.quantity, b.cost, b.value])
  );
}

// -----------------------------------------------------------------------
// CUSTOMERS TAB
// -----------------------------------------------------------------------
let _lastCustomers = [];

async function loadCustomersTab() {
  document.getElementById("customersTable").innerHTML = `<tr class="loading-row"><td colspan="7"><span class="spinner"></span>جاري التحميل...</td></tr>`;
  try {
    const data = await apiGet(`/reports/customers?${dateQuery()}&limit=15`);
    _lastCustomers = data.top_customers;
    renderCustomersStats(data);
    renderNewCustomersChart(data.new_customers_series);
    renderCustomerTypeChart(data.customer_type_breakdown);
    renderCustomersTable(data.top_customers);
  } catch (err) {
    console.error("Error loading customers report:", err);
    document.getElementById("customersTable").innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="icon">⚠️</div>تعذر تحميل التقرير</div></td></tr>`;
  }
}

function renderCustomersStats(data) {
  const topSpender = data.top_customers[0];
  document.getElementById("customersStats").innerHTML = `
    <div class="stat-card"><div class="label">إجمالي عدد الزبائن</div><div class="value">${num(data.total_customers)}</div></div>
    <div class="stat-card"><div class="label">طلبات بدون زبون مسجل</div><div class="value">${num(data.walk_in_orders_in_range)}</div></div>
    <div class="stat-card accent"><div class="label">أعلى زبون إنفاقًا</div><div class="value">${topSpender ? money(topSpender.total_spent) : "-"}</div><div class="sub-label">${topSpender ? topSpender.name || "-" : ""}</div></div>
  `;
}

function renderNewCustomersChart(series) {
  destroyChart("newCustomers");
  charts.newCustomers = new Chart(document.getElementById("newCustomersChart"), {
    type: "bar",
    data: {
      labels: series.map((s) => s.date),
      datasets: [{ label: "زبائن جدد", data: series.map((s) => s.count), backgroundColor: CHART_COLORS.blue }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

function renderCustomerTypeChart(breakdown) {
  destroyChart("customerType");
  const typeLabels = { individual: "أفراد", store: "محلات" };
  charts.customerType = new Chart(document.getElementById("customerTypeChart"), {
    type: "doughnut",
    data: {
      labels: breakdown.map((b) => typeLabels[b.type] || b.type),
      datasets: [{ data: breakdown.map((b) => b.count), backgroundColor: CHART_COLORS.palette }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" } },
    },
  });
}

function renderCustomersTable(customers) {
  const tbody = document.getElementById("customersTable");
  if (!customers.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="icon">🗒️</div>لا توجد بيانات لهذه الفترة</div></td></tr>`;
    return;
  }
  const typeLabels = { individual: "فرد", store: "محل" };
  tbody.innerHTML = customers
    .map(
      (c) => `
    <tr>
      <td class="cell-strong">${c.name || "-"}</td>
      <td class="num">${c.phone || "-"}</td>
      <td>${typeLabels[c.type] || c.type || "-"}</td>
      <td>${num(c.orders_count)}</td>
      <td class="num">${money(c.total_spent)}</td>
      <td class="num">${money(c.avg_order_value)}</td>
      <td class="date-cell">${fmtDate(c.last_order_at)}</td>
    </tr>`
    )
    .join("");
}

function exportCustomersCsv() {
  exportTableToCsv(
    "customers-report.csv",
    ["Name", "Phone", "Type", "Orders", "Total Spent", "Avg Order", "Last Order"],
    _lastCustomers.map((c) => [c.name, c.phone, c.type, c.orders_count, c.total_spent, c.avg_order_value, c.last_order_at])
  );
}

// -----------------------------------------------------------------------
// Init
// -----------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  document.querySelectorAll("#rangePresets [data-preset]").forEach((btn) => {
    btn.addEventListener("click", () => applyPreset(btn.dataset.preset));
  });
  document.getElementById("salesGroupBy").addEventListener("change", loadSalesTab);
  applyPreset("30d");
});
