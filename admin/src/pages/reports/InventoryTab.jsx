import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Download, Package } from "lucide-react";
import { api } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import { money, num } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorState, StatCard } from "@/components/page";
import { ResponsiveTable } from "@/components/ResponsiveTable";
import { Pill } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import AlcoholSection from "./AlcoholSection";

const bdi = (v) => <bdi dir="ltr">{v}</bdi>;
const OIL_DEFAULT = 100;
const BOTTLE_DEFAULT = 20;
const OIL_STATUS = { available: ["متوفر", "completed"], "out of stock": ["نفد", "canceled"], discontinued: ["متوقف", "default"] };
// Blank, non-numeric or < 1 falls back to the default (the server also treats 0 as the default).
const threshold = (v, dflt) => (Number(v) >= 1 ? Number(v) : dflt);

function StockBar({ quantity, low }) {
  const pct = Math.max(4, Math.min(100, Number(quantity) || 0));
  return (
    <span role="img" aria-label={`مستوى المخزون ${num(pct)}%`} className="block h-2 w-full min-w-20 rounded-full bg-muted">
      <span className={cn("block h-full rounded-full", low ? "bg-st-canceled-fg" : "bg-primary")} style={{ width: `${pct}%` }} />
    </span>
  );
}

function Qty({ quantity, low, unit }) {
  const owed = Number(quantity) < 0;
  return (
    <div className="grid gap-1.5">
      <span className={cn(owed && "font-semibold text-st-canceled-fg")}>
        {bdi(`${num(quantity)}${unit ? ` ${unit}` : ""}`)}
        {owed && <span className="ms-2 text-xs">مستحق</span>}
      </span>
      <StockBar quantity={quantity} low={low} />
    </div>
  );
}

function LowList({ title, rows, unit }) {
  return (
    <section className="rounded-xl border bg-card p-4 text-card-foreground">
      <h2 className="flex items-center gap-2 font-semibold"><AlertTriangle className="size-4 text-st-canceled-fg" aria-hidden />{title}</h2>
      {rows.length === 0
        ? <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="size-4 text-st-completed-fg" aria-hidden />لا توجد تنبيهات</p>
        : <ul aria-label={title} className="mt-3 space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 rounded-lg bg-st-pending-bg px-3 py-2 text-sm text-st-pending-fg">
              <span className="min-w-0">{r.name}</span>
              <span className={cn("shrink-0 font-semibold", Number(r.quantity) < 0 && "text-st-canceled-fg")}>{bdi(`${num(r.quantity)} ${unit}`)}</span>
            </li>
          ))}
        </ul>}
    </section>
  );
}

const OIL_COLUMNS = [
  { key: "name", header: "الاسم", cell: (r) => r.name },
  { key: "quantity", header: "الكمية", cell: (r) => <Qty quantity={r.quantity} low={r.low_stock} unit="ML" /> },
  { key: "cost", header: "التكلفة/مل", cell: (r) => bdi(money(r.cost)) },
  { key: "value", header: "القيمة", cell: (r) => bdi(money(r.value)) },
  { key: "status", header: "الحالة", cell: (r) => { const [label, tone] = OIL_STATUS[r.status] ?? [r.status ?? "-", "default"]; return <Pill tone={tone}>{label}</Pill>; } },
];
const BOTTLE_COLUMNS = [
  { key: "name", header: "الاسم", cell: (r) => r.name },
  { key: "capacity", header: "السعة", cell: (r) => bdi(`${num(r.capacity)} ML`) },
  { key: "quantity", header: "الكمية", cell: (r) => <Qty quantity={r.quantity} low={r.low_stock} /> },
  { key: "cost", header: "التكلفة", cell: (r) => bdi(money(r.cost)) },
  { key: "value", header: "القيمة", cell: (r) => bdi(money(r.value)) },
];

function TableSection({ id, title, csvLabel, onCsv, columns, rows }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
        <Button type="button" variant="outline" className="h-11" onClick={onCsv}><Download aria-hidden />{csvLabel}</Button>
      </div>
      <div id={id}>
        <ResponsiveTable columns={columns} rows={rows} rowKey={(r) => r.id} emptyState={<EmptyState icon={Package} title="لا توجد بيانات" />} />
      </div>
    </section>
  );
}

function Loading() {
  return (
    <div className="space-y-4" role="status" aria-label="جارٍ التحميل">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-32" /><Skeleton className="h-32" /></div>
      <Skeleton className="h-64" />
    </div>
  );
}

export default function InventoryTab() {
  const [oilIn, setOilIn] = useState(String(OIL_DEFAULT));
  const [bottleIn, setBottleIn] = useState(String(BOTTLE_DEFAULT));
  const [applied, setApplied] = useState({ oil: OIL_DEFAULT, bottle: BOTTLE_DEFAULT });
  const q = useQuery({
    queryKey: ["reports", "inventory", applied.oil, applied.bottle],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const body = await api(`/reports/inventory?oilThreshold=${applied.oil}&bottleThreshold=${applied.bottle}`);
      const d = body?.data;
      if (!Array.isArray(d?.oils) || !Array.isArray(d?.bottles) || !Array.isArray(d?.alcohol) || !d?.totals) throw new Error("bad inventory payload");
      return d;
    },
  });
  const d = q.data;
  const refresh = (e) => { e.preventDefault(); setApplied({ oil: threshold(oilIn, OIL_DEFAULT), bottle: threshold(bottleIn, BOTTLE_DEFAULT) }); };

  return (
    <div className="space-y-4">
      <form onSubmit={refresh} className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="oilThreshold">حد تنبيه الزيت (ML)</Label>
          <Input id="oilThreshold" type="number" min="1" className="h-11 w-40" value={oilIn} onChange={(e) => setOilIn(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bottleThreshold">حد تنبيه الزجاجات (قطعة)</Label>
          <Input id="bottleThreshold" type="number" min="1" className="h-11 w-40" value={bottleIn} onChange={(e) => setBottleIn(e.target.value)} />
        </div>
        <Button type="submit" className="h-11">تحديث</Button>
      </form>
      {q.isError && !d ? <ErrorState title="تعذر تحميل التقرير" hint="تأكد من أن الخادم يعمل ثم أعد المحاولة" onRetry={() => q.refetch()} />
        : !d ? <Loading />
        : <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="رأس مال الزيوت" value={money(d.totals.oil_capital)} />
            <StatCard label="رأس مال الزجاجات" value={money(d.totals.bottle_capital)} />
            <StatCard label="رأس مال الكحول" value={money(d.totals.alcohol_capital)} />
            <StatCard label="إجمالي رأس المال" value={money(d.totals.total_capital)} tone="accent" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <LowList title="زيوت تحتاج إعادة تعبئة" rows={d.low_stock_oils ?? []} unit="ML" />
            <LowList title="زجاجات تحتاج إعادة تعبئة" rows={d.low_stock_bottles ?? []} unit="قطعة" />
          </div>
          <TableSection id="oilsTable" title="مخزون الزيوت" csvLabel="تصدير الزيوت CSV" columns={OIL_COLUMNS} rows={d.oils}
            onCsv={() => downloadCsv("oils-inventory.csv", ["Name", "Quantity (ML)", "Cost/ML", "Value", "Status"], d.oils.map((o) => [o.name, o.quantity, o.cost, o.value, o.status]))} />
          <TableSection id="bottlesTable" title="مخزون الزجاجات" csvLabel="تصدير الزجاجات CSV" columns={BOTTLE_COLUMNS} rows={d.bottles}
            onCsv={() => downloadCsv("bottles-inventory.csv", ["Name", "Capacity", "Quantity", "Cost", "Value"], d.bottles.map((b) => [b.name, b.capacity, b.quantity, b.cost, b.value]))} />
          <AlcoholSection rows={d.alcohol} onSaved={() => q.refetch()} />
        </>}
    </div>
  );
}
