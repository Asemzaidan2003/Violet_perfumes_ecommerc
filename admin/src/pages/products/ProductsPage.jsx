import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Package, Pencil, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, listOf } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ownImage } from "@/lib/format";
import { bdi, EmptyState, ErrorState, PageHeader } from "@/components/page";
import { ResponsiveTable } from "@/components/ResponsiveTable";
import { Pill } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS = { available: ["completed", "متوفر"], discontinued: ["default", "متوقف"] };
const statusOf = (s) => STATUS[s] ?? ["canceled", "غير متوفر"];
const hasOwnImage = (p) => ownImage(p.p_image);
const isShown = (p) => p.visible !== false;
const norm = (v) => String(v ?? "").toLowerCase();

function Thumb({ src }) {
  return ownImage(src)
    ? <img src={src} alt="" loading="lazy" className="size-12 shrink-0 rounded-md border object-cover" />
    : <span className="grid size-12 shrink-0 place-items-center rounded-md border bg-muted text-muted-foreground"><Package className="size-6" aria-hidden /></span>;
}

// 44px hit area; the visual track is drawn inside. `checked` is the value to show (the target while saving).
function VisibilitySwitch({ name, checked, disabled, onToggle }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={`ظاهر في المتجر — ${name}`} disabled={disabled} onClick={onToggle}
      className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-70">
      <span dir="ltr" className={cn("flex h-6 w-11 shrink-0 items-center rounded-full border-2 p-0.5 transition-colors motion-reduce:transition-none", checked ? "border-primary bg-primary" : "border-muted-foreground bg-muted")} aria-hidden>
        <span className={cn("size-4 rounded-full transition-transform motion-reduce:transition-none", checked ? "translate-x-5 bg-primary-foreground" : "translate-x-0 bg-muted-foreground")} />
      </span>
      <span>ظاهر في المتجر</span>
    </button>
  );
}

export default function ProductsPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [pending, setPending] = useState({}); // id -> target visibility while the PUT is in flight
  const inFlight = useRef(new Set());

  const products = useQuery({ queryKey: ["products-list"], queryFn: listOf("/products"), staleTime: 0 });
  const cats = useQuery({ queryKey: ["categories"], queryFn: listOf("/categories"), retry: false });
  const catLabel = useMemo(() => Object.fromEntries((cats.data ?? []).map((c) => [c.key, c.name_ar || c.key])), [cats.data]);
  const labelOf = (p) => catLabel[p.p_category] ?? p.p_category ?? "";

  async function toggle(p) {
    if (inFlight.current.has(p._id)) return;
    inFlight.current.add(p._id);
    const target = !isShown(p);
    setPending((s) => ({ ...s, [p._id]: target }));
    try {
      await api(`/products/${p._id}`, { method: "PUT", body: { visible: target } });
      qc.setQueryData(["products-list"], (old) => (old ?? []).map((x) => (x._id === p._id ? { ...x, visible: target } : x)));
      toast.success(target ? "أصبح المنتج ظاهرًا في المتجر" : "تم إخفاء المنتج عن المتجر");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "تعذّر الاتصال بالخادم");
    } finally {
      inFlight.current.delete(p._id);
      setPending((s) => { const rest = { ...s }; delete rest[p._id]; return rest; });
    }
  }

  const all = products.data ?? [];
  const needle = norm(q.trim());
  const rows = all.filter((p) => (!cat || p.p_category === cat)
    && (!needle || [p.p_name, p.brand?.name_ar, labelOf(p), p.p_category].some((v) => norm(v).includes(needle))));

  const sw = (p) => <VisibilitySwitch name={p.p_name ?? ""} checked={pending[p._id] ?? isShown(p)} disabled={p._id in pending} onToggle={() => toggle(p)} />;
  const edit = (p) => (
    <Button asChild variant="secondary" className="h-11 gap-2"><Link to={`/products/${encodeURIComponent(p._id)}/edit`} aria-label={`تعديل ${p.p_name ?? ""}`}><Pencil className="size-4" aria-hidden />تعديل</Link></Button>
  );
  const badges = (p) => (
    <>
      {!hasOwnImage(p) && <Pill tone="pending">بدون صورة خاصة</Pill>}
      {!isShown(p) && <Pill tone="canceled">مخفي</Pill>}
    </>
  );
  const sizes = (p) => (
    <ul className="space-y-0.5">
      {(p.size_list ?? []).map((s, i) => <li key={i} className="whitespace-nowrap">{bdi(`${s?.size ?? "-"}`)}: {bdi(`${Number(s?.price) || 0} د.أ`)}</li>)}
    </ul>
  );
  const pcts = (p) => <span className="whitespace-nowrap">{bdi(`${p.oil_percentage ?? "-"}%`)} زيت / {bdi(`${p.alcohol_percentage ?? "-"}%`)} كحول</span>;

  const columns = [
    { key: "img", header: "الصورة", cell: (p) => <Thumb src={p.p_image} /> },
    { key: "name", header: "الاسم", cell: (p) => <div className="space-y-1"><p className="break-words font-medium">{p.p_name}</p><div className="flex flex-wrap gap-1">{badges(p)}</div></div> },
    { key: "brand", header: "المصمم", cell: (p) => <span className="break-words">{p.brand?.name_ar ?? "—"}</span> },
    { key: "cat", header: "الفئة", cell: (p) => <span className="break-words">{labelOf(p) || "—"}</span> },
    { key: "pct", header: "نسب التركيب", cell: pcts },
    { key: "status", header: "الحالة", cell: (p) => { const [tone, label] = statusOf(p.status); return <Pill tone={tone}>{label}</Pill>; } },
    { key: "sizes", header: "الأحجام والأسعار", cell: sizes },
    { key: "actions", header: "إجراء", cell: (p) => <div className="flex flex-wrap items-center gap-2">{edit(p)}{sw(p)}</div> },
  ];
  const card = (p) => {
    const [tone, label] = statusOf(p.status);
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <Thumb src={p.p_image} />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="break-words font-medium">{p.p_name}</p>
            <p className="break-words text-sm text-muted-foreground">{p.brand?.name_ar ?? "—"} · {labelOf(p) || "—"}</p>
            <div className="flex flex-wrap gap-1"><Pill tone={tone}>{label}</Pill>{badges(p)}</div>
          </div>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3 text-sm">{pcts(p)}{sizes(p)}</div>
        <div className="flex flex-wrap items-center justify-between gap-2">{sw(p)}{edit(p)}</div>
      </div>
    );
  };

  const addButton = <Button asChild className="h-11 gap-2"><Link to="/products/new"><Plus className="size-5" aria-hidden />إضافة منتج</Link></Button>;
  const catOptions = [{ key: "", name_ar: "الكل" }, ...(cats.data ?? [])];

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader eyebrow="الكتالوج" title="جميع المنتجات" actions={addButton} />
      {products.error && !products.data ? <ErrorState onRetry={() => products.refetch()} hint="تحقق من الاتصال ثم أعد المحاولة" />
        : products.isPending ? <div className="space-y-3" role="status" aria-label="جارٍ التحميل">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
        : all.length === 0 ? (
          <div className="grid place-items-center">
            <EmptyState icon={Package} title="لا توجد منتجات بعد" hint="ابدأ بإضافة أول عطر إلى الكتالوج" />
            <Button asChild className="h-11 gap-2"><Link to="/products/new"><Plus className="size-5" aria-hidden />أضف أول منتج</Link></Button>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <div className="relative max-w-md space-y-1.5">
                <Label htmlFor="p-search">ابحث بالاسم أو المصمم أو الفئة</Label>
                <Search className="pointer-events-none absolute start-3 bottom-3 size-5 text-muted-foreground" aria-hidden />
                <Input id="p-search" className="h-11 ps-10 text-base" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
              </div>
              <div role="group" aria-label="تصفية حسب الفئة" className="flex flex-wrap gap-2">
                {catOptions.map((c) => (
                  <button key={c.key} type="button" aria-pressed={cat === c.key} onClick={() => setCat(c.key)}
                    className={cn("inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium focus-visible:outline-2",
                      cat === c.key ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background hover:bg-accent")}>{c.name_ar || c.key}</button>
                ))}
              </div>
            </div>
            <ResponsiveTable columns={columns} rows={rows} rowKey={(p) => p._id} renderCard={card}
              emptyState={<EmptyState icon={Package} title="لا توجد منتجات مطابقة" hint="جرّب تعديل البحث" />} />
          </>
        )}
    </div>
  );
}
