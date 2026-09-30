import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Package } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, Pie, PieChart, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import { CHART_COLORS, money, num } from "@/lib/format";
import { reportQuery } from "@/lib/dates";
import { ChartCard, EmptyState, ErrorState } from "@/components/page";
import { ResponsiveTable } from "@/components/ResponsiveTable";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartLegendContent, ChartTooltipContent } from "@/components/ui/chart";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

const bdi = (v) => <bdi dir="ltr">{v}</bdi>;
const n2 = (v) => Number(v) || 0;

const REVENUE_SERIES = { revenue: { label: "الإيرادات", theme: { light: "#0c6e63", dark: "#2bb5a4" } } };
const revTip = (value, name, item) => (
  <>
    <span className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: item?.color }} aria-hidden />
    <span className="flex-1 text-muted-foreground">{name}</span>
    <span className="font-medium text-foreground">{bdi(money(value))}</span>
  </>
);

function TopProductsChart({ items }) {
  const data = items.map((p) => ({ name: p?.name ?? "-", revenue: n2(p?.revenue) }));
  const summary = `الأكثر مبيعًا: ${data.length} منتج`;
  return (
    <ChartContainer config={REVENUE_SERIES} role="img" aria-label={summary}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" tickLine={false} axisLine={false} domain={[0, "auto"]} />
        <YAxis type="category" dataKey="name" width={100} tickLine={false} axisLine={false} />
        <Tooltip content={<ChartTooltipContent formatter={revTip} />} />
        <Bar dataKey="revenue" name="الإيرادات" fill="var(--color-revenue)" radius={[0, 3, 3, 0]} />
      </BarChart>
    </ChartContainer>
  );
}

function CategoryChart({ items }) {
  const rows = items.map((c, i) => ({ key: `c${i}`, category: c?.category ?? "-", revenue: n2(c?.revenue) })).filter((r) => r.revenue > 0);
  const config = {};
  const data = rows.map((r, i) => {
    config[r.key] = { label: r.category, theme: { light: CHART_COLORS.palette[i % CHART_COLORS.palette.length], dark: CHART_COLORS.palette[i % CHART_COLORS.palette.length] } };
    return { key: r.key, name: r.category, revenue: r.revenue, fill: `var(--color-${r.key})` };
  });
  const summary = `الإيرادات حسب الفئة: ${data.map((d) => `${d.name} ${money(d.revenue)}`).join("، ")}`;
  return (
    <ChartContainer config={config} role="img" aria-label={summary}>
      <PieChart>
        <Tooltip content={<ChartTooltipContent nameKey="key" formatter={revTip} />} />
        <Pie data={data} dataKey="revenue" nameKey="name" outerRadius="80%" stroke="var(--card)" strokeWidth={2} />
        <Legend verticalAlign="bottom" content={<ChartLegendContent nameKey="key" className="flex-wrap" />} />
      </PieChart>
    </ChartContainer>
  );
}

const PRODUCT_COLUMNS = [
  { key: "name", header: "المنتج", cell: (r) => r.name ?? "-" },
  { key: "category", header: "الفئة", cell: (r) => r.category ?? "-" },
  { key: "quantity", header: "الكمية", cell: (r) => bdi(num(r.quantity)) },
  { key: "revenue", header: "الإيرادات", cell: (r) => bdi(money(r.revenue)) },
  { key: "cost", header: "التكلفة", cell: (r) => bdi(money(r.cost)) },
  { key: "profit", header: "الربح", cell: (r) => bdi(money(r.profit)) },
  { key: "margin", header: "هامش الربح", cell: (r) => bdi(`${n2(r.profit_margin).toFixed(1)}%`) },
];

const SIZE_COLUMNS = [
  { key: "size", header: "الحجم", cell: (r) => bdi(r.size ?? "-") },
  { key: "quantity", header: "الكمية المباعة", cell: (r) => bdi(num(r.quantity)) },
  { key: "revenue", header: "الإيرادات", cell: (r) => bdi(money(r.revenue)) },
];

function Loading() {
  return (
    <div className="space-y-4" role="status" aria-label="جارٍ التحميل">
      <Skeleton className="h-11 w-64" />
      <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-80" /><Skeleton className="h-80" /></div>
      <Skeleton className="h-64" />
    </div>
  );
}

export default function ProductsTab({ filters }) {
  const [sortBy, setSortBy] = useState("revenue");
  const [limit, setLimit] = useState("10");
  const qs = reportQuery({ from: filters.from, to: filters.to, status: filters.status, sortBy, limit });
  const q = useQuery({
    queryKey: ["reports", "products", qs],
    queryFn: async () => {
      const body = await api(`/reports/products?${qs}`);
      if (!Array.isArray(body?.data?.top_products)) throw new Error("bad products payload");
      return body.data;
    },
  });
  const d = q.data;
  const topProducts = d?.top_products ?? [];
  const byCategory = d?.by_category ?? [];
  const bySize = d?.by_size ?? [];
  const exportCsv = () => downloadCsv("products-report.csv", ["Product", "Category", "Quantity", "Revenue", "Cost", "Profit", "Margin %"],
    topProducts.map((p) => [p.name, p.category ?? "-", p.quantity, p.revenue, p.cost, p.profit, p.profit_margin]));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">التقارير حسب المنتج قبل خصم الأكواد</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="prod-sort">الترتيب حسب</Label>
          <NativeSelect id="prod-sort" className="w-40" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="revenue">الإيرادات</option>
            <option value="quantity">الكمية المباعة</option>
            <option value="profit">الربح</option>
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="prod-limit">عدد المنتجات</Label>
          <NativeSelect id="prod-limit" className="w-28" value={limit} onChange={(e) => setLimit(e.target.value)}>
            <option value="5">5</option>
            <option value="10">10</option>
            <option value="20">20</option>
          </NativeSelect>
        </div>
      </div>
      {q.isError && !d ? <ErrorState title="تعذر تحميل التقرير" hint="تأكد من أن الخادم يعمل ثم أعد المحاولة" onRetry={() => q.refetch()} />
        : !d ? <Loading />
        : topProducts.length === 0 ? <EmptyState icon={Package} title="لا توجد بيانات لهذه الفترة" /> : <>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="الأكثر مبيعًا"><TopProductsChart items={topProducts} /></ChartCard>
            <ChartCard title="حسب الفئة"><CategoryChart items={byCategory} /></ChartCard>
          </div>
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold">تفاصيل المنتجات</h2>
              <Button type="button" variant="outline" className="h-11" onClick={exportCsv}><Download aria-hidden />تصدير CSV</Button>
            </div>
            <ResponsiveTable columns={PRODUCT_COLUMNS} rows={topProducts} rowKey={(r) => r.product_id ?? r.name} />
          </section>
          <section className="space-y-3">
            <h2 className="font-semibold">حسب الحجم</h2>
            {bySize.length === 0 ? <EmptyState title="لا توجد بيانات" /> : <ResponsiveTable columns={SIZE_COLUMNS} rows={bySize} rowKey={(r) => r.size} />}
          </section>
        </>}
    </div>
  );
}
