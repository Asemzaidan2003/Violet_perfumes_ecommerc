import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Download } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import { reportQuery } from "@/lib/dates";
import { money, num } from "@/lib/format";
import { ChartCard, EmptyState, ErrorState, StatCard } from "@/components/page";
import { ResponsiveTable } from "@/components/ResponsiveTable";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartLegendContent, ChartTooltipContent } from "@/components/ui/chart";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

const bdi = (v) => <bdi dir="ltr">{v}</bdi>;
const n2 = (v) => Number(v) || 0;

// Light/dark pairs shared with the dashboard chart palette.
const SERIES = {
  revenue: { label: "المبيعات", theme: { light: "#0c6e63", dark: "#2bb5a4" } },
  cost: { label: "التكلفة", theme: { light: "#52585f", dark: "#a7b0ba" } },
  profit: { label: "الربح", theme: { light: "#b7791f", dark: "#f0b94a" } },
};
const tip = (value, name, item) => (
  <>
    <span className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: item?.color }} aria-hidden />
    <span className="flex-1 text-muted-foreground">{name}</span>
    <span className="font-medium text-foreground">{bdi(money(value))}</span>
  </>
);

const COLUMNS = [
  { key: "period", header: "الفترة", cell: (r) => bdi(r.period) },
  { key: "revenue", header: "المبيعات", cell: (r) => bdi(money(r.revenue)) },
  { key: "cost", header: "التكلفة", cell: (r) => bdi(money(r.cost)) },
  { key: "profit", header: "الربح", cell: (r) => bdi(money(r.profit)) },
  { key: "orders", header: "عدد الطلبات", cell: (r) => bdi(num(r.orders_count)) },
  { key: "avg", header: "متوسط قيمة الطلب", cell: (r) => bdi(money(r.avg_order_value)) },
];

function Loading() {
  return (
    <div className="space-y-4" role="status" aria-label="جارٍ التحميل">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      <Skeleton className="h-80" />
      <Skeleton className="h-64" />
    </div>
  );
}

function Trend({ series }) {
  const data = series.map((s) => ({ period: s.period, revenue: n2(s.revenue), cost: n2(s.cost), profit: n2(s.profit) }));
  const label = `اتجاه المبيعات والتكلفة والربح: ${data.length} فترة، إجمالي المبيعات ${money(data.reduce((a, r) => a + r.revenue, 0))}`;
  return (
    <ChartContainer config={SERIES} role="img" aria-label={label}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="period" tickLine={false} axisLine={false} tickMargin={8} minTickGap={12} />
        <YAxis width={56} tickLine={false} axisLine={false} domain={[0, "auto"]} />
        <Tooltip content={<ChartTooltipContent formatter={tip} />} />
        <Legend verticalAlign="bottom" content={<ChartLegendContent />} />
        <Bar dataKey="revenue" name="المبيعات" fill="var(--color-revenue)" radius={[3, 3, 0, 0]} />
        <Bar dataKey="cost" name="التكلفة" fill="var(--color-cost)" radius={[3, 3, 0, 0]} />
        <Line dataKey="profit" name="الربح" type="monotone" stroke="var(--color-profit)" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ChartContainer>
  );
}

export default function SalesTab({ filters }) {
  const [groupBy, setGroupBy] = useState("day");
  const qs = reportQuery({ from: filters.from, to: filters.to, status: filters.status, groupBy });
  const q = useQuery({
    queryKey: ["reports", "sales", qs],
    queryFn: async () => {
      const body = await api(`/reports/sales?${qs}`);
      if (!body?.data?.totals || !Array.isArray(body.data.series)) throw new Error("bad sales payload");
      return body.data;
    },
  });
  const d = q.data;
  const t = d?.totals ?? {};
  const series = d?.series ?? [];
  const exportCsv = () => downloadCsv("sales-report.csv", ["Period", "Revenue", "Cost", "Profit", "Orders", "Avg Order Value"],
    series.map((s) => [s.period, s.revenue, s.cost, s.profit, s.orders_count, s.avg_order_value]));

  return (
    <div className="space-y-4">
      {q.isError && !d ? <ErrorState title="تعذر تحميل التقرير" hint="تأكد من أن الخادم يعمل ثم أعد المحاولة" onRetry={() => q.refetch()} />
        : !d ? <Loading />
        : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard label="إجمالي المبيعات" value={money(t.revenue)} />
          <StatCard label="إجمالي التكلفة" value={money(t.cost)} />
          <StatCard label="إجمالي الربح" value={money(t.profit)} tone="accent" />
          <StatCard label="هامش الربح" value={`${n2(t.profit_margin).toFixed(1)}%`} />
          <StatCard label="عدد الطلبات" value={num(t.orders_count)} />
          <StatCard label="متوسط قيمة الطلب" value={money(t.avg_order_value)} />
        </div>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">اتجاه المبيعات</h2>
        <div className="flex items-center gap-2">
          <Label htmlFor="rep-group">تجميع حسب</Label>
          <NativeSelect id="rep-group" className="w-32" value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
            <option value="day">يوم</option><option value="week">أسبوع</option><option value="month">شهر</option>
          </NativeSelect>
        </div>
      </div>
      {d && (series.length === 0 ? <EmptyState icon={BarChart3} title="لا توجد بيانات لهذه الفترة" /> : <>
        <ChartCard title="المبيعات والتكلفة والربح"><Trend series={series} /></ChartCard>
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">تفاصيل الفترات</h2>
            <Button type="button" variant="outline" className="h-11" onClick={exportCsv}><Download aria-hidden />تصدير CSV</Button>
          </div>
          <ResponsiveTable columns={COLUMNS} rows={series} rowKey={(r) => r.period} />
        </section>
      </>)}
    </div>
  );
}
