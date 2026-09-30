import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Ticket, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, listOf } from "@/lib/api";
import { bdi, EmptyState, ErrorState } from "@/components/page";
import { ResponsiveTable } from "@/components/ResponsiveTable";
import { ActiveSwitch } from "@/components/crud/ActiveSwitch";
import { DeleteConfirm } from "@/components/crud/DeleteConfirm";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CouponDialog } from "./CouponDialog";
import { scheduleText } from "./slots";

const netMsg = (e) => (e instanceof ApiError ? e.message : "تعذّر الاتصال بالخادم");
const valueText = (c) => (c.type === "percent" ? <>نسبة {bdi(`${c.value}%`)}</> : <>قيمة {bdi((Number(c.value) || 0).toFixed(2))}</>);
const usage = (c) => bdi(`${c.used ?? 0}/${c.max_uses === 0 ? "∞" : c.max_uses}`);

export function CouponsTab() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState(null);
  const [del, setDel] = useState(null);
  const [banner, setBanner] = useState("");
  const [pending, setPending] = useState({});
  const list = useQuery({ queryKey: ["coupons"], queryFn: listOf("/coupons"), staleTime: 0, refetchOnMount: "always" });
  const rows = list.data ?? [];

  async function toggle(c) {
    setPending((s) => ({ ...s, [c._id]: !c.active }));
    try {
      await api(`/coupons/${c._id}`, { method: "PUT", body: { active: !c.active } });
      await qc.invalidateQueries({ queryKey: ["coupons"] });
    } catch (e) { toast.error(netMsg(e)); } finally { setPending((s) => { const r = { ...s }; delete r[c._id]; return r; }); }
  }
  async function remove() {
    const c = del;
    setDel(null);
    setBanner("");
    try {
      await api(`/coupons/${c._id}`, { method: "DELETE" });
      await qc.invalidateQueries({ queryKey: ["coupons"] });
      toast.success("تم حذف الكود");
    } catch (e) { setBanner(netMsg(e)); }
  }

  const sw = (c) => <ActiveSwitch checked={pending[c._id] ?? c.active} pending={c._id in pending} label={`تفعيل الكود ${c.code}`} text="نشط" onChange={() => toggle(c)} />;
  const actions = (c) => (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="secondary" className="h-11 gap-2" aria-label={`تعديل ${c.code}`} onClick={() => setDialog(c)}><Pencil className="size-4" aria-hidden />تعديل</Button>
      <Button type="button" variant="outline" className="h-11 gap-2 text-destructive" aria-label={`حذف ${c.code}`} onClick={() => setDel(c)}><Trash2 className="size-4" aria-hidden />حذف</Button>
    </div>
  );
  const columns = [
    { key: "code", header: "الكود", cell: (c) => <span dir="ltr" className="break-all font-semibold">{c.code}</span> },
    { key: "value", header: "النوع/القيمة", cell: valueText },
    { key: "window", header: "النافذة", cell: scheduleText },
    { key: "usage", header: "الاستخدام", cell: usage },
    { key: "active", header: "نشط", cell: sw },
    { key: "actions", header: "إجراء", cell: actions },
  ];
  const card = (c) => (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3"><p dir="ltr" className="break-all font-semibold">{c.code}</p><span className="text-sm">{valueText(c)}</span></div>
      <p className="text-sm text-muted-foreground">{scheduleText(c)} · الاستخدام {usage(c)}</p>
      <div className="flex flex-wrap items-center justify-between gap-2">{sw(c)}{actions(c)}</div>
    </div>
  );
  const add = <Button type="button" className="h-11 gap-2" onClick={() => setDialog({})}><Plus className="size-5" aria-hidden />إضافة كود</Button>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">{add}</div>
      {banner && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm font-medium text-destructive">{banner}</p>}
      {list.error && !list.data ? <ErrorState onRetry={() => list.refetch()} hint="تحقق من الاتصال ثم أعد المحاولة" />
        : list.isPending ? <div className="space-y-3" role="status" aria-label="جارٍ التحميل">{[0, 1].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
        : rows.length === 0 ? <EmptyState icon={Ticket} title="لا توجد أكواد بعد" hint="أنشئ كود خصم للعملاء" />
        : <ResponsiveTable columns={columns} rows={rows} rowKey={(c) => c._id} renderCard={card} />}
      {dialog && <CouponDialog key={dialog._id ?? "new"} coupon={dialog} onClose={() => setDialog(null)} />}
      <DeleteConfirm open={!!del} name={del?.code} onConfirm={remove} onOpenChange={(o) => { if (!o) setDel(null); }} />
    </div>
  );
}
