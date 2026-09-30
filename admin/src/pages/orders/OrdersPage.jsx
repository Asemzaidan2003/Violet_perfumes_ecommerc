import { useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CalendarDays, Eye, ListFilter, SearchX } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { STATUSES, fmtDate, money, paymentLabel } from "@/lib/format";
import { filterOrders, isUnconfirmed, orderTotals, resolveCustomer } from "@/lib/orders";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { NativeSelect } from "@/components/native-select";
import { bdi, EmptyState, ErrorState, PageHeader, StatCard } from "@/components/page";
import { ResponsiveTable } from "@/components/ResponsiveTable";
import { Pill, StatusBadge } from "@/components/StatusBadge";
import { WhatsAppLink } from "@/components/WhatsAppLink";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrders } from "./useOrders";

const BLANK = { status: "", payment: "", from: "", to: "", query: "" };
const STATUS_OPTIONS = [{ value: "", label: "الكل" }, { value: "unconfirmed", label: "بانتظار التأكيد" }, ...STATUSES];
const KNOWN = new Set(STATUS_OPTIONS.map((o) => o.value));
const countActive = (f) => Object.values(f).filter(Boolean).length;

function Field({ id, label, children }) {
  return <div className="space-y-1.5"><Label htmlFor={id}>{label}</Label>{children}</div>;
}

export default function OrdersPage() {
  const { orders, customersById, loading, error, refetch, updateStatus } = useOrders();
  const [params] = useSearchParams();
  // ?filter=<status> preselects and applies the status filter over ALL orders; an unknown value shows everything.
  const [deepLink] = useState(() => params.get("filter"));
  const [draft, setDraft] = useState(() => ({ ...BLANK, status: KNOWN.has(deepLink) ? deepLink : "" }));
  const [applied, setApplied] = useState(draft);
  const [today, setToday] = useState(deepLink == null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [busy, setBusy] = useState(() => new Set());
  const inFlight = useRef(new Set());
  const [pendingCancel, setPendingCancel] = useState(null);

  const set = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  const apply = (e) => { e?.preventDefault(); setApplied(draft); setToday(false); setPanelOpen(false); };
  const reset = () => { setDraft(BLANK); setApplied(BLANK); setToday(false); };

  const rows = filterOrders(orders, { ...applied, today }, customersById);
  const { sales, profit } = orderTotals(rows);
  const activeCount = countActive(applied);

  // The select is controlled by order.status, so a failed change reverts by itself.
  async function change(order, status) {
    if (inFlight.current.has(order._id)) return;
    inFlight.current.add(order._id);
    setBusy(new Set(inFlight.current));
    try {
      await updateStatus(order._id, status);
      toast.success("تم تحديث حالة الطلب");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "تعذّر الاتصال بالخادم");
    } finally {
      inFlight.current.delete(order._id);
      setBusy(new Set(inFlight.current));
    }
  }

  const columns = [
    { key: "n", header: "رقم", cell: (_, i) => bdi(i + 1) },
    { key: "name", header: "اسم الزبون", cell: (o) => {
      const { name } = resolveCustomer(o, customersById);
      return (
        <span className="flex flex-wrap items-center gap-1.5 font-medium">
          <span className="break-words">{name}</span>
          {o.source === "online" && <Pill tone="completed">الموقع</Pill>}
          {isUnconfirmed(o) && <StatusBadge status="unconfirmed" />}
        </span>
      );
    } },
    { key: "phone", header: "رقم الهاتف", cell: (o) => {
      const { name, phone } = resolveCustomer(o, customersById);
      return (
        <span className="flex flex-wrap items-center gap-2">
          {bdi(phone)}
          {o.source === "online" && phone !== "-" && <WhatsAppLink phone={phone} name={name} />}
        </span>
      );
    } },
    { key: "items", header: "عدد المنتجات", cell: (o) => bdi(o.total_items ?? 0) },
    { key: "total", header: "الإجمالي", cell: (o) => bdi(money(o.final_total)) },
    { key: "profit", header: "الربح", cell: (o) => (o.status === "completed" ? bdi(money(o.total_profit)) : "-") },
    { key: "status", header: "الحالة", cell: (o) => {
      const { name } = resolveCustomer(o, customersById);
      return (
        <div className="flex flex-col items-start gap-2">
          <StatusBadge status={o.status} />
          <NativeSelect aria-label={`حالة طلب ${name}`} value={o.status ?? ""} disabled={busy.has(o._id)} className="w-44"
            onChange={(e) => (e.target.value === "canceled" ? setPendingCancel(o) : change(o, e.target.value))}>
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </NativeSelect>
        </div>
      );
    } },
    { key: "date", header: "تاريخ الإنشاء", cell: (o) => bdi(fmtDate(o.createdAt)) },
    { key: "actions", header: "إجراء", cell: (o) => {
      const { name } = resolveCustomer(o, customersById);
      return (
        <Link to={`/orders/${o._id}`} aria-label={`عرض طلب ${name}`}
          className="inline-flex h-11 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground">
          <Eye className="size-4" aria-hidden /> عرض
        </Link>
      );
    } },
  ];

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader eyebrow="لوحة التحكم" title="قائمة الطلبات" description={!loading && !error && rows.length ? `${rows.length} طلب` : undefined} />

      <Button type="button" variant="outline" className="h-11 gap-2 md:hidden" aria-expanded={panelOpen} aria-controls="orders-filters" onClick={() => setPanelOpen((v) => !v)}>
        <ListFilter className="size-4" aria-hidden /> الفلاتر{activeCount > 0 && <span className="rounded-full bg-primary px-2 text-xs font-bold text-primary-foreground">{activeCount}</span>}
      </Button>
      <form id="orders-filters" onSubmit={apply} className={`${panelOpen ? "grid" : "hidden"} gap-3 rounded-xl border bg-card p-4 md:grid md:grid-cols-3 lg:grid-cols-6 lg:items-end`}>
        <Field id="f-status" label="الحالة">
          <NativeSelect id="f-status" value={draft.status} onChange={set("status")}>
            {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </NativeSelect>
        </Field>
        <Field id="f-from" label="من تاريخ"><Input id="f-from" type="date" className="h-11" value={draft.from} onChange={set("from")} /></Field>
        <Field id="f-to" label="إلى تاريخ"><Input id="f-to" type="date" className="h-11" value={draft.to} onChange={set("to")} /></Field>
        <Field id="f-payment" label="طريقة الدفع">
          <NativeSelect id="f-payment" value={draft.payment} onChange={set("payment")}>
            <option value="">الكل</option>
            {["Cash", "Credit"].map((m) => <option key={m} value={m}>{paymentLabel(m)}</option>)}
          </NativeSelect>
        </Field>
        <Field id="f-query" label="البحث (اسم أو رقم)">
          <Input id="f-query" className="h-11" placeholder="أدخل الاسم أو رقم الهاتف" value={draft.query} onChange={set("query")} />
        </Field>
        <div className="flex gap-2">
          <Button type="submit" className="h-11 flex-1">فلترة</Button>
          <Button type="button" variant="outline" className="h-11 flex-1" onClick={reset}>إعادة تعيين</Button>
        </div>
      </form>

      {today && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-11 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-semibold text-accent-foreground"><CalendarDays className="size-4" aria-hidden /> اليوم</span>
          <Button type="button" variant="ghost" className="h-11" onClick={() => setToday(false)}>عرض الكل</Button>
        </div>
      )}

      {!loading && !error && (
        <div className="grid gap-3 sm:grid-cols-2">
          <StatCard label="مجموع المبيعات" value={money(sales)} />
          <StatCard label="مجموع الأرباح" value={money(profit)} />
        </div>
      )}

      {error ? <ErrorState onRetry={refetch} hint="تحقق من الاتصال ثم أعد المحاولة" />
        : loading ? <div className="space-y-3" role="status" aria-label="جارٍ التحميل">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
        : <ResponsiveTable columns={columns} rows={rows} rowKey={(o) => o._id}
            emptyState={<EmptyState icon={SearchX} title="لا توجد طلبات مطابقة" hint="جرّب تعديل الفلاتر أو نطاق التاريخ" />} />}

      <ConfirmDialog open={!!pendingCancel} destructive title="إلغاء الطلب؟"
        description="سيعاد المخزون إلى المستودع ولا يمكن إعادة فتح الطلب الملغي."
        confirmLabel="إلغاء الطلب" onOpenChange={(o) => !o && setPendingCancel(null)}
        onConfirm={() => { const o = pendingCancel; setPendingCancel(null); if (o) change(o, "canceled"); }} />
    </div>
  );
}
