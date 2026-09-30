import { Link } from "react-router-dom";
import { FlaskConical, Pencil } from "lucide-react";
import { bdi } from "@/components/page";
import { Pill } from "@/components/StatusBadge";
import { StockList } from "@/components/StockList";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/stock";

const num = (v) => Number(v) || 0;
const Qty = ({ b }) => (
  <span className={num(b.quantity) < 0 ? "font-semibold text-st-canceled-fg" : undefined}>
    {bdi(num(b.quantity))}{num(b.quantity) < 0 && <> · <Pill tone="canceled">مستحق</Pill></>}
  </span>
);
const edit = (b) => (
  <Button asChild variant="secondary" className="h-11 gap-2">
    <Link to={`/bottles/${encodeURIComponent(b._id)}/edit`} aria-label={`تعديل ${b.name ?? ""}`}><Pencil className="size-4" aria-hidden />تعديل</Link>
  </Button>
);

const cfg = {
  key: "bottles", path: "/bottles", capitalPath: "/bottles/calculate_bottle_capital", capitalLabels: ["الزجاجات المتاحة", "رأس مال الزجاجات"],
  title: "الزجاجات", searchLabel: "ابحث باسم الزجاجة أو سعتها", icon: FlaskConical, addTo: "/bottles/new", addLabel: "إضافة زجاجة",
  emptyTitle: "لا توجد زجاجات بعد", emptyHint: "أضف أول زجاجة لتتبّع مخزونها",
  searchOf: (b) => [b.name, b.capacity],
  rowKey: (b) => b._id,
  sorts: [
    { key: "cost", label: "التكلفة: الأقل أولًا", cmp: (a, b) => num(a.cost) - num(b.cost) },
    { key: "qty", label: "الكمية: الأكثر أولًا", cmp: (a, b) => num(b.quantity) - num(a.quantity) },
    { key: "cap", label: "السعة", cmp: (a, b) => num(a.capacity) - num(b.capacity) },
  ],
  columns: [
    { key: "name", header: "الاسم", cell: (b) => <span className="break-words font-medium">{b.name}</span> },
    { key: "cap", header: "السعة", cell: (b) => <>{bdi(num(b.capacity))} مل</> },
    { key: "cost", header: "التكلفة", cell: (b) => bdi(`${money(b.cost)} د.أ`) },
    { key: "qty", header: "الكمية", cell: (b) => <Qty b={b} /> },
    { key: "actions", header: "إجراء", cell: edit },
  ],
  card: (b) => (
    <div className="space-y-3">
      <p className="break-words font-medium">{b.name}</p>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>{bdi(num(b.capacity))} مل</span>
        <span>{bdi(`${money(b.cost)} د.أ`)}</span>
        <Qty b={b} />
      </div>
      <div className="flex justify-end">{edit(b)}</div>
    </div>
  ),
};

export default function BottlesPage() { return <StockList cfg={cfg} />; }
