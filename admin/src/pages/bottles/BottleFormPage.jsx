import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { quantityUpdate, useFormSave } from "@/lib/stock";
import { ErrorState } from "@/components/page";
import { Field, NumberField } from "@/components/form/fields";
import { FormShell } from "@/components/form/FormShell";
import { QuantityFields } from "@/components/form/QuantityFields";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

const isNum = (n) => typeof n === "number" && Number.isFinite(n);

function BottleForm({ mode, bottle }) {
  const qc = useQueryClient();
  const { saving, run } = useFormSave("/bottles");
  const [f, setF] = useState(() => ({
    name: bottle?.name ?? "", capacity: bottle?.capacity ?? null, cost: bottle?.cost ?? null, qty: mode === "edit" ? bottle.quantity : 0, add: null,
  }));
  const [initial] = useState(f);
  const [errors, setErrors] = useState({});
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);

  function validate() {
    const e = {};
    if (!f.name.trim()) e.name = "اسم الزجاجة مطلوب";
    if (!Number.isInteger(f.capacity) || f.capacity < 1) e.capacity = "السعة عدد صحيح بالمل (1 أو أكثر)";
    if (!isNum(f.cost) || f.cost < 0) e.cost = "أدخل تكلفة صحيحة (0 أو أكثر)";
    if (mode === "create" && (!Number.isInteger(f.qty) || f.qty < 0)) e.qty = "الكمية عدد صحيح (0 أو أكثر)";
    if (mode === "edit" && !Number.isInteger(f.qty) && !(isNum(f.add) && f.add > 0)) e.qty = "أدخل كمية صحيحة";
    if (mode === "edit" && f.add !== null && !(f.add > 0)) e.qty = "كمية الإضافة يجب أن تكون موجبة";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function save() {
    if (!validate()) { setTimeout(() => document.querySelector('form [aria-invalid="true"]')?.focus(), 0); return; }
    const base = { name: f.name.trim(), capacity: f.capacity, cost: f.cost };
    const body = mode === "create" ? { ...base, quantity: f.qty } : { ...base, ...quantityUpdate("quantity", bottle.quantity, f.qty, f.add) };
    await run(async () => {
      await api(mode === "edit" ? `/bottles/${encodeURIComponent(bottle._id)}` : "/bottles", { method: mode === "edit" ? "PUT" : "POST", body });
      qc.invalidateQueries({ queryKey: ["bottles"] });
      qc.invalidateQueries({ queryKey: ["bottle"] });
    }, mode === "edit" ? "تم تحديث الزجاجة" : "تمت إضافة الزجاجة");
  }
  const bad = (k) => (errors[k] ? true : undefined);

  return (
    <FormShell title={mode === "edit" ? "تعديل الزجاجة" : "إضافة زجاجة"} backTo="/bottles" dirty={dirty} submitting={saving}
      submitLabel={mode === "edit" ? "حفظ التعديلات" : "إضافة الزجاجة"} onSubmit={save}>
      <Field label="اسم الزجاجة" htmlFor="bottle_name" required error={errors.name}>
        <Input id="bottle_name" className="h-11" value={f.name} aria-invalid={bad("name")} onChange={(e) => set("name", e.target.value)} />
      </Field>
      <Field label="السعة (مل)" htmlFor="bottle_capacity" required hint="عدد صحيح" error={errors.capacity}>
        <NumberField id="bottle_capacity" value={f.capacity} invalid={bad("capacity")} onChange={(n) => set("capacity", n)} />
      </Field>
      <Field label="التكلفة" htmlFor="bottle_cost" required hint="تُقبل الكسور، و0 مقبول" error={errors.cost}>
        <NumberField id="bottle_cost" value={f.cost} invalid={bad("cost")} onChange={(n) => set("cost", n)} />
      </Field>
      {mode === "edit"
        ? <QuantityFields idPrefix="bottle" qty={f.qty} add={f.add} error={errors.qty} onQty={(n) => set("qty", n)} onAdd={(n) => set("add", n)} />
        : <Field label="الكمية" htmlFor="bottle_qty" required hint="0 مقبول" error={errors.qty}>
            <NumberField id="bottle_qty" value={f.qty} invalid={bad("qty")} onChange={(n) => set("qty", n)} />
          </Field>}
    </FormShell>
  );
}

export default function BottleFormPage() {
  const { id } = useParams();
  const mode = id ? "edit" : "create";
  const bottle = useQuery({
    queryKey: ["bottle", id], enabled: mode === "edit", retry: false, staleTime: 0, gcTime: 0,
    queryFn: async () => {
      const body = await api(`/bottles/${encodeURIComponent(id)}`);
      if (!body?.data?._id) throw new ApiError(404, "الزجاجة غير موجودة", body);
      return body.data;
    },
  });
  const notFound = bottle.error instanceof ApiError && [400, 404].includes(bottle.error.status);
  return (
    <div className="p-4 lg:p-6">
      {bottle.error ? <ErrorState title={notFound ? "الزجاجة غير موجودة" : "تعذر تحميل الزجاجة"} hint={notFound ? "قد تكون حُذفت أو أن الرابط غير صحيح" : "تحقق من الاتصال ثم أعد المحاولة"} onRetry={notFound ? undefined : () => bottle.refetch()} />
        : mode === "edit" && !bottle.isSuccess ? <div className="space-y-3" role="status" aria-label="جارٍ التحميل">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
        : <BottleForm mode={mode} bottle={bottle.data} />}
    </div>
  );
}
