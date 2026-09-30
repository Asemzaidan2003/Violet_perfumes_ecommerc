import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, listOf } from "@/lib/api";
import { isImageUrl } from "@/lib/links";
import { SLUG_RE } from "@/lib/slug";
import { bdi, EmptyState, ErrorState, PageHeader } from "@/components/page";
import { ResponsiveTable } from "@/components/ResponsiveTable";
import { ActiveSwitch } from "@/components/crud/ActiveSwitch";
import { BannerUpload } from "@/components/crud/BannerUpload";
import { CrudDialog } from "@/components/crud/CrudDialog";
import { DeleteConfirm } from "@/components/crud/DeleteConfirm";
import { Field, SwitchField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

const EMPTY = { name_ar: "", name_en: "", slug: "", logo: "", active: true };
const netMsg = (e) => (e instanceof ApiError ? e.message : "تعذّر الاتصال بالخادم");

function Logo({ src }) {
  return isImageUrl(src)
    ? <img src={src} alt="" loading="lazy" className="size-12 shrink-0 rounded-md border object-contain" />
    : <span className="grid size-12 shrink-0 place-items-center rounded-md border bg-muted text-muted-foreground"><Tag className="size-5" aria-hidden /></span>;
}

function BrandDialog({ brand, onClose }) {
  const qc = useQueryClient();
  const [f, setF] = useState(() => (brand?._id ? { name_ar: brand.name_ar, name_en: brand.name_en, slug: brand.slug ?? "", logo: brand.logo ?? "", active: brand.active !== false } : EMPTY));
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState("");
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const edit = !!brand?._id;
  const save = useMutation({
    mutationFn: (body) => api(edit ? `/brands/${brand._id}` : "/brands", { method: edit ? "PUT" : "POST", body }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["brands"] }); toast.success(edit ? "تم تحديث المصمم" : "تمت إضافة المصمم"); onClose(); },
    onError: (e) => setBanner(netMsg(e)),
  });

  function submit() {
    const slug = f.slug.trim().toLowerCase();
    const e = {};
    if (!f.name_ar.trim()) e.name_ar = "الاسم بالعربية مطلوب"; else if (f.name_ar.trim().length > 60) e.name_ar = "الحد الأقصى 60 حرفًا";
    if (!f.name_en.trim()) e.name_en = "الاسم بالإنجليزية مطلوب"; else if (f.name_en.trim().length > 60) e.name_en = "الحد الأقصى 60 حرفًا";
    if (slug && !SLUG_RE.test(slug)) e.slug = "الرابط: أحرف إنجليزية صغيرة وأرقام وشرطات (2 إلى 40)";
    if (f.logo && !isImageUrl(f.logo)) e.logo = "رابط صورة غير صالح";
    setErrors(e);
    setBanner("");
    if (Object.keys(e).length) return;
    return save.mutateAsync({ name_ar: f.name_ar.trim(), name_en: f.name_en.trim(), slug, logo: f.logo, active: f.active }).catch(() => {});
  }

  return (
    <CrudDialog open title={edit ? "تعديل مصمم" : "إضافة مصمم"} onOpenChange={(o) => { if (!o) onClose(); }} onSubmit={submit} submitting={save.isPending} error={banner}>
      <Field label="الاسم بالعربية" htmlFor="bf-name-ar" required error={errors.name_ar}>
        <Input id="bf-name-ar" className="h-11" maxLength={60} value={f.name_ar} aria-invalid={errors.name_ar ? true : undefined} onChange={(e) => set("name_ar", e.target.value)} />
      </Field>
      <Field label="الاسم بالإنجليزية" htmlFor="bf-name-en" required error={errors.name_en}>
        <Input id="bf-name-en" dir="ltr" className="h-11 text-start" maxLength={60} value={f.name_en} aria-invalid={errors.name_en ? true : undefined} onChange={(e) => set("name_en", e.target.value)} />
      </Field>
      <Field label="الرابط (slug)" htmlFor="bf-slug" hint="يُشتق تلقائيًا من الاسم الإنجليزي إن تُرك فارغًا" error={errors.slug}>
        <Input id="bf-slug" dir="ltr" className="h-11 text-start" maxLength={40} placeholder="يُشتق تلقائيًا…" value={f.slug} aria-invalid={errors.slug ? true : undefined} onChange={(e) => set("slug", e.target.value)} />
      </Field>
      <Field label="الشعار" error={errors.logo}>
        <BannerUpload id="bf-logo" value={f.logo} onChange={(v) => set("logo", v)} />
      </Field>
      <SwitchField id="bf-active" label="نشط" checked={f.active} onChange={(c) => set("active", c)} />
    </CrudDialog>
  );
}

export default function BrandsPage() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState(null); // null | {} (new) | brand
  const [del, setDel] = useState(null);
  const [delError, setDelError] = useState("");
  const [pending, setPending] = useState({});
  const busy = useRef(new Set());
  const brands = useQuery({ queryKey: ["brands"], queryFn: listOf("/brands"), staleTime: 0, refetchOnMount: "always" });
  const rows = brands.data ?? [];

  async function toggle(b) {
    if (busy.current.has(b._id)) return;
    busy.current.add(b._id);
    setPending((p) => ({ ...p, [b._id]: !b.active }));
    try {
      await api(`/brands/${b._id}`, { method: "PUT", body: { active: !b.active } });
      await qc.invalidateQueries({ queryKey: ["brands"] });
    } catch (e) {
      toast.error(netMsg(e));
    } finally {
      busy.current.delete(b._id);
      setPending((p) => { const r = { ...p }; delete r[b._id]; return r; });
    }
  }
  async function remove() {
    const b = del;
    setDel(null);
    setDelError("");
    try {
      await api(`/brands/${b._id}`, { method: "DELETE" });
      await qc.invalidateQueries({ queryKey: ["brands"] });
      toast.success("تم حذف المصمم");
    } catch (e) {
      setDelError(netMsg(e));
    }
  }

  const sw = (b) => <ActiveSwitch checked={pending[b._id] ?? b.active} pending={b._id in pending} label={`تفعيل ${b.name_ar}`} text="نشط" onChange={() => toggle(b)} />;
  const actions = (b) => (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="secondary" className="h-11 gap-2" aria-label={`تعديل ${b.name_ar}`} onClick={() => setDialog(b)}><Pencil className="size-4" aria-hidden />تعديل</Button>
      <Button type="button" variant="outline" className="h-11 gap-2 text-destructive" aria-label={`حذف ${b.name_ar}`} onClick={() => setDel(b)}><Trash2 className="size-4" aria-hidden />حذف</Button>
    </div>
  );
  const columns = [
    { key: "logo", header: "الشعار", cell: (b) => <Logo src={b.logo} /> },
    { key: "ar", header: "بالعربية", cell: (b) => <span className="break-words font-medium">{b.name_ar}</span> },
    { key: "en", header: "بالإنجليزية", cell: (b) => <span dir="ltr" className="break-words">{b.name_en}</span> },
    { key: "count", header: "عدد المنتجات", cell: (b) => bdi(b.productCount ?? 0) },
    { key: "active", header: "نشط", cell: sw },
    { key: "actions", header: "إجراء", cell: actions },
  ];
  const card = (b) => (
    <div className="space-y-3">
      <div className="flex items-center gap-3"><Logo src={b.logo} /><div className="min-w-0"><p className="break-words font-medium">{b.name_ar}</p><p dir="ltr" className="break-words text-start text-sm text-muted-foreground">{b.name_en}</p></div></div>
      <p className="text-sm">المنتجات: {bdi(b.productCount ?? 0)}</p>
      <div className="flex flex-wrap items-center justify-between gap-2">{sw(b)}{actions(b)}</div>
    </div>
  );
  const add = <Button type="button" className="h-11 gap-2" onClick={() => setDialog({})}><Plus className="size-5" aria-hidden />إضافة مصمم</Button>;

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader eyebrow="الكتالوج" title="المصممون" actions={add} />
      {delError && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm font-medium text-destructive">{delError}</p>}
      {brands.error && !brands.data ? <ErrorState onRetry={() => brands.refetch()} hint="تحقق من الاتصال ثم أعد المحاولة" />
        : brands.isPending ? <div className="space-y-3" role="status" aria-label="جارٍ التحميل">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
        : rows.length === 0 ? <div className="grid place-items-center gap-3"><EmptyState icon={Tag} title="لا يوجد مصممون بعد" hint="أضف أول مصمم ثم اربطه بالمنتجات" />{add}</div>
        : <ResponsiveTable columns={columns} rows={rows} rowKey={(b) => b._id} renderCard={card} />}
      {dialog && <BrandDialog key={dialog._id ?? "new"} brand={dialog} onClose={() => setDialog(null)} />}
      <DeleteConfirm open={!!del} name={del?.name_ar} message="لا يمكن حذف مصمم مرتبط بمنتجات. لا يمكن التراجع." onConfirm={remove} onOpenChange={(o) => { if (!o) setDel(null); }} />
    </div>
  );
}
