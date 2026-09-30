import { Link } from "react-router-dom";
import { Droplets, Pencil } from "lucide-react";
import { bdi } from "@/components/page";
import { Pill } from "@/components/StatusBadge";
import { StockList } from "@/components/StockList";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/stock";

const STATUS = { available: ["completed", "متوفر"], "out of stock": ["canceled", "غير متوفر"], discontinued: ["default", "متوقف"] };
const num = (v) => Number(v) || 0;

const OilQty = ({ o }) => (
  <span className={num(o.oil_quantity) < 0 ? "font-semibold text-st-canceled-fg" : undefined}>
    {bdi(num(o.oil_quantity))} مل{num(o.oil_quantity) < 0 && <> · <Pill tone="canceled">مستحق</Pill></>}
  </span>
);
const status = (o) => { const [tone, label] = STATUS[o.status] ?? ["default", o.status ?? "—"]; return <Pill tone={tone}>{label}</Pill>; };
const edit = (o) => (
  <Button asChild variant="secondary" className="h-11 gap-2">
    <Link to={`/oils/${encodeURIComponent(o.id)}/edit`} aria-label={`تعديل ${o.oil_name ?? ""}`}><Pencil className="size-4" aria-hidden />تعديل</Link>
  </Button>
);
const value = (o) => num(o.oil_quantity) * num(o.oil_cost);

const cfg = {
  key: "oils", path: "/oils", capitalPath: "/oils/calculate_oil_capital", capitalLabels: ["الزيت المتاح (مل)", "رأس مال الزيوت"],
  title: "الزيوت", searchLabel: "ابحث برقم الزيت أو اسمه", icon: Droplets, addTo: "/oils/new", addLabel: "إضافة زيت",
  emptyTitle: "لا توجد زيوت بعد", emptyHint: "أضف أول زيت لتربطه بالمنتجات",
  searchOf: (o) => [o.id, o.oil_name],
  rowKey: (o) => o._id ?? o.id,
  sorts: [
    { key: "name", label: "الاسم", cmp: (a, b) => String(a.oil_name).localeCompare(String(b.oil_name), "ar") },
    { key: "id", label: "الرقم", cmp: (a, b) => String(a.id).localeCompare(String(b.id), "ar", { numeric: true }) },
    { key: "qty-desc", label: "الكمية: الأكثر أولًا", cmp: (a, b) => num(b.oil_quantity) - num(a.oil_quantity) },
    { key: "qty-asc", label: "الكمية: الأقل أولًا", cmp: (a, b) => num(a.oil_quantity) - num(b.oil_quantity) },
    { key: "cost-desc", label: "التكلفة: الأعلى أولًا", cmp: (a, b) => num(b.oil_cost) - num(a.oil_cost) },
  ],
  columns: [
    { key: "id", header: "الرقم", cell: (o) => <span className="break-all">{o.id}</span> },
    { key: "name", header: "الاسم", cell: (o) => <span className="break-words font-medium">{o.oil_name}</span> },
    { key: "cost", header: "التكلفة (لكل مل)", cell: (o) => bdi(`${money(o.oil_cost)} د.أ`) },
    { key: "qty", header: "الكمية", cell: (o) => <OilQty o={o} /> },
    { key: "val", header: "قيمة المخزون", cell: (o) => bdi(`${money(value(o))} د.أ`) },
    { key: "status", header: "الحالة", cell: status },
    { key: "actions", header: "إجراء", cell: edit },
  ],
  card: (o) => (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="break-words font-medium">{o.oil_name}</p>
          <p className="break-all text-sm text-muted-foreground">{o.id}</p>
        </div>
        {status(o)}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <OilQty o={o} />
        <span>{bdi(`${money(o.oil_cost)} د.أ`)} / مل</span>
        <span>القيمة {bdi(`${money(value(o))} د.أ`)}</span>
      </div>
      <div className="flex justify-end">{edit(o)}</div>
    </div>
  ),
};

export default function OilsPage() { return <StockList cfg={cfg} />; }
