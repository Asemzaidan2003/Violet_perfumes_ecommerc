import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { quantityUpdate, useFormSave } from "@/lib/stock";
import { ErrorState } from "@/components/page";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { NativeSelect } from "@/components/native-select";
import { Field, NumberField } from "@/components/form/fields";
import { FormShell } from "@/components/form/FormShell";
import { QuantityFields } from "@/components/form/QuantityFields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

const STATUSES = [["available", "متوفر"], ["out of stock", "غير متوفر"], ["discontinued", "متوقف"]];
const isNum = (n) => typeof n === "number" && Number.isFinite(n);

function OilForm({ mode, oil }) {
  const qc = useQueryClient();
  const { saving, run } = useFormSave("/oils");
  const [f, setF] = useState(() => ({
    id: oil?.id ?? "", name: oil?.oil_name ?? "", cost: oil?.oil_cost ?? null, qty: mode === "edit" ? oil.oil_quantity : 0,
    add: null, status: oil?.status ?? "available",
  }));
  const [initial] = useState(f);
  const [errors, setErrors] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);

  function validate() {
    const e = {};
    if (mode === "create" && !f.id.trim()) e.id = "رقم الزيت مطلوب";
    if (!f.name.trim()) e.name = "اسم الزيت مطلوب";
    if (!isNum(f.cost) || f.cost < 0) e.cost = "أدخل تكلفة صحيحة (0 أو أكثر)";
    if (mode === "create" && !isNum(f.qty)) e.qty = "أدخل الكمية (0 مقبول)";
    if (mode === "edit" && !isNum(f.qty) && !(isNum(f.add) && f.add > 0)) e.qty = "أدخل كمية صحيحة";
    setErrors(e);
    return Object.keys(e).length === 0;
  }
  const invalidate = () => { qc.invalidateQueries({ queryKey: ["oils"] }); qc.invalidateQueries({ queryKey: ["oil"] }); };

  async function save() {
    if (!validate()) { setTimeout(() => document.querySelector('form [aria-invalid="true"]')?.focus(), 0); return; }
    const body = mode === "create"
      ? { id: f.id.trim(), oil_name: f.name.trim(), oil_cost: f.cost, oil_quantity: f.qty, status: f.status }
      : { oil_name: f.name.trim(), oil_cost: f.cost, status: f.status, ...quantityUpdate("oil_quantity", oil.oil_quantity, f.qty, f.add) };
    await run(async () => {
      await api(mode === "edit" ? `/oils/${encodeURIComponent(oil.id)}` : "/oils", { method: mode === "edit" ? "PUT" : "POST", body });
      invalidate();
    }, mode === "edit" ? "تم تحديث الزيت" : "تمت إضافة الزيت", (e) => {
      if (e instanceof ApiError && e.status === 409) { setErrors({ id: "رقم الزيت مستخدم مسبقًا" }); return true; }
      return false;
    });
  }
  async function remove() {
    setConfirmDelete(false);
    await run(async () => { await api(`/oils/${encodeURIComponent(oil.id)}`, { method: "DELETE" }); invalidate(); }, "تم حذف الزيت");
  }
  const bad = (k) => (errors[k] ? true : undefined);

  return (
    <>
      <FormShell title={mode === "edit" ? "تعديل الزيت" : "إضافة زيت"} backTo="/oils" dirty={dirty} submitting={saving}
        submitLabel={mode === "edit" ? "حفظ التعديلات" : "إضافة الزيت"} onSubmit={save}
        extraActions={mode === "edit" && (
          <Button type="button" variant="outline" className="h-11 gap-2 text-destructive" disabled={saving} onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-4" aria-hidden />حذف الزيت
          </Button>
        )}>
        <Field label="رقم الزيت" htmlFor="oil_id" required={mode === "create"} error={errors.id} hint={mode === "edit" ? "لا يمكن تغيير الرقم" : undefined}>
          <Input id="oil_id" className="h-11" dir="ltr" value={f.id} disabled={mode === "edit"} aria-invalid={bad("id")} onChange={(e) => set("id", e.target.value)} />
        </Field>
        <Field label="اسم الزيت" htmlFor="oil_name" required error={errors.name}>
          <Input id="oil_name" className="h-11" value={f.name} aria-invalid={bad("name")} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="التكلفة (لكل مل)" htmlFor="oil_cost" required hint="تُقبل الكسور، و0 مقبول" error={errors.cost}>
          <NumberField id="oil_cost" value={f.cost} invalid={bad("cost")} onChange={(n) => set("cost", n)} />
        </Field>
        <Field label="الحالة" htmlFor="oil_status">
          <NativeSelect id="oil_status" value={f.status} onChange={(e) => set("status", e.target.value)}>
            {STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </NativeSelect>
        </Field>
        {mode === "edit"
          ? <QuantityFields idPrefix="oil" unit="مل" qty={f.qty} add={f.add} error={errors.qty} onQty={(n) => set("qty", n)} onAdd={(n) => set("add", n)} />
          : <Field label="الكمية (مل)" htmlFor="oil_qty" required hint="0 مقبول، وتُقبل الكسور" error={errors.qty}>
              <NumberField id="oil_qty" value={f.qty} invalid={bad("qty")} onChange={(n) => set("qty", n)} />
            </Field>}
      </FormShell>
      <ConfirmDialog open={confirmDelete} title={`حذف الزيت «${oil?.oil_name ?? ""}»؟`}
        description="قد تكون منتجات ما زالت مرتبطة بهذا الزيت، وسيفشل بيعها في نقطة البيع بعد حذفه. لا يمكن التراجع."
        confirmLabel="حذف" destructive onConfirm={remove} onOpenChange={setConfirmDelete} />
    </>
  );
}

export default function OilFormPage() {
  const { id } = useParams();
  const mode = id ? "edit" : "create";
  const oil = useQuery({
    queryKey: ["oil", id], enabled: mode === "edit", retry: false, staleTime: 0, gcTime: 0,
    queryFn: async () => {
      const body = await api(`/oils/${encodeURIComponent(id)}`);
      if (!body?.data?._id) throw new ApiError(404, "الزيت غير موجود", body);
      return body.data;
    },
  });
  const notFound = oil.error instanceof ApiError && [400, 404].includes(oil.error.status);
  return (
    <div className="p-4 lg:p-6">
      {oil.error ? <ErrorState title={notFound ? "الزيت غير موجود" : "تعذر تحميل الزيت"} hint={notFound ? "قد يكون حُذف أو أن الرابط غير صحيح" : "تحقق من الاتصال ثم أعد المحاولة"} onRetry={notFound ? undefined : () => oil.refetch()} />
        : mode === "edit" && !oil.isSuccess ? <div className="space-y-3" role="status" aria-label="جارٍ التحميل">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
        : <OilForm mode={mode} oil={oil.data} />}
    </div>
  );
}
