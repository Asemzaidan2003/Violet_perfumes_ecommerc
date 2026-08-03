// Logic for dashboard.html — pulls everything from GET /api/reports/dashboard

let _salesTrendChart = null;
let _statusChart = null;

async function loadDashboard() {
  try {
    const data = await apiGet("/reports/dashboard");
    renderKpis(data);
    renderOpsStats(data);
    renderSalesTrendChart(data.sales_trend);
    renderStatusChart(data.order_status_breakdown);
    renderTopProducts(data.top_products_30d);
    renderLowStock(data.inventory);
    renderRecentOrders(data.recent_orders);
    document.getElementById("lastUpdated").textContent =
      "آخر تحديث: " + new Date().toLocaleTimeString("en-GB");
  } catch (err) {
    console.error("Error loading dashboard:", err);
    document.getElementById("kpiStats").innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;">
        <div class="icon">⚠️</div>
        <div class="title">تعذر تحميل لوحة المعلومات</div>
        <div>تأكد من أن الخادم يعمل ثم أعد المحاولة</div>
      </div>`;
  }
}

function kpiCardHtml({ label, value, trend, warning }) {
  const trendHtml =
    trend !== undefined
      ? `<div class="trend ${trendClass(trend)}">${trendArrow(trend)} ${pct(trend)}</div>`
      : "";
  return `
    <div class="stat-card${warning ? " warning" : ""}">
      <div class="label">${label}</div>
      <div class="value">${value}</div>
      ${trendHtml}
    </div>`;
}

function renderKpis(data) {
  const el = document.getElementById("kpiStats");
  el.innerHTML = [
    kpiCardHtml({
      label: "مبيعات اليوم",
      value: money(data.today.revenue),
      trend: data.growth.revenue_vs_yesterday,
    }),
    kpiCardHtml({
      label: "أرباح اليوم",
      value: money(data.today.profit),
      trend: data.growth.profit_vs_yesterday,
    }),
    kpiCardHtml({
      label: "مبيعات هذا الشهر",
      value: money(data.this_month.revenue),
      trend: data.growth.revenue_vs_last_month,
    }),
    kpiCardHtml({
      label: "أرباح هذا الشهر",
      value: money(data.this_month.profit),
      trend: data.growth.profit_vs_last_month,
    }),
  ].join("");
}

function renderOpsStats(data) {
  const el = document.getElementById("opsStats");
  const lowStockCount = data.inventory.low_stock_count;
  el.innerHTML = `
    <div class="stat-card${data.pending_orders_count > 0 ? " warning" : ""}">
      <div class="label">طلبات قيد الانتظار</div>
      <div class="value">${num(data.pending_orders_count)}</div>
      <div class="sub-label">تحتاج متابعة</div>
    </div>
    <div class="stat-card">
      <div class="label">رأس المال في المخزون</div>
      <div class="value">${money(data.inventory.total_capital)}</div>
      <div class="sub-label">زيوت + زجاجات + كحول</div>
    </div>
    <div class="stat-card${lowStockCount > 0 ? " danger" : ""}">
      <div class="label">تنبيهات نقص المخزون</div>
      <div class="value">${num(lowStockCount)}</div>
      <div class="sub-label">${lowStockCount > 0 ? "يحتاج إعادة تعبئة" : "المخزون جيد"}</div>
    </div>
    <div class="stat-card">
      <div class="label">زبائن جدد هذا الشهر</div>
      <div class="value">${num(data.new_customers_this_month)}</div>
    </div>`;
}

function renderSalesTrendChart(trend) {
  const ctx = document.getElementById("salesTrendChart");
  const labels = trend.map((d) => fmtDateShort(d.date));
  if (_salesTrendChart) _salesTrendChart.destroy();
  _salesTrendChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "المبيعات",
          data: trend.map((d) => d.revenue),
          borderColor: CHART_COLORS.brand,
          backgroundColor: CHART_COLORS.brand + "22",
          tension: 0.3,
          fill: true,
        },
        {
          label: "الأرباح",
          data: trend.map((d) => d.profit),
          borderColor: CHART_COLORS.amber,
          backgroundColor: CHART_COLORS.amber + "22",
          tension: 0.3,
          fill: true,
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

function renderStatusChart(breakdown) {
  const ctx = document.getElementById("statusChart");
  if (_statusChart) _statusChart.destroy();
  _statusChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: breakdown.map((s) => arabicStatus(s.status)),
      datasets: [
        {
          data: breakdown.map((s) => s.count),
          backgroundColor: CHART_COLORS.palette,
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } } },
    },
  });
}

function renderTopProducts(products) {
  const el = document.getElementById("topProductsList");
  if (!products.length) {
    el.innerHTML = `<li><span class="text-muted">لا توجد بيانات مبيعات بعد</span></li>`;
    return;
  }
  el.innerHTML = products
    .map(
      (p, i) => `
    <li>
      <span class="rank">${i + 1}</span>
      <span class="name">${p.name}</span>
      <span class="meta">${num(p.quantity)} قطعة</span>
      <span class="val">${money(p.revenue)}</span>
    </li>`
    )
    .join("");
}

function renderLowStock(inventory) {
  const el = document.getElementById("lowStockList");
  const items = [
    ...inventory.low_stock_oils.map((o) => ({ name: o.oil_name, meta: "زيت", val: `${num(o.oil_quantity)} ML` })),
    ...inventory.low_stock_bottles.map((b) => ({ name: b.name, meta: "زجاجة", val: `${num(b.quantity)} قطعة` })),
  ];
  if (!items.length) {
    el.innerHTML = `<li><span class="text-muted">✅ لا توجد تنبيهات، المخزون بحالة جيدة</span></li>`;
    return;
  }
  el.innerHTML = items
    .map(
      (it) => `
    <li class="alert">
      <span class="name">${it.name}</span>
      <span class="meta">${it.meta}</span>
      <span class="val">${it.val}</span>
    </li>`
    )
    .join("");
}

function renderRecentOrders(orders) {
  const tbody = document.getElementById("recentOrdersTable");
  if (!orders.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="icon">🗒️</div>لا توجد طلبات بعد</div></td></tr>`;
    return;
  }
  tbody.innerHTML = orders
    .map(
      (o, i) => `
    <tr>
      <td>${i + 1}</td>
      <td class="num">${money(o.final_total)}</td>
      <td class="num">${o.status === "completed" ? money(o.total_profit) : "-"}</td>
      <td>${num(o.total_items)}</td>
      <td>${o.payment_method === "Cash" ? "كاش" : "بطاقة"}</td>
      <td><span class="badge ${statusClass(o.status)}">${arabicStatus(o.status)}</span></td>
      <td class="date-cell">${fmtDate(o.createdAt)}</td>
    </tr>`
    )
    .join("");
}

loadDashboard();
