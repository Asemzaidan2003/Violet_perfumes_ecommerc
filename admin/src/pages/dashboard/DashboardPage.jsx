import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { BarChart3, PackageCheck, RefreshCw, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { CartesianGrid, Legend, Line, LineChart, Pie, PieChart, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { arabicStatus, fmtDate, fmtDateShort, money, num, PAIR, paymentLabel, pct } from "@/lib/format";
import { bdi, ChartCard, EmptyState, ErrorState, PageHeader, StatCard } from "@/components/page";
import { ResponsiveTable } from "@/components/ResponsiveTable";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartLegendContent, ChartTooltipContent } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";

const arr = (v) => (Array.isArray(v) ? v : []);
const linkCls = "inline-flex min-h-11 items-center rounded-md px-2 text-sm font-semibold text-primary underline-offset-4 hover:underline";

const LINES = {
  revenue: { label: "المبيعات", theme: PAIR.teal },
  profit: { label: "الأرباح", theme: PAIR.amber },
};
const STATUS_COLORS = {
  pending: PAIR.amber, completed: PAIR.teal, canceled: PAIR.red, "ready for delivery": PAIR.blue, "in delivery": PAIR.cyan, "uncollected payment": PAIR.brown,
};
const FALLBACK = PAIR.slate;

const tipRow = (fmt) => (value, name, item) => (
  <>
    <span className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: item?.payload?.fill ?? item?.color }} aria-hidden />
    <span className="flex-1 text-muted-foreground">{name}</span>
    <span className="font-medium text-foreground">{bdi(fmt(value))}</span>
  </>
);

function TrendChart({ trend }) {
  const data = trend.map((t) => ({ label: fmtDateShort(t?.date), revenue: Number(t?.revenue) || 0, profit: Number(t?.profit) || 0 }));
  const summary = `اتجاه المبيعات والأرباح لآخر ${data.length} يوم: إجمالي المبيعات ${money(data.reduce((a, r) => a + r.revenue, 0))}، إجمالي الأرباح ${money(data.reduce((a, r) => a + r.profit, 0))}`;
  return (
    <ChartContainer config={LINES} role="img" aria-label={summary}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={12} />
        <YAxis width={52} tickLine={false} axisLine={false} allowDecimals={false} domain={[0, "auto"]} />
        <Tooltip content={<ChartTooltipContent formatter={tipRow(money)} />} />
        <Legend verticalAlign="bottom" content={<ChartLegendContent />} />
        <Line dataKey="revenue" name="المبيعات" type="monotone" stroke="var(--color-revenue)" strokeWidth={2} dot={false} />
        <Line dataKey="profit" name="الأرباح" type="monotone" stroke="var(--color-profit)" strokeWidth={2} dot={false} />
      </LineChart>
    </ChartContainer>
  );
}

function StatusChart({ breakdown }) {
  const rows = breakdown.map((b, i) => ({ key: `s${i}`, status: b?.status, count: Number(b?.count) || 0 })).filter((r) => r.count > 0);
  const config = {};
  const data = rows.map((r) => {
    config[r.key] = { label: `${arabicStatus(r.status)} · ${num(r.count)}`, theme: STATUS_COLORS[r.status] ?? FALLBACK };
    return { key: r.key, name: arabicStatus(r.status), count: r.count, fill: `var(--color-${r.key})` };
  });
  const summary = `توزيع الطلبات حسب الحالة: ${data.map((d) => `${d.name} ${num(d.count)}`).join("، ")}`;
  return (
    <ChartContainer config={config} role="img" aria-label={summary}>
      <PieChart>
        <Tooltip content={<ChartTooltipContent nameKey="key" formatter={tipRow(num)} />} />
        <Pie data={data} dataKey="count" nameKey="name" innerRadius="55%" outerRadius="80%" stroke="var(--card)" strokeWidth={2} />
        <Legend verticalAlign="bottom" content={<ChartLegendContent nameKey="key" className="flex-wrap" />} />
      </PieChart>
    </ChartContainer>
  );
}

const Section = ({ title, action, children }) => (
  <section className="rounded-xl border bg-card p-4 text-card-foreground">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-semibold">{title}</h2>
      {action}
    </div>
    <div className="mt-3">{children}</div>
  </section>
);

const Row = ({ lead, name, meta, value }) => (
  <li className="flex items-center gap-3 rounded-lg border p-3">
    {lead}
    <span className="min-w-0 flex-1">
      <span className="block break-words font-medium">{name}</span>
      {meta && <span className="block text-sm text-muted-foreground">{meta}</span>}
    </span>
    <span className="shrink-0 text-sm font-semibold">{value}</span>
  </li>
);

function TopProducts({ items }) {
  if (!items.length) return <EmptyState icon={ShoppingBag} title="لا توجد بيانات مبيعات بعد" />;
  return (
    <ul className="space-y-2">
      {items.map((p, i) => (
        <Row key={i} name={p?.name ?? "-"} meta={bdi(`${num(p?.quantity)} قطعة`)} value={bdi(money(p?.revenue))}
          lead={<span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-sm font-bold">{bdi(i + 1)}</span>} />
      ))}
    </ul>
  );
}

function LowStock({ oils, bottles }) {
  if (!oils.length && !bottles.length) return <EmptyState icon={PackageCheck} title="لا توجد تنبيهات، المخزون بحالة جيدة" />;
  const tone = "border-st-canceled-bg bg-st-canceled-bg text-st-canceled-fg";
  return (
    <ul className="space-y-2">
      {oils.map((o, i) => <li key={`o${o?._id ?? i}`} className={`flex items-center gap-3 rounded-lg border p-3 ${tone}`}>
        <span className="min-w-0 flex-1"><span className="block break-words font-medium">{o?.oil_name ?? "-"}</span><span className="block text-sm">زيت</span></span>
        <span className="shrink-0 text-sm font-semibold">{bdi(`${num(o?.oil_quantity)} ML`)}</span>
      </li>)}
      {bottles.map((b, i) => <li key={`b${b?._id ?? i}`} className={`flex items-center gap-3 rounded-lg border p-3 ${tone}`}>
        <span className="min-w-0 flex-1"><span className="block break-words font-medium">{b?.name ?? "-"}</span><span className="block text-sm">زجاجة</span></span>
        <span className="shrink-0 text-sm font-semibold">{bdi(`${num(b?.quantity)} قطعة`)}</span>
      </li>)}
    </ul>
  );
}

const ORDER_COLUMNS = [
  { key: "n", header: "رقم", cell: (_r, i) => bdi(i + 1) },
  { key: "total", header: "الإجمالي", cell: (r) => bdi(money(r?.final_total)) },
  { key: "profit", header: "الربح", cell: (r) => (r?.status === "completed" ? bdi(money(r?.total_profit)) : "-") },
  { key: "items", header: "عدد الأصناف", cell: (r) => bdi(num(r?.total_items)) },
  { key: "pay", header: "طريقة الدفع", cell: (r) => paymentLabel(r?.payment_method) },
  { key: "status", header: "الحالة", cell: (r) => <StatusBadge status={r?.status} /> },
  { key: "date", header: "التاريخ", cell: (r) => bdi(fmtDate(r?.createdAt)) },
];

function Loading() {
  return (
    <div className="space-y-4" role="status" aria-label="جارٍ التحميل">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-80" /><Skeleton className="h-80" /></div>
      <Skeleton className="h-64" />
    </div>
  );
}

export default function DashboardPage() {
  const q = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const body = await api("/reports/dashboard");
      if (!body?.data || typeof body.data !== "object") throw new Error("bad dashboard payload");
      return body.data;
    },
    staleTime: 0,
  });
  const d = q.data;
  const refresh = async () => { const r = await q.refetch(); if (r.isError) toast.error("تعذّر تحديث لوحة المعلومات"); };
  const g = d?.growth ?? {};
  const inv = d?.inventory ?? {};
  const pending = Number(d?.pending_orders_count) || 0;
  const low = Number(inv.low_stock_count) || 0;
  const trend = arr(d?.sales_trend);
  const breakdown = arr(d?.order_status_breakdown);
  const recent = arr(d?.recent_orders);
  const kpi = (label, v, growth, than) => {
    const gv = Number(growth) || 0;
    return <StatCard label={label} value={money(v)} trend={gv} sub={<>{bdi(pct(gv))} {than}</>} />;
  };

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader eyebrow="نظرة سريعة" title="لوحة المعلومات" actions={<>
        {q.dataUpdatedAt > 0 && <span className="text-sm text-muted-foreground">آخر تحديث: {bdi(new Date(q.dataUpdatedAt).toLocaleTimeString("en-GB"))}</span>}
        <Button type="button" variant="outline" className="h-11" disabled={q.isFetching} onClick={refresh}>
          <RefreshCw className={q.isFetching ? "animate-spin motion-reduce:animate-none" : ""} aria-hidden />تحديث
        </Button>
      </>} />
      {q.isError && !d ? <ErrorState title="تعذر تحميل لوحة المعلومات" hint="تأكد من أن الخادم يعمل ثم أعد المحاولة" onRetry={() => q.refetch()} />
        : !d ? <Loading />
        : <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {kpi("مبيعات اليوم", d.today?.revenue, g.revenue_vs_yesterday, "عن أمس")}
            {kpi("أرباح اليوم", d.today?.profit, g.profit_vs_yesterday, "عن أمس")}
            {kpi("مبيعات هذا الشهر", d.this_month?.revenue, g.revenue_vs_last_month, "عن الشهر الماضي")}
            {kpi("أرباح هذا الشهر", d.this_month?.profit, g.profit_vs_last_month, "عن الشهر الماضي")}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="طلبات قيد الانتظار" value={num(pending)} tone={pending > 0 ? "warning" : "default"} sub="تحتاج متابعة، وتشمل الطلبات بانتظار التأكيد" />
            <StatCard label="رأس المال في المخزون" value={money(inv.total_capital)} sub="زيوت + زجاجات + كحول" />
            <StatCard label="تنبيهات نقص المخزون" value={num(low)} tone={low > 0 ? "danger" : "default"} sub={low > 0 ? "يحتاج إعادة تعبئة" : "المخزون جيد"} />
            <StatCard label="زبائن جدد هذا الشهر" value={num(d.new_customers_this_month)} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="اتجاه المبيعات (آخر 14 يوم)" description="المبيعات المكتملة فقط">
              {trend.length ? <TrendChart trend={trend} /> : <EmptyState icon={BarChart3} title="لا توجد بيانات" />}
            </ChartCard>
            <ChartCard title="حالة الطلبات">
              {breakdown.some((b) => Number(b?.count) > 0) ? <StatusChart breakdown={breakdown} /> : <EmptyState icon={BarChart3} title="لا توجد طلبات بعد" />}
            </ChartCard>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="الأكثر مبيعًا (30 يوم)"><TopProducts items={arr(d.top_products_30d)} /></Section>
            <Section title="تنبيهات نقص المخزون" action={<Link to="/reports?tab=inventory" className={linkCls}>عرض الكل</Link>}>
              <LowStock oils={arr(inv.low_stock_oils)} bottles={arr(inv.low_stock_bottles)} />
            </Section>
          </div>
          <Section title="آخر الطلبات" action={<Link to="/orders" className={linkCls}>عرض جميع الطلبات</Link>}>
            <ResponsiveTable columns={ORDER_COLUMNS} rows={recent} rowKey={(r) => r?._id ?? JSON.stringify(r)}
              emptyState={<EmptyState icon={ShoppingBag} title="لا توجد طلبات بعد" />} />
          </Section>
        </>}
    </div>
  );
}
