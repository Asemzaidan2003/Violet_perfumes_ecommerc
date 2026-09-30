import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, listOf } from "@/lib/api";
import { moveItem, reorderRequests, runSequential } from "@/lib/reorder";
import { EmptyState, ErrorState, PageHeader } from "@/components/page";
import { ResponsiveTable } from "@/components/ResponsiveTable";
import { ActiveSwitch } from "@/components/crud/ActiveSwitch";
import { DeleteConfirm } from "@/components/crud/DeleteConfirm";
import { ReorderButtons } from "@/components/crud/ReorderButtons";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { GROUPS, PageEditorDialog } from "./PageEditorDialog";

const LABEL = Object.fromEntries(GROUPS);
const netMsg = (e) => (e instanceof ApiError ? e.message : "تعذّر الاتصال بالخادم");

export default function PagesPage() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState(null);
  const [del, setDel] = useState(null);
  const [banner, setBanner] = useState("");
  const [pending, setPending] = useState({});
  const busy = useRef(false);
  const pages = useQuery({ queryKey: ["pages"], queryFn: listOf("/pages"), staleTime: 0, refetchOnMount: "always" });
  const rows = pages.data ?? [];
  // Groups in the order the server sends them (help, info, none), each contiguous.
  const groups = useMemo(() => {
    const m = new Map();
    for (const p of rows) { const g = p.footer_group ?? "info"; if (!m.has(g)) m.set(g, []); m.get(g).push(p); }
    return [...m.entries()];
  }, [rows]);

  async function toggle(p) {
    setPending((s) => ({ ...s, [p._id]: !p.published }));
    try {
      await api(`/pages/${p._id}`, { method: "PUT", body: { published: !p.published } });
      await qc.invalidateQueries({ queryKey: ["pages"] });
    } catch (e) { toast.error(netMsg(e)); } finally { setPending((s) => { const r = { ...s }; delete r[p._id]; return r; }); }
  }
  async function move(group, i, delta) {
    if (busy.current) return;
    busy.current = true;
    setBanner("");
    try {
      await runSequential(reorderRequests(moveItem(group, i, delta)), (r) => api(`/pages/${r.id}`, { method: "PUT", body: r.body }));
    } catch (e) { setBanner(netMsg(e)); } finally { await qc.invalidateQueries({ queryKey: ["pages"] }); busy.current = false; }
  }
  async function remove() {
    const p = del;
    setDel(null);
    setBanner("");
    try {
      await api(`/pages/${p._id}`, { method: "DELETE" });
      await qc.invalidateQueries({ queryKey: ["pages"] });
      toast.success("تم حذف الصفحة");
    } catch (e) { setBanner(netMsg(e)); }
  }

  const add = <Button type="button" className="h-11 gap-2" onClick={() => setDialog({})}><Plus className="size-5" aria-hidden />إضافة صفحة</Button>;
  const section = ([g, list]) => {
    const sw = (p) => <ActiveSwitch checked={pending[p._id] ?? p.published} pending={p._id in pending} label={`نشر ${p.title}`} text="منشورة" onChange={() => toggle(p)} />;
    const order = (p, i) => <ReorderButtons label={p.title} disableUp={i === 0} disableDown={i === list.length - 1} onUp={() => move(list, i, -1)} onDown={() => move(list, i, 1)} />;
    const actions = (p) => (
      <div className="flex flex-wrap items-center gap-2">
        {p.published
          ? <Button asChild variant="outline" className="h-11 gap-2"><a href={`/page/${p.slug}`} target="_blank" rel="noopener" aria-label={`عرض ${p.title}`}><ExternalLink className="size-4" aria-hidden />عرض</a></Button>
          : <Button type="button" variant="outline" className="h-11 gap-2" disabled title="الصفحة غير منشورة ولا تظهر في المتجر" aria-label={`عرض ${p.title} (غير منشورة)`}><ExternalLink className="size-4" aria-hidden />عرض</Button>}
        <Button type="button" variant="secondary" className="h-11 gap-2" aria-label={`تعديل ${p.title}`} onClick={() => setDialog(p)}><Pencil className="size-4" aria-hidden />تعديل</Button>
        <Button type="button" variant="outline" className="h-11 gap-2 text-destructive" aria-label={`حذف ${p.title}`} onClick={() => setDel(p)}><Trash2 className="size-4" aria-hidden />حذف</Button>
      </div>
    );
    const columns = [
      { key: "title", header: "العنوان", cell: (p) => <span className="break-words font-medium">{p.title}</span> },
      { key: "slug", header: "الرابط", cell: (p) => <span dir="ltr" className="break-all">/page/{p.slug}</span> },
      { key: "order", header: "الترتيب", cell: order },
      { key: "pub", header: "منشورة", cell: sw },
      { key: "actions", header: "إجراء", cell: actions },
    ];
    const card = (p, i) => (
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><p className="break-words font-medium">{p.title}</p><p dir="ltr" className="break-all text-start text-sm text-muted-foreground">/page/{p.slug}</p></div>
          {order(p, i)}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">{sw(p)}{actions(p)}</div>
      </div>
    );
    return (
      <section key={g} className="space-y-2" aria-label={LABEL[g] ?? g}>
        <h2 className="text-base font-semibold">{LABEL[g] ?? g}</h2>
        <ResponsiveTable columns={columns} rows={list} rowKey={(p) => p._id} renderCard={card} />
      </section>
    );
  };

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader eyebrow="المتجر" title="الصفحات" actions={add} />
      {banner && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm font-medium text-destructive">{banner}</p>}
      {pages.error && !pages.data ? <ErrorState onRetry={() => pages.refetch()} hint="تحقق من الاتصال ثم أعد المحاولة" />
        : pages.isPending ? <div className="space-y-3" role="status" aria-label="جارٍ التحميل">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
        : rows.length === 0 ? <div className="grid place-items-center gap-3"><EmptyState icon={FileText} title="لا توجد صفحات بعد" hint="أنشئ صفحات مثل الشروط وسياسة الشحن" />{add}</div>
        : <div className="space-y-6">{groups.map(section)}</div>}
      {dialog && <PageEditorDialog key={dialog._id ?? "new"} page={dialog} onClose={() => setDialog(null)} />}
      <DeleteConfirm open={!!del} name={del?.title} onConfirm={remove} onOpenChange={(o) => { if (!o) setDel(null); }} />
    </div>
  );
}
