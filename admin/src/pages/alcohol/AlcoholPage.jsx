import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Wine } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, listOf } from "@/lib/api";
import { quantityUpdate, money } from "@/lib/stock";
import { bdi, EmptyState, ErrorState, PageHeader } from "@/components/page";
import { Pill } from "@/components/StatusBadge";
import { Field, NumberField } from "@/components/form/fields";
import { QuantityFields } from "@/components/form/QuantityFields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

const isNum = (n) => typeof n === "number" && Number.isFinite(n);

// One alcohol record (create when `record` is null). Successful save refetches the list, which remounts via key.
function AlcoholForm({ record, idx }) {
  const qc = useQueryClient();
  const create = !record;
  const [f, setF] = useState(() => ({ name: record?.name ?? "", type: record?.type ?? "", cost: record?.cost ?? null, qty: record ? record.quantity : 0, add: null }));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const p = `alc${idx}`;

  async function submit(e) {
    e.preventDefault();
    if (saving) return;
    const er = {};
    if (!f.name.trim()) er.name = "الاسم مطلوب";
    if (!f.type.trim()) er.type = "النوع مطلوب";
    if (!isNum(f.cost) || f.cost < 0) er.cost = "أدخل تكلفة صحيحة (0 أو أكثر)";
    if (create ? !isNum(f.qty) : !isNum(f.qty) && !(isNum(f.add) && f.add > 0)) er.qty = "أدخل كمية صحيحة";
    setErrors(er);
    if (Object.keys(er).length) return;
    setSaving(true);
    try {
      const base = { name: f.name.trim(), type: f.type.trim(), cost: f.cost };
      if (create) await api("/alcohols", { method: "POST", body: { ...base, quantity: f.qty } });
      else await api(`/alcohols/${encodeURIComponent(record._id)}`, { method: "PUT", body: { ...base, ...quantityUpdate("quantity", record.quantity, f.qty, f.add) } });
      toast.success(create ? "تمت إضافة سجل الكحول" : "تم تحديث الكحول");
      await qc.invalidateQueries({ queryKey: ["alcohols"] });
      if (create) setF({ name: "", type: "", cost: null, qty: 0, add: null });
      else setF((s) => ({ ...s, add: null }));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "تعذّر الاتصال بالخادم");
    } finally {
      setSaving(false);
    }
  }
  const bad = (k) => (errors[k] ? true : undefined);
  const owed = !create && Number(record.quantity) < 0;

  return (
    <form onSubmit={submit} noValidate className="space-y-4 rounded-xl border bg-card p-4 text-card-foreground">
      {!create && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className={owed ? "font-semibold text-st-canceled-fg" : undefined}>المخزون الحالي: {bdi(Number(record.quantity) || 0)}{owed && <> · <Pill tone="canceled">مستحق</Pill></>}</span>
          <span>رأس المال: {bdi(`${money(Math.max(0, Number(record.quantity) || 0) * (Number(record.cost) || 0))} د.أ`)}</span>
        </div>
      )}
      <Field label="اسم الكحول" htmlFor={`${p}_name`} required error={errors.name}>
        <Input id={`${p}_name`} className="h-11" value={f.name} aria-invalid={bad("name")} onChange={(e) => set("name", e.target.value)} />
      </Field>
      <Field label="النوع" htmlFor={`${p}_type`} required error={errors.type}>
        <Input id={`${p}_type`} className="h-11" value={f.type} aria-invalid={bad("type")} onChange={(e) => set("type", e.target.value)} />
      </Field>
      <Field label="التكلفة" htmlFor={`${p}_cost`} required hint="تُقبل الكسور، و0 مقبول" error={errors.cost}>
        <NumberField id={`${p}_cost`} value={f.cost} invalid={bad("cost")} onChange={(n) => set("cost", n)} />
      </Field>
      {create
        ? <Field label="الكمية" htmlFor={`${p}_qty`} required hint="0 مقبول" error={errors.qty}><NumberField id={`${p}_qty`} value={f.qty} invalid={bad("qty")} onChange={(n) => set("qty", n)} /></Field>
        : <QuantityFields idPrefix={p} qty={f.qty} add={f.add} error={errors.qty} onQty={(n) => set("qty", n)} onAdd={(n) => set("add", n)} />}
      <Button type="submit" className="h-11 min-w-28" disabled={saving}>
        {saving && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />}
        {create ? "إضافة سجل الكحول" : "حفظ التعديلات"}
      </Button>
    </form>
  );
}

export default function AlcoholPage() {
  const list = useQuery({ queryKey: ["alcohols"], queryFn: listOf("/alcohols"), staleTime: 0, refetchOnMount: "always" });
  const rows = list.data ?? [];
  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader eyebrow="الكتالوج" title="الكحول" description="المتجر يستخدم سجل كحول واحدًا في كل الطلبات" />
      {list.error && !list.data ? <ErrorState onRetry={() => list.refetch()} hint="تحقق من الاتصال ثم أعد المحاولة" />
        : list.isPending ? <div className="space-y-3" role="status" aria-label="جارٍ التحميل">{[0, 1].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
        : rows.length === 0 ? (
          <div className="space-y-4">
            <EmptyState icon={Wine} title="لا يوجد سجل كحول بعد" hint="أنشئ السجل الذي تخصم منه نقطة البيع" />
            <AlcoholForm record={null} idx="new" />
          </div>
        ) : (
          <div className="space-y-4">
            {rows.length > 1 && <p role="alert" className="rounded-xl border border-st-pending-fg/40 bg-st-pending-bg p-3 text-sm font-medium text-st-pending-fg">يوجد أكثر من سجل كحول. نقطة البيع تستخدم السجل الأول فقط.</p>}
            {rows.map((r, i) => <AlcoholForm key={`${r._id}-${r.updatedAt}`} record={r} idx={i} />)}
          </div>
        )}
    </div>
  );
}
