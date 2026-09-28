import Order from "../models/order.model.js";
import Oil from "../models/oil.model.js";
import Bottle from "../models/bottle.model.js";
import Alcohol from "../models/alcohol.model.js";
import Product from "../models/product.model.js";
import Customer from "../models/customer.model.js";

/*
  ============================================================================
  Reporting & Dashboard logic
  ============================================================================
  Design notes:
  - "status = completed" is treated as the point an order's revenue/profit is
    realized (this mirrors the existing behaviour already used on the
    orders list page, where profit is only summed for completed orders).
    Every revenue/profit figure below defaults to that status, but it can be
    widened with ?status=all (every status except "canceled") or a specific
    status via ?status=pending|completed|... for operational visibility.
  - All dates are treated as inclusive day boundaries (00:00:00 -> 23:59:59)
    in the server's local time zone.
  - Numbers are rounded to 2 decimals before leaving the API.
  ============================================================================
*/

const REALIZED_STATUS = "completed";

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------
const round2 = (n) => Math.round(((n || 0) + Number.EPSILON) * 100) / 100;

const pctChange = (curr, prev) => {
  if (!prev) return curr ? 100 : 0;
  return round2(((curr - prev) / prev) * 100);
};

const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const endOfDay = (d) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};
const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const startOfMonth = (d) => {
  const x = new Date(d.getFullYear(), d.getMonth(), 1);
  x.setHours(0, 0, 0, 0);
  return x;
};
const endOfMonth = (d) => endOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0));

// Builds the $match status clause based on a "status" query param.
// - undefined/"completed" (default) -> only realized/completed orders
// - "all"                            -> every status except canceled
// - any explicit value               -> that exact status
// Unconfirmed online orders (stock_deducted: false) are excluded from every
// branch: they haven't had stock deducted yet, so their revenue has no
// matching cost and would inflate profit. Legacy orders have no field or
// `true`, which `$ne: false` still matches.
const statusMatch = (statusParam) => {
  const confirmed = { stock_deducted: { $ne: false } };
  if (!statusParam || statusParam === REALIZED_STATUS) return { status: REALIZED_STATUS, ...confirmed };
  if (statusParam === "all") return { status: { $ne: "canceled" }, ...confirmed };
  return { status: statusParam, ...confirmed };
};

// Parses ?from & ?to (YYYY-MM-DD) into inclusive Date boundaries.
// Falls back to the last `defaultDays` days when not provided.
const parseDateRange = (query, defaultDays = 30) => {
  const to = query.to ? endOfDay(new Date(query.to)) : endOfDay(new Date());
  const from = query.from
    ? startOfDay(new Date(query.from))
    : startOfDay(addDays(to, -(defaultDays - 1)));
  return { from, to };
};

// Aggregates the core money/volume metrics for a set of orders matching `match`.
const summarizeOrders = async (match) => {
  const [row] = await Order.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        revenue: { $sum: "$final_total" },
        cost: { $sum: "$total_cost" },
        profit: { $sum: "$total_profit" },
        orders_count: { $sum: 1 },
        items_count: { $sum: "$total_items" },
      },
    },
  ]);

  const r = row || { revenue: 0, cost: 0, profit: 0, orders_count: 0, items_count: 0 };
  return {
    revenue: round2(r.revenue),
    cost: round2(r.cost),
    profit: round2(r.profit),
    orders_count: r.orders_count,
    items_count: r.items_count,
    avg_order_value: r.orders_count ? round2(r.revenue / r.orders_count) : 0,
    profit_margin: r.revenue ? round2((r.profit / r.revenue) * 100) : 0,
  };
};

// ---------------------------------------------------------------------------
// 1) DASHBOARD SUMMARY  ->  GET /api/reports/dashboard
// ---------------------------------------------------------------------------
export const getDashboardSummary = async (req, res) => {
    const now = new Date();
    const today = { from: startOfDay(now), to: endOfDay(now) };
    const yesterday = { from: startOfDay(addDays(now, -1)), to: endOfDay(addDays(now, -1)) };
    const thisMonth = { from: startOfMonth(now), to: endOfDay(now) };
    const lastMonthAnchor = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonth = { from: startOfMonth(lastMonthAnchor), to: endOfMonth(lastMonthAnchor) };

    const baseStatus = { status: REALIZED_STATUS };

    const [
      todayStats,
      yesterdayStats,
      thisMonthStats,
      lastMonthStats,
      allTimeStats,
      salesTrend,
      statusBreakdown,
      paymentBreakdown,
      topProducts,
      lowStockOils,
      lowStockBottles,
      oilCapital,
      bottleCapital,
      alcohol,
      recentOrders,
      newCustomersThisMonth,
      pendingOrdersCount,
    ] = await Promise.all([
      summarizeOrders({ ...baseStatus, createdAt: { $gte: today.from, $lte: today.to } }),
      summarizeOrders({ ...baseStatus, createdAt: { $gte: yesterday.from, $lte: yesterday.to } }),
      summarizeOrders({ ...baseStatus, createdAt: { $gte: thisMonth.from, $lte: thisMonth.to } }),
      summarizeOrders({ ...baseStatus, createdAt: { $gte: lastMonth.from, $lte: lastMonth.to } }),
      summarizeOrders(baseStatus),

      // last 14 days daily trend (realized orders)
      Order.aggregate([
        {
          $match: {
            ...baseStatus,
            createdAt: { $gte: startOfDay(addDays(now, -13)), $lte: endOfDay(now) },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            revenue: { $sum: "$final_total" },
            profit: { $sum: "$total_profit" },
            orders_count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // status breakdown, all orders (operational backlog visibility)
      Order.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 }, revenue: { $sum: "$final_total" } } },
      ]),

      // payment method breakdown, realized orders only
      Order.aggregate([
        { $match: baseStatus },
        {
          $group: {
            _id: "$payment_method",
            count: { $sum: 1 },
            revenue: { $sum: "$final_total" },
          },
        },
      ]),

      // top 5 products in the last 30 days by revenue
      Order.aggregate([
        {
          $match: {
            ...baseStatus,
            createdAt: { $gte: startOfDay(addDays(now, -29)), $lte: endOfDay(now) },
          },
        },
        { $unwind: "$products" },
        {
          $group: {
            _id: "$products.p_name",
            revenue: { $sum: "$products.total_revenue" },
            profit: { $sum: "$products.total_profit" },
            quantity: { $sum: "$products.quantity" },
          },
        },
        { $sort: { revenue: -1 } },
        { $limit: 5 },
      ]),

      Oil.find({ oil_quantity: { $lte: 100 } }).sort({ oil_quantity: 1 }).limit(10),
      Bottle.find({ quantity: { $lte: 20 } }).sort({ quantity: 1 }).limit(10),

      Oil.aggregate([
        {
          $group: {
            _id: null,
            quantity: { $sum: { $max: [0, "$oil_quantity"] } },
            capital: { $sum: { $multiply: [{ $max: [0, "$oil_quantity"] }, "$oil_cost"] } },
          },
        },
      ]),
      Bottle.aggregate([
        {
          $group: {
            _id: null,
            quantity: { $sum: { $max: [0, "$quantity"] } },
            capital: { $sum: { $multiply: [{ $max: [0, "$quantity"] }, "$cost"] } },
          },
        },
      ]),
      Alcohol.find({}),

      Order.find({}).sort({ createdAt: -1 }).limit(6).select(
        "final_total total_profit status payment_method total_items createdAt customer_id"
      ),

      Customer.countDocuments({ createdAt: { $gte: thisMonth.from, $lte: thisMonth.to } }),
      Order.countDocuments({ status: "pending" }),
    ]);

    const alcoholCapital = alcohol.reduce((sum, a) => sum + Math.max(0, a.quantity) * a.cost, 0);
    const alcoholQuantity = alcohol.reduce((sum, a) => sum + Math.max(0, a.quantity), 0);

    // Fill in missing days on the trend so the chart has no gaps
    const trendMap = new Map(salesTrend.map((d) => [d._id, d]));
    const filledTrend = [];
    for (let i = 13; i >= 0; i--) {
      const day = addDays(now, -i);
      const key = day.toISOString().slice(0, 10);
      const found = trendMap.get(key);
      filledTrend.push({
        date: key,
        revenue: round2(found?.revenue || 0),
        profit: round2(found?.profit || 0),
        orders_count: found?.orders_count || 0,
      });
    }

    res.status(200).json({
      success: true,
      data: {
        today: todayStats,
        yesterday: yesterdayStats,
        this_month: thisMonthStats,
        last_month: lastMonthStats,
        all_time: allTimeStats,
        growth: {
          revenue_vs_yesterday: pctChange(todayStats.revenue, yesterdayStats.revenue),
          profit_vs_yesterday: pctChange(todayStats.profit, yesterdayStats.profit),
          revenue_vs_last_month: pctChange(thisMonthStats.revenue, lastMonthStats.revenue),
          profit_vs_last_month: pctChange(thisMonthStats.profit, lastMonthStats.profit),
        },
        sales_trend: filledTrend,
        order_status_breakdown: statusBreakdown.map((s) => ({
          status: s._id,
          count: s.count,
          revenue: round2(s.revenue),
        })),
        payment_method_breakdown: paymentBreakdown.map((p) => ({
          method: p._id,
          count: p.count,
          revenue: round2(p.revenue),
        })),
        top_products_30d: topProducts.map((p) => ({
          name: p._id,
          revenue: round2(p.revenue),
          profit: round2(p.profit),
          quantity: p.quantity,
        })),
        inventory: {
          oil_quantity: round2(oilCapital[0]?.quantity || 0),
          oil_capital: round2(oilCapital[0]?.capital || 0),
          bottle_quantity: round2(bottleCapital[0]?.quantity || 0),
          bottle_capital: round2(bottleCapital[0]?.capital || 0),
          alcohol_quantity: round2(alcoholQuantity),
          alcohol_capital: round2(alcoholCapital),
          total_capital: round2(
            (oilCapital[0]?.capital || 0) + (bottleCapital[0]?.capital || 0) + alcoholCapital
          ),
          low_stock_oils: lowStockOils,
          low_stock_bottles: lowStockBottles,
          low_stock_count: lowStockOils.length + lowStockBottles.length,
        },
        recent_orders: recentOrders,
        new_customers_this_month: newCustomersThisMonth,
        pending_orders_count: pendingOrdersCount,
      },
    });
};

// ---------------------------------------------------------------------------
// 2) SALES REPORT  ->  GET /api/reports/sales?from&to&groupBy=day|week|month&status
// ---------------------------------------------------------------------------
export const getSalesReport = async (req, res) => {
    const { from, to } = parseDateRange(req.query, 30);
    const groupBy = ["day", "week", "month"].includes(req.query.groupBy) ? req.query.groupBy : "day";
    const match = { ...statusMatch(req.query.status), createdAt: { $gte: from, $lte: to } };

    let dateFormat = "%Y-%m-%d";
    if (groupBy === "week") dateFormat = "%G-W%V"; // ISO week
    if (groupBy === "month") dateFormat = "%Y-%m";

    const [series, totals] = await Promise.all([
      Order.aggregate([
        { $match: match },
        {
          $group: {
            _id: { $dateToString: { format: dateFormat, date: "$createdAt" } },
            revenue: { $sum: "$final_total" },
            cost: { $sum: "$total_cost" },
            profit: { $sum: "$total_profit" },
            orders_count: { $sum: 1 },
            items_count: { $sum: "$total_items" },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      summarizeOrders(match),
    ]);

    res.status(200).json({
      success: true,
      data: {
        from,
        to,
        group_by: groupBy,
        totals,
        series: series.map((s) => ({
          period: s._id,
          revenue: round2(s.revenue),
          cost: round2(s.cost),
          profit: round2(s.profit),
          orders_count: s.orders_count,
          items_count: s.items_count,
          avg_order_value: s.orders_count ? round2(s.revenue / s.orders_count) : 0,
        })),
      },
    });
};

// ---------------------------------------------------------------------------
// 3) PRODUCTS REPORT  ->  GET /api/reports/products?from&to&limit&sortBy&status
// ---------------------------------------------------------------------------
export const getProductsReport = async (req, res) => {
    const { from, to } = parseDateRange(req.query, 30);
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    const sortField = ["revenue", "quantity", "profit"].includes(req.query.sortBy) ? req.query.sortBy : "revenue";
    const match = { ...statusMatch(req.query.status), createdAt: { $gte: from, $lte: to } };

    const [byProduct, byCategory, bySize] = await Promise.all([
      Order.aggregate([
        { $match: match },
        { $unwind: "$products" },
        {
          $group: {
            _id: { product_id: "$products.product_id", name: "$products.p_name" },
            revenue: { $sum: "$products.total_revenue" },
            cost: { $sum: "$products.total_cost" },
            profit: { $sum: "$products.total_profit" },
            quantity: { $sum: "$products.quantity" },
            orders_count: { $sum: 1 },
          },
        },
        { $sort: { [sortField]: -1 } },
        { $limit: limit },
        {
          $lookup: {
            from: "products",
            localField: "_id.product_id",
            foreignField: "_id",
            as: "product_info",
          },
        },
        {
          $project: {
            _id: 0,
            product_id: "$_id.product_id",
            name: "$_id.name",
            category: { $arrayElemAt: ["$product_info.p_category", 0] },
            revenue: { $round: ["$revenue", 2] },
            cost: { $round: ["$cost", 2] },
            profit: { $round: ["$profit", 2] },
            quantity: 1,
            orders_count: 1,
            profit_margin: {
              $cond: [
                { $eq: ["$revenue", 0] },
                0,
                { $round: [{ $multiply: [{ $divide: ["$profit", "$revenue"] }, 100] }, 2] },
              ],
            },
          },
        },
      ]),

      // revenue/profit grouped by category (requires joining line items to products)
      Order.aggregate([
        { $match: match },
        { $unwind: "$products" },
        {
          $lookup: {
            from: "products",
            localField: "products.product_id",
            foreignField: "_id",
            as: "product_info",
          },
        },
        {
          $group: {
            _id: { $ifNull: [{ $arrayElemAt: ["$product_info.p_category", 0] }, "غير مصنف"] },
            revenue: { $sum: "$products.total_revenue" },
            profit: { $sum: "$products.total_profit" },
            quantity: { $sum: "$products.quantity" },
          },
        },
        { $sort: { revenue: -1 } },
      ]),

      // which sizes sell best
      Order.aggregate([
        { $match: match },
        { $unwind: "$products" },
        {
          $group: {
            _id: "$products.product_size",
            revenue: { $sum: "$products.total_revenue" },
            quantity: { $sum: "$products.quantity" },
          },
        },
        { $sort: { quantity: -1 } },
      ]),
    ]);

    res.status(200).json({
      success: true,
      data: {
        from,
        to,
        top_products: byProduct,
        by_category: byCategory.map((c) => ({
          category: c._id,
          revenue: round2(c.revenue),
          profit: round2(c.profit),
          quantity: c.quantity,
        })),
        by_size: bySize.map((s) => ({
          size: s._id,
          revenue: round2(s.revenue),
          quantity: s.quantity,
        })),
      },
    });
};

// ---------------------------------------------------------------------------
// 4) INVENTORY REPORT  ->  GET /api/reports/inventory?oilThreshold&bottleThreshold
// ---------------------------------------------------------------------------
export const getInventoryReport = async (req, res) => {
    const oilThreshold = parseFloat(req.query.oilThreshold) || 100;
    const bottleThreshold = parseFloat(req.query.bottleThreshold) || 20;

    const [oils, bottles, alcohol, productStatusCounts] = await Promise.all([
      Oil.find({}).sort({ oil_quantity: 1 }),
      Bottle.find({}).sort({ quantity: 1 }),
      Alcohol.find({}),
      Product.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    ]);

    const oilRows = oils.map((o) => ({
      id: o.id,
      name: o.oil_name,
      quantity: o.oil_quantity,
      cost: o.oil_cost,
      value: round2(Math.max(0, o.oil_quantity) * o.oil_cost),
      status: o.status,
      low_stock: o.oil_quantity <= oilThreshold,
    }));

    const bottleRows = bottles.map((b) => ({
      id: b._id,
      name: b.name,
      capacity: b.capacity,
      quantity: b.quantity,
      cost: b.cost,
      value: round2(Math.max(0, b.quantity) * b.cost),
      low_stock: b.quantity <= bottleThreshold,
    }));

    const alcoholRows = alcohol.map((a) => ({
      id: a._id,
      name: a.name,
      type: a.type,
      quantity: a.quantity,
      cost: a.cost,
      value: round2(Math.max(0, a.quantity) * a.cost),
    }));

    const totals = {
      oil_quantity: round2(oilRows.reduce((s, o) => s + Math.max(0, o.quantity), 0)),
      oil_capital: round2(oilRows.reduce((s, o) => s + o.value, 0)),
      bottle_quantity: round2(bottleRows.reduce((s, b) => s + Math.max(0, b.quantity), 0)),
      bottle_capital: round2(bottleRows.reduce((s, b) => s + b.value, 0)),
      alcohol_quantity: round2(alcoholRows.reduce((s, a) => s + Math.max(0, a.quantity), 0)),
      alcohol_capital: round2(alcoholRows.reduce((s, a) => s + a.value, 0)),
    };
    totals.total_capital = round2(totals.oil_capital + totals.bottle_capital + totals.alcohol_capital);

    res.status(200).json({
      success: true,
      data: {
        oils: oilRows,
        bottles: bottleRows,
        alcohol: alcoholRows,
        totals,
        low_stock_oils: oilRows.filter((o) => o.low_stock),
        low_stock_bottles: bottleRows.filter((b) => b.low_stock),
        product_status_breakdown: productStatusCounts.map((p) => ({ status: p._id, count: p.count })),
      },
    });
};

// ---------------------------------------------------------------------------
// 5) CUSTOMERS REPORT  ->  GET /api/reports/customers?from&to&limit&status
// ---------------------------------------------------------------------------
export const getCustomersReport = async (req, res) => {
    const { from, to } = parseDateRange(req.query, 90);
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    const match = {
      ...statusMatch(req.query.status),
      createdAt: { $gte: from, $lte: to },
      customer_id: { $ne: null },
    };

    const [topCustomers, newCustomersSeries, customerTypeBreakdown, totalCustomers, ordersWithoutCustomer] =
      await Promise.all([
        Order.aggregate([
          { $match: match },
          {
            $group: {
              _id: "$customer_id",
              total_spent: { $sum: "$final_total" },
              orders_count: { $sum: 1 },
              last_order_at: { $max: "$createdAt" },
            },
          },
          { $sort: { total_spent: -1 } },
          { $limit: limit },
          {
            $lookup: {
              from: "customers",
              localField: "_id",
              foreignField: "_id",
              as: "customer_info",
            },
          },
          {
            $project: {
              _id: 0,
              customer_id: "$_id",
              name: { $arrayElemAt: ["$customer_info.name", 0] },
              phone: { $arrayElemAt: ["$customer_info.phone", 0] },
              type: { $arrayElemAt: ["$customer_info.type", 0] },
              total_spent: { $round: ["$total_spent", 2] },
              orders_count: 1,
              avg_order_value: { $round: [{ $divide: ["$total_spent", "$orders_count"] }, 2] },
              last_order_at: 1,
            },
          },
        ]),

        Customer.aggregate([
          { $match: { createdAt: { $gte: from, $lte: to } } },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]),

        Customer.aggregate([{ $group: { _id: "$type", count: { $sum: 1 } } }]),

        Customer.countDocuments({}),
        Order.countDocuments({ ...statusMatch(req.query.status), createdAt: { $gte: from, $lte: to }, customer_id: null }),
      ]);

    res.status(200).json({
      success: true,
      data: {
        from,
        to,
        top_customers: topCustomers,
        new_customers_series: newCustomersSeries.map((d) => ({ date: d._id, count: d.count })),
        customer_type_breakdown: customerTypeBreakdown.map((c) => ({ type: c._id, count: c.count })),
        total_customers: totalCustomers,
        walk_in_orders_in_range: ordersWithoutCustomer,
      },
    });
};
