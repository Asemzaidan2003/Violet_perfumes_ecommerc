import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, unwrap } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { NativeSelect } from "@/components/native-select";
import { bdi, EmptyState, ErrorState, PageHeader } from "@/components/page";
import { ResponsiveTable } from "@/components/ResponsiveTable";
import { Pill } from "@/components/StatusBadge";
import { WhatsAppLink } from "@/components/WhatsAppLink";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

const LIMIT = 500; // server cap on GET /interests
const OPTIONS = [{ value: "", label: "الكل" }, { value: "new", label: "جديد" }, { value: "contacted", label: "تم التواصل" }, { value: "closed", label: "مغلق" }];
const LABEL = Object.fromEntries(OPTIONS.map((o) => [o.value, o.label]));
const TONE = { new: "pending", contacted: "completed", closed: "default" };
const dash = (v) => (v == null || v === "" ? "-" : String(v));

export default function InterestsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const inFlight = useRef(new Set());
  const [busy, setBusy] = useState(() => new Set());
  const list = useQuery({
    queryKey: ["interests", status],
    queryFn: async () => unwrap(await api(`/interests${status ? `?status=${status}` : ""}`)),
    staleTime: 0,
  });
  const update = useMutation({
    mutationFn: ({ id, to }) => api(`/interests/${id}`, { method: "PUT", body: { status: to } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["interests"] }),
  });

  async function move(row, to) {
    if (inFlight.current.has(row._id)) return;
    inFlight.current.add(row._id);
    setBusy(new Set(inFlight.current));
    try {
      await update.mutateAsync({ id: row._id, to });
      toast.success("تم تحديث الحالة");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "تعذّر الاتصال بالخادم");
    } finally {
      inFlight.current.delete(row._id);
      setBusy(new Set(inFlight.current));
    }
  }

  const rows = list.data ?? [];
  const actions = (r) => (
    <div className="flex flex-wrap items-center gap-2">
      <WhatsAppLink phone={r.phone} name={r.name} />
      {r.status !== "contacted" && (
        <Button type="button" variant="secondary" className="h-11" disabled={busy.has(r._id)} aria-label={`تم التواصل مع ${r.name ?? ""}`} onClick={() => move(r, "contacted")}>تم التواصل</Button>
      )}
      {r.status !== "closed" && (
        <Button type="button" variant="ghost" className="h-11" disabled={busy.has(r._id)} aria-label={`إغلاق طلب ${r.name ?? ""}`} onClick={() => move(r, "closed")}>إغلاق</Button>
      )}
    </div>
  );
  const columns = [
    { key: "product", header: "المنتج", cell: (r) => <span className="break-words font-medium">{dash(r.product_name)}</span> },
    { key: "size", header: "الحجم", cell: (r) => bdi(dash(r.size)) },
    { key: "name", header: "الاسم", cell: (r) => <span className="break-words">{dash(r.name)}</span> },
    { key: "phone", header: "الهاتف", cell: (r) => bdi(dash(r.phone)) },
    { key: "note", header: "الملاحظة", cell: (r) => <span className="break-words">{dash(r.note)}</span> },
    { key: "date", header: "التاريخ", cell: (r) => bdi(fmtDate(r.createdAt)) },
    { key: "status", header: "الحالة", cell: (r) => <Pill tone={TONE[r.status]}>{LABEL[r.status] ?? dash(r.status)}</Pill> },
    { key: "actions", header: "إجراء", cell: actions },
  ];

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader eyebrow="لوحة التحكم" title="طلبات الاهتمام" />
      <div className="max-w-xs space-y-1.5">
        <Label htmlFor="i-status">الحالة</Label>
        <NativeSelect id="i-status" value={status} onChange={(e) => setStatus(e.target.value)}>
          {OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </NativeSelect>
      </div>
      {list.error && !list.data ? <ErrorState onRetry={() => list.refetch()} hint="تحقق من الاتصال ثم أعد المحاولة" />
        : list.isPending ? <div className="space-y-3" role="status" aria-label="جارٍ التحميل">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
        : <ResponsiveTable columns={columns} rows={rows} rowKey={(r) => r._id}
            emptyState={<EmptyState icon={Inbox} title="لا توجد طلبات اهتمام" />} />}
      {rows.length >= LIMIT && <p className="text-sm text-muted-foreground">يعرض النظام أحدث {LIMIT} طلب فقط.</p>}
    </div>
  );
}
