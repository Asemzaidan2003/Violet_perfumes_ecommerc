import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Megaphone, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, listOf } from "@/lib/api";
import { isImageUrl } from "@/lib/links";
import { moveItem, reorderRequests, runSequential } from "@/lib/reorder";
import { EmptyState, ErrorState } from "@/components/page";
import { Pill } from "@/components/StatusBadge";
import { ActiveSwitch } from "@/components/crud/ActiveSwitch";
import { DeleteConfirm } from "@/components/crud/DeleteConfirm";
import { ReorderButtons } from "@/components/crud/ReorderButtons";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PlacementDialog } from "./PlacementDialog";
import { liveStatus, scheduleText, SLOTS, storeLinkFor } from "./slots";

const TONE = { "مباشر": "completed", "مجدول": "pending", "منتهي": "canceled", "متوقف": "default" };
const netMsg = (e) => (e instanceof ApiError ? e.message : "تعذّر الاتصال بالخادم");
const bySort = (a, b) => (a.sort ?? 0) - (b.sort ?? 0) || String(a.createdAt).localeCompare(String(b.createdAt));

export function PlacementsTab() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState(null);
  const [del, setDel] = useState(null);
  const [banner, setBanner] = useState("");
  const [pending, setPending] = useState({});
  const busy = useRef(false);
  const list = useQuery({ queryKey: ["placements"], queryFn: listOf("/placements"), staleTime: 0, refetchOnMount: "always" });
  const cats = useQuery({ queryKey: ["categories"], queryFn: listOf("/categories"), retry: false });
  const rows = list.data ?? [];
  const groups = useMemo(() => SLOTS.map((s) => [s, rows.filter((p) => p.slot === s.key).sort(bySort)]).filter(([, l]) => l.length), [rows]);

  async function toggle(p) {
    setPending((s) => ({ ...s, [p._id]: !p.active }));
    try {
      await api(`/placements/${p._id}`, { method: "PUT", body: { active: !p.active } });
      await qc.invalidateQueries({ queryKey: ["placements"] });
    } catch (e) { toast.error(netMsg(e)); } finally { setPending((s) => { const r = { ...s }; delete r[p._id]; return r; }); }
  }
  async function move(group, i, delta) {
    if (busy.current) return;
    busy.current = true;
    setBanner("");
    try {
      await runSequential(reorderRequests(moveItem(group, i, delta)), (r) => api(`/placements/${r.id}`, { method: "PUT", body: r.body }));
    } catch (e) { setBanner(netMsg(e)); } finally { await qc.invalidateQueries({ queryKey: ["placements"] }); busy.current = false; }
  }
  async function remove() {
    const p = del;
    setDel(null);
    setBanner("");
    try {
      await api(`/placements/${p._id}`, { method: "DELETE" });
      await qc.invalidateQueries({ queryKey: ["placements"] });
      toast.success("تم حذف الموضع");
    } catch (e) { setBanner(netMsg(e)); }
  }

  const add = <Button type="button" className="h-11 gap-2" onClick={() => setDialog({ slot: "announcement" })}><Plus className="size-5" aria-hidden />إضافة موضع</Button>;
  return (
    <div className="space-y-4">
      <div className="flex justify-end">{add}</div>
      {banner && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm font-medium text-destructive">{banner}</p>}
      {list.error && !list.data ? <ErrorState onRetry={() => list.refetch()} hint="تحقق من الاتصال ثم أعد المحاولة" />
        : list.isPending ? <div className="space-y-3" role="status" aria-label="جارٍ التحميل">{[0, 1].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
        : groups.length === 0 ? <EmptyState icon={Megaphone} title="لا توجد مواضع بعد" hint="أضف إعلانًا أو شريحة أو بانرًا" />
        : groups.map(([slot, group]) => (
          <section key={slot.key} className="space-y-2" aria-label={slot.label}>
            <h3 className="text-base font-semibold">{slot.label}</h3>
            <ul className="space-y-3">
              {group.map((p, i) => {
                const st = liveStatus(p);
                return (
                  <li key={p._id} className="space-y-3 rounded-xl border bg-card p-4 text-card-foreground">
                    <div className="flex items-start gap-3">
                      {isImageUrl(p.image) ? <img src={p.image} alt="" loading="lazy" className="size-14 shrink-0 rounded-md border object-cover" /> : <span className="size-14 shrink-0 rounded-md border bg-muted" aria-hidden />}
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="break-words font-medium">{p.title}</p>
                        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"><Pill tone={TONE[st]}>{st}</Pill><span>{scheduleText(p)}</span></p>
                      </div>
                      <ReorderButtons label={p.title} disableUp={i === 0} disableDown={i === group.length - 1} onUp={() => move(group, i, -1)} onDown={() => move(group, i, 1)} />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <ActiveSwitch checked={pending[p._id] ?? p.active} pending={p._id in pending} label={`تفعيل ${p.title}`} text="نشط" onChange={() => toggle(p)} />
                      <Button type="button" variant="secondary" className="h-11 gap-2" aria-label={`تعديل ${p.title}`} onClick={() => setDialog(p)}><Pencil className="size-4" aria-hidden />تعديل</Button>
                      <Button type="button" variant="outline" className="h-11 gap-2 text-destructive" aria-label={`حذف ${p.title}`} onClick={() => setDel(p)}><Trash2 className="size-4" aria-hidden />حذف</Button>
                      <Button asChild variant="outline" className="h-11 gap-2"><a href={storeLinkFor(p)} target="_blank" rel="noopener" aria-label={`عرض ${p.title} في المتجر`}><ExternalLink className="size-4" aria-hidden />عرض في المتجر</a></Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      {dialog && <PlacementDialog key={dialog._id ?? "new"} placement={dialog} categories={cats.data ?? []} onClose={() => setDialog(null)} />}
      <DeleteConfirm open={!!del} name={del?.title} onConfirm={remove} onOpenChange={(o) => { if (!o) setDel(null); }} />
    </div>
  );
}
