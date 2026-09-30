import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Layers, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, listOf } from "@/lib/api";
import { isImageUrl } from "@/lib/links";
import { moveItem, reorderRequests, runSequential } from "@/lib/reorder";
import { SLUG_RE } from "@/lib/slug";
import { bdi, EmptyState, ErrorState, PageHeader } from "@/components/page";
import { ResponsiveTable } from "@/components/ResponsiveTable";
import { NativeSelect } from "@/components/native-select";
import { ActiveSwitch } from "@/components/crud/ActiveSwitch";
import { BannerUpload } from "@/components/crud/BannerUpload";
import { CrudDialog } from "@/components/crud/CrudDialog";
import { DeleteConfirm } from "@/components/crud/DeleteConfirm";
import { ReorderButtons } from "@/components/crud/ReorderButtons";
import { Field, SwitchField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

const ICONS = [["", "بدون"], ["cube", "صندوق"], ["home", "منزل"], ["grid", "شبكة"], ["truck", "شاحنة"], ["wallet", "محفظة"]];
const KEY_RE = /^[A-Za-z][A-Za-z0-9_-]{1,30}$/;
const OBJECT_ID = /^[a-f0-9]{24}$/i;
const netMsg = (e) => (e instanceof ApiError ? e.message : "تعذّر الاتصال بالخادم");
const isReal = (c) => OBJECT_ID.test(String(c._id));

function CategoryDialog({ category, onClose }) {
  const qc = useQueryClient();
  const edit = !!category?._id;
  const [f, setF] = useState(() => (edit
    ? { key: category.key, slug: category.slug ?? "", name_ar: category.name_ar ?? "", name_en: category.name_en ?? "", icon: category.icon ?? "", image: category.image ?? "", visible: category.visible !== false }
    : { key: "", slug: "", name_ar: "", name_en: "", icon: "", image: "", visible: true }));
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState("");
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const save = useMutation({
    mutationFn: (body) => api(edit ? `/categories/${category._id}` : "/categories", { method: edit ? "PUT" : "POST", body }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["categories"] }); toast.success(edit ? "تم تحديث القسم" : "تمت إضافة القسم"); onClose(); },
    onError: (e) => setBanner(netMsg(e)),
  });

  function submit() {
    const slug = f.slug.trim().toLowerCase();
    const e = {};
    if (!edit && !KEY_RE.test(f.key.trim())) e.key = "المفتاح: حرف إنجليزي ثم أحرف وأرقام و - أو _ (2 إلى 31)";
    if (!SLUG_RE.test(slug)) e.slug = "الرابط: أحرف إنجليزية صغيرة وأرقام وشرطات (2 إلى 40)";
    if (!f.name_ar.trim()) e.name_ar = "الاسم بالعربية مطلوب"; else if (f.name_ar.trim().length > 40) e.name_ar = "الحد الأقصى 40 حرفًا";
    if (f.name_en.trim().length > 40) e.name_en = "الحد الأقصى 40 حرفًا";
    if (f.image && !isImageUrl(f.image)) e.image = "رابط صورة غير صالح";
    setErrors(e);
    setBanner("");
    if (Object.keys(e).length) return;
    // "بدون" sends null on edit so the stored icon really clears (undefined would be dropped from the JSON).
    const body = { slug, name_ar: f.name_ar.trim(), name_en: f.name_en.trim(), icon: f.icon || null, image: f.image, visible: f.visible };
    return save.mutateAsync(edit ? body : { key: f.key.trim(), ...body }).catch(() => {});
  }

  return (
    <CrudDialog open title={edit ? "تعديل قسم" : "إضافة قسم"} onOpenChange={(o) => { if (!o) onClose(); }} onSubmit={submit} submitting={save.isPending} error={banner}>
      <Field label="المفتاح" htmlFor="cf-key" hint="المفتاح لا يتغير بعد الإنشاء" error={errors.key}>
        <Input id="cf-key" dir="ltr" className="h-11 text-start" maxLength={31} placeholder="Men" value={f.key} disabled={edit} aria-invalid={errors.key ? true : undefined} onChange={(e) => set("key", e.target.value)} />
      </Field>
      <Field label="الرابط (slug)" htmlFor="cf-slug" required error={errors.slug}>
        <Input id="cf-slug" dir="ltr" className="h-11 text-start" maxLength={40} value={f.slug} aria-invalid={errors.slug ? true : undefined} onChange={(e) => set("slug", e.target.value)} />
      </Field>
      <Field label="الاسم بالعربية" htmlFor="cf-name-ar" required error={errors.name_ar}>
        <Input id="cf-name-ar" className="h-11" maxLength={40} value={f.name_ar} aria-invalid={errors.name_ar ? true : undefined} onChange={(e) => set("name_ar", e.target.value)} />
      </Field>
      <Field label="الاسم بالإنجليزية" htmlFor="cf-name-en" error={errors.name_en}>
        <Input id="cf-name-en" dir="ltr" className="h-11 text-start" maxLength={40} value={f.name_en} aria-invalid={errors.name_en ? true : undefined} onChange={(e) => set("name_en", e.target.value)} />
      </Field>
      <Field label="الأيقونة" htmlFor="cf-icon">
        <NativeSelect id="cf-icon" value={f.icon} onChange={(e) => set("icon", e.target.value)}>
          {[...ICONS, ...(f.icon && !ICONS.some(([k]) => k === f.icon) ? [[f.icon, f.icon]] : [])].map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </NativeSelect>
      </Field>
      <Field label="الصورة" error={errors.image}>
        <BannerUpload id="cf-image" value={f.image} onChange={(v) => set("image", v)} />
      </Field>
      <SwitchField id="cf-visible" label="ظاهر" checked={f.visible} onChange={(c) => set("visible", c)} />
    </CrudDialog>
  );
}

export default function CategoriesPage() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState(null);
  const [del, setDel] = useState(null);
  const [banner, setBanner] = useState("");
  const [pending, setPending] = useState({});
  const busy = useRef(false);
  const cats = useQuery({ queryKey: ["categories"], queryFn: listOf("/categories"), staleTime: 0, refetchOnMount: "always" });
  const rows = cats.data ?? [];
  const fallback = rows.length > 0 && !rows.some(isReal);

  async function toggle(c) {
    setPending((p) => ({ ...p, [c._id]: c.visible === false }));
    try {
      await api(`/categories/${c._id}`, { method: "PUT", body: { visible: c.visible === false } });
      await qc.invalidateQueries({ queryKey: ["categories"] });
    } catch (e) { toast.error(netMsg(e)); } finally { setPending((p) => { const r = { ...p }; delete r[c._id]; return r; }); }
  }
  async function move(i, delta) {
    if (busy.current) return;
    busy.current = true;
    setBanner("");
    try {
      await runSequential(reorderRequests(moveItem(rows, i, delta)), (r) => api(`/categories/${r.id}`, { method: "PUT", body: r.body }));
    } catch (e) { setBanner(netMsg(e)); } finally {
      await qc.invalidateQueries({ queryKey: ["categories"] });
      busy.current = false;
    }
  }
  async function remove() {
    const c = del;
    setDel(null);
    setBanner("");
    try {
      await api(`/categories/${c._id}`, { method: "DELETE" });
      await qc.invalidateQueries({ queryKey: ["categories"] });
      toast.success("تم حذف القسم");
    } catch (e) { setBanner(netMsg(e)); }
  }

  const shown = (c) => pending[c._id] ?? c.visible !== false;
  const sw = (c) => <ActiveSwitch checked={shown(c)} pending={c._id in pending || !isReal(c)} label={`إظهار ${c.name_ar}`} text="ظاهر" onChange={() => toggle(c)} />;
  const order = (c, i) => <ReorderButtons label={c.name_ar} disableUp={i === 0 || fallback} disableDown={i === rows.length - 1 || fallback} onUp={() => move(i, -1)} onDown={() => move(i, 1)} />;
  const actions = (c) => (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild variant="outline" className="h-11 gap-2"><a href={`/c/${c.slug}`} target="_blank" rel="noopener" aria-label={`عرض ${c.name_ar} في المتجر`}><ExternalLink className="size-4" aria-hidden />عرض</a></Button>
      <Button type="button" variant="secondary" className="h-11 gap-2" disabled={!isReal(c)} aria-label={`تعديل ${c.name_ar}`} onClick={() => setDialog(c)}><Pencil className="size-4" aria-hidden />تعديل</Button>
      <Button type="button" variant="outline" className="h-11 gap-2 text-destructive" disabled={!isReal(c)} aria-label={`حذف ${c.name_ar}`} onClick={() => setDel(c)}><Trash2 className="size-4" aria-hidden />حذف</Button>
    </div>
  );
  const columns = [
    { key: "name", header: "الاسم بالعربية", cell: (c) => <span className="break-words font-medium">{c.name_ar}</span> },
    { key: "slug", header: "الرابط", cell: (c) => <span dir="ltr" className="break-all">/c/{c.slug}</span> },
    { key: "count", header: "عدد المنتجات", cell: (c) => bdi(c.productCount ?? 0) },
    { key: "order", header: "الترتيب", cell: order },
    { key: "vis", header: "ظاهر", cell: sw },
    { key: "actions", header: "إجراء", cell: actions },
  ];
  const card = (c, i) => (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="break-words font-medium">{c.name_ar}</p><p dir="ltr" className="break-all text-start text-sm text-muted-foreground">/c/{c.slug}</p></div>
        {order(c, i)}
      </div>
      <p className="text-sm">المنتجات: {bdi(c.productCount ?? 0)}</p>
      <div className="flex flex-wrap items-center justify-between gap-2">{sw(c)}{actions(c)}</div>
    </div>
  );
  const add = <Button type="button" className="h-11 gap-2" onClick={() => setDialog({})}><Plus className="size-5" aria-hidden />إضافة قسم</Button>;

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader eyebrow="الكتالوج" title="الأقسام" actions={add} />
      {banner && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm font-medium text-destructive">{banner}</p>}
      {fallback && <p role="note" className="rounded-lg border p-3 text-sm">القيم الافتراضية — أضف قسمًا لحفظها</p>}
      {cats.error && !cats.data ? <ErrorState onRetry={() => cats.refetch()} hint="تحقق من الاتصال ثم أعد المحاولة" />
        : cats.isPending ? <div className="space-y-3" role="status" aria-label="جارٍ التحميل">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
        : rows.length === 0 ? <div className="grid place-items-center gap-3"><EmptyState icon={Layers} title="لا توجد أقسام بعد" hint="أضف أول قسم لعرض المنتجات" />{add}</div>
        : <ResponsiveTable columns={columns} rows={rows} rowKey={(c) => c._id} renderCard={card} />}
      {dialog && <CategoryDialog key={dialog._id ?? "new"} category={dialog} onClose={() => setDialog(null)} />}
      <DeleteConfirm open={!!del} name={del?.name_ar} message="لا يمكن حذف قسم مرتبط بمنتجات. لا يمكن التراجع." onConfirm={remove} onOpenChange={(o) => { if (!o) setDel(null); }} />
    </div>
  );
}
