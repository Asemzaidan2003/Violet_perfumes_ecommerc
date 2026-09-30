import { useQuery } from "@tanstack/react-query";
import { Download, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, Pie, PieChart, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import { reportQuery } from "@/lib/dates";
import { fmtDate, money, num } from "@/lib/format";
import { ChartCard, EmptyState, ErrorState, StatCard } from "@/components/page";
import { ResponsiveTable } from "@/components/ResponsiveTable";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartLegendContent, ChartTooltipContent } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";

const bdi = (v) => <bdi dir="ltr">{v}</bdi>;
const n2 = (v) => Number(v) || 0;
const CUSTOMER_TYPE_LABEL = { individual: "فرد", store: "محل" };
const typeLabel = (t) => CUSTOMER_TYPE_LABEL[t] ?? (t == null ? "-" : String(t));

const NEW_CUSTOMERS = { count: { label: "زبائن جدد", theme: { light: "#2b52a3", dark: "#7ea2f0" } } };
const countTip = (value, name, item) => (
  <>
    <span className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: item?.color }} aria-hidden />
    <span className="flex-1 text-muted-foreground">{name}</span>
    <span className="font-medium text-foreground">{bdi(num(value))}</span>
  </>
);

function NewCustomersChart({ series }) {
  const data = series.map((s) => ({ date: s?.date ?? "-", count: n2(s?.count) }));
  const summary = `زبائن جدد خلال الفترة: ${data.length} يوم`;
  return (
    <ChartContainer config={NEW_CUSTOMERS} role="img" aria-label={summary}>
      <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={12} />
        <YAxis width={40} tickLine={false} axisLine={false} allowDecimals={false} domain={[0, "auto"]} />
        <Tooltip content={<ChartTooltipContent formatter={countTip} />} />
        <Bar dataKey="count" name="زبائن جدد" fill="var(--color-count)" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}

const TYPE_LABEL = { individual: "أفراد", store: "محلات" };
function CustomerTypeChart({ breakdown }) {
  const rows = breakdown.map((b, i) => ({ key: `t${i}`, type: b?.type, count: n2(b?.count) })).filter((r) => r.count > 0);
  const config = {};
  const data = rows.map((r) => {
    const label = TYPE_LABEL[r.type] ?? (r.type == null ? "-" : String(r.type));
    config[r.key] = { label, theme: { light: "#0c6e63", dark: "#2bb5a4" } };
    return { key: r.key, name: label, count: r.count, fill: `var(--color-${r.key})` };
  });
  const summary = `نوع الزبائن: ${data.map((d) => `${d.name} ${num(d.count)}`).join("، ")}`;
  return (
    <ChartContainer config={config} role="img" aria-label={summary}>
      <PieChart>
        <Tooltip content={<ChartTooltipContent nameKey="key" formatter={countTip} />} />
        <Pie data={data} dataKey="count" nameKey="name" innerRadius="55%" outerRadius="80%" stroke="var(--card)" strokeWidth={2} />
        <Legend verticalAlign="bottom" content={<ChartLegendContent nameKey="key" className="flex-wrap" />} />
      </PieChart>
    </ChartContainer>
  );
}

const CUSTOMER_COLUMNS = [
  { key: "name", header: "الاسم", cell: (r) => r.name ?? "-" },
  { key: "phone", header: "الهاتف", cell: (r) => (r.phone ? bdi(r.phone) : "-") },
  { key: "type", header: "النوع", cell: (r) => (r.name ? typeLabel(r.type) : "-") },
  { key: "orders", header: "عدد الطلبات", cell: (r) => bdi(num(r.orders_count)) },
  { key: "spent", header: "إجمالي الإنفاق", cell: (r) => bdi(money(r.total_spent)) },
  { key: "avg", header: "متوسط الطلب", cell: (r) => bdi(money(r.avg_order_value)) },
  { key: "last", header: "آخر طلب", cell: (r) => bdi(fmtDate(r.last_order_at)) },
];

function Loading() {
  return (
    <div className="space-y-4" role="status" aria-label="جارٍ التحميل">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-80" /><Skeleton className="h-80" /></div>
      <Skeleton className="h-64" />
    </div>
  );
}

export default function CustomersTab({ filters }) {
  const qs = reportQuery({ from: filters.from, to: filters.to, status: filters.status, limit: 15 });
  const q = useQuery({
    queryKey: ["reports", "customers", qs],
    queryFn: async () => {
      const body = await api(`/reports/customers?${qs}`);
      if (!Array.isArray(body?.data?.top_customers)) throw new Error("bad customers payload");
      return body.data;
    },
  });
  const d = q.data;
  const topCustomers = d?.top_customers ?? [];
  const series = d?.new_customers_series ?? [];
  const breakdown = d?.customer_type_breakdown ?? [];
  const top = topCustomers[0];
  const exportCsv = () => downloadCsv("customers-report.csv", ["Name", "Phone", "Type", "Orders", "Total Spent", "Avg Order", "Last Order"],
    topCustomers.map((c) => [c.name ?? "-", c.phone ?? "-", c.type ?? "-", c.orders_count, c.total_spent, c.avg_order_value, c.last_order_at]));

  return (
    <div className="space-y-4">
      {q.isError && !d ? <ErrorState title="تعذر تحميل التقرير" hint="تأكد من أن الخادم يعمل ثم أعد المحاولة" onRetry={() => q.refetch()} />
        : !d ? <Loading />
        : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard label="إجمالي عدد الزبائن" value={num(d.total_customers)} />
          <StatCard label="طلبات بدون زبون مسجل" value={num(d.walk_in_orders_in_range)} />
          <StatCard label="أعلى زبون إنفاقًا" value={top ? money(top.total_spent) : "-"} sub={top?.name ?? "-"} tone="accent" />
        </div>}
      {d && (topCustomers.length === 0 ? <EmptyState icon={Users} title="لا توجد بيانات لهذه الفترة" /> : <>
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="زبائن جدد خلال الفترة"><NewCustomersChart series={series} /></ChartCard>
          <ChartCard title="نوع الزبائن"><CustomerTypeChart breakdown={breakdown} /></ChartCard>
        </div>
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">أفضل الزبائن</h2>
            <Button type="button" variant="outline" className="h-11" onClick={exportCsv}><Download aria-hidden />تصدير CSV</Button>
          </div>
          <ResponsiveTable columns={CUSTOMER_COLUMNS} rows={topCustomers} rowKey={(r, i) => r.customer_id ?? i} />
        </section>
      </>)}
    </div>
  );
}
