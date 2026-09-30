import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ListChecks, Package, Search } from "lucide-react";
import { FAMILIES } from "@store-shared/vocab.js";
import { api, ApiError, listOf } from "@/lib/api";
import { ownImage } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorState, PageHeader } from "@/components/page";
import { ResponsiveTable } from "@/components/ResponsiveTable";
import { NativeSelect } from "@/components/native-select";
import { ChipGroup } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

const familyOptions = FAMILIES.map((f) => ({
  value: f.key,
  label: <span className="inline-flex items-center gap-1.5"><span className="inline-block size-3 rounded-full border" style={{ background: f.swatch }} aria-hidden />{f.ar}</span>,
}));
const orderFamilies = (keys) => FAMILIES.filter((f) => keys.includes(f.key)).map((f) => f.key); // vocab order, like the product form
const brandOf = (p) => String(p.brand?._id ?? p.brand ?? "");
const stored = (p) => ({ p_category: p.p_category ?? "", families: orderFamilies(p.families ?? []), brand: brandOf(p) });
const same = (a, b) => a.p_category === b.p_category && a.brand === b.brand && a.families.join() === b.families.join();

function Thumb({ src }) {
  return ownImage(src)
    ? <img src={src} alt="" loading="lazy" className="size-12 shrink-0 rounded-md border object-cover" />
    : <span className="grid size-12 shrink-0 place-items-center rounded-md border bg-muted text-muted-foreground"><Package className="size-6" aria-hidden /></span>;
}

export default function CatalogPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [frozen, setFrozen] = useState(null); // Set of ids shown while "unclassified only" is on (rows stay after saving)
  const [edits, setEdits] = useState({});
  const [status, setStatus] = useState({});
  const [savingAll, setSavingAll] = useState(false);
  const products = useQuery({ queryKey: ["products-list"], queryFn: listOf("/products"), staleTime: 0, refetchOnMount: "always" });
  const cats = useQuery({ queryKey: ["categories"], queryFn: listOf("/categories"), retry: false });
  const brands = useQuery({ queryKey: ["brands"], queryFn: listOf("/brands"), retry: false });
  const all = products.data ?? [];

  const cur = (p) => ({ ...stored(p), ...edits[p._id] });
  const dirty = (p) => !same(cur(p), stored(p));
  const patch = (p, part) => { setEdits((e) => ({ ...e, [p._id]: { ...cur(p), ...part } })); setStatus((s) => ({ ...s, [p._id]: "" })); };

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((p) => (!frozen || frozen.has(p._id)) && (!needle || String(p.p_name ?? "").toLowerCase().includes(needle)));
  }, [all, frozen, q]);
  const dirtyRows = all.filter(dirty);

  async function saveRow(p) {
    const c = cur(p);
    if (!c.p_category) { setStatus((s) => ({ ...s, [p._id]: "اختر الفئة أولًا" })); return false; }
    setStatus((s) => ({ ...s, [p._id]: "جارٍ الحفظ…" }));
    try {
      const res = await api(`/products/${p._id}`, { method: "PUT", body: { p_category: c.p_category, families: c.families, brand: c.brand || null } });
      const b = (brands.data ?? []).find((x) => String(x._id) === c.brand);
      qc.setQueryData(["products-list"], (old) => (old ?? []).map((x) => (x._id === p._id ? { ...x, ...(res?.data ?? {}), p_category: c.p_category, families: c.families, brand: b ? { _id: b._id, name_ar: b.name_ar } : null } : x)));
      setEdits((e) => { const r = { ...e }; delete r[p._id]; return r; });
      setStatus((s) => ({ ...s, [p._id]: "تم الحفظ ✓" }));
      return true;
    } catch (e) {
      setStatus((s) => ({ ...s, [p._id]: e instanceof ApiError ? e.message : "تعذّر الاتصال بالخادم" }));
      return false;
    }
  }
  async function saveAll() {
    if (savingAll) return;
    setSavingAll(true);
    for (const p of dirtyRows) await saveRow(p); // sequential; each row reports its own status
    setSavingAll(false);
  }

  const catList = cats.data ?? [];
  const brandOptions = (p) => (brands.data ?? []).filter((b) => b.active !== false || String(b._id) === brandOf(p));
  const controls = (p) => {
    const c = cur(p);
    const st = status[p._id];
    return {
      cat: (
        <NativeSelect aria-label={`الفئة — ${p.p_name}`} value={c.p_category} onChange={(e) => patch(p, { p_category: e.target.value })}>
          <option value="">— اختر الفئة —</option>
          {catList.map((k) => <option key={k.key} value={k.key}>{k.name_ar || k.key}</option>)}
          {c.p_category && !catList.some((k) => k.key === c.p_category) && <option value={c.p_category}>{c.p_category}</option>}
        </NativeSelect>
      ),
      fam: <ChipGroup label={`العائلات — ${p.p_name}`} options={familyOptions} selected={c.families} onChange={(next) => patch(p, { families: orderFamilies(next) })} />,
      brand: (
        <NativeSelect aria-label={`المصمم — ${p.p_name}`} value={c.brand} onChange={(e) => patch(p, { brand: e.target.value })}>
          <option value="">بدون</option>
          {brandOptions(p).map((b) => <option key={b._id} value={String(b._id)}>{`${b.name_ar} / ${b.name_en}`}</option>)}
        </NativeSelect>
      ),
      save: (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" className="h-11" disabled={st === "جارٍ الحفظ…"} onClick={() => saveRow(p)}>حفظ</Button>
          {dirty(p) && !st && <span className="text-sm font-medium text-st-pending-fg" role="note">غير محفوظ</span>}
          {st && <span role="status" className={cn("text-sm", st.startsWith("تم") ? "font-medium text-st-completed-fg" : "text-muted-foreground")}>{st}</span>}
        </div>
      ),
    };
  };

  const columns = [
    { key: "img", header: "الصورة", cell: (p) => <Thumb src={p.p_image} /> },
    { key: "name", header: "الاسم", cell: (p) => <span className="break-words font-medium">{p.p_name}</span> },
    { key: "cat", header: "الفئة", cell: (p) => controls(p).cat },
    { key: "fam", header: "العائلات العطرية", cell: (p) => controls(p).fam },
    { key: "brand", header: "المصمم", cell: (p) => controls(p).brand },
    { key: "save", header: "", cell: (p) => controls(p).save },
  ];
  const card = (p) => {
    const c = controls(p);
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3"><Thumb src={p.p_image} /><p className="min-w-0 break-words font-medium">{p.p_name}</p></div>
        {c.cat}{c.fam}{c.brand}{c.save}
      </div>
    );
  };

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader eyebrow="الكتالوج" title="تصنيف المنتجات" description="اختر الفئة والعائلات العطرية والمصمم لكل منتج ثم احفظ." />
      {products.error && !products.data ? <ErrorState onRetry={() => products.refetch()} hint="تحقق من الاتصال ثم أعد المحاولة" />
        : products.isPending ? <div className="space-y-3" role="status" aria-label="جارٍ التحميل">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
        : all.length === 0 ? <EmptyState icon={ListChecks} title="لا توجد منتجات بعد" hint="أضف منتجات أولًا ثم صنّفها هنا" />
        : (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <div className="relative min-w-56 max-w-md flex-1 space-y-1.5">
                <Label htmlFor="cat-search">ابحث بالاسم</Label>
                <Search className="pointer-events-none absolute start-3 bottom-3 size-5 text-muted-foreground" aria-hidden />
                <Input id="cat-search" className="h-11 ps-10 text-base" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
              </div>
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium">
                <input id="unclassifiedOnly" type="checkbox" className="size-5" checked={!!frozen}
                  onChange={(e) => setFrozen(e.target.checked ? new Set(all.filter((p) => !(p.families?.length)).map((p) => p._id)) : null)} />
                غير المصنّفة فقط
              </label>
              <Button type="button" className="h-11" disabled={dirtyRows.length === 0 || savingAll} onClick={saveAll}>{`حفظ المعدّل (${dirtyRows.length})`}</Button>
            </div>
            <ResponsiveTable columns={columns} rows={rows} rowKey={(p) => p._id} renderCard={card}
              emptyState={<EmptyState icon={Package} title="لا توجد منتجات مطابقة" hint="جرّب تعديل البحث أو الفلتر" />} />
          </>
        )}
    </div>
  );
}
