import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { isoToAmmanLocal } from "@/lib/amman";
import { NativeSelect } from "@/components/native-select";
import { CrudDialog } from "@/components/crud/CrudDialog";
import { Field, SwitchField } from "@/components/form/fields";
import { Input } from "@/components/ui/input";
import { buildCouponBody, validateCoupon } from "./slots";

const netMsg = (e) => (e instanceof ApiError ? e.message : "تعذّر الاتصال بالخادم");

export function CouponDialog({ coupon, onClose }) {
  const qc = useQueryClient();
  const edit = !!coupon?._id;
  const [f, setF] = useState(() => (edit
    ? { code: coupon.code, type: coupon.type, value: String(coupon.value ?? ""), min: String(coupon.min_subtotal ?? 0), starts: isoToAmmanLocal(coupon.starts_at), ends: isoToAmmanLocal(coupon.ends_at), max: String(coupon.max_uses ?? 0), active: coupon.active !== false }
    : { code: "", type: "percent", value: "", min: "0", starts: "", ends: "", max: "0", active: true }));
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState("");
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const save = useMutation({
    mutationFn: (body) => api(edit ? `/coupons/${coupon._id}` : "/coupons", { method: edit ? "PUT" : "POST", body }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["coupons"] }); toast.success(edit ? "تم تحديث الكود" : "تمت إضافة الكود"); onClose(); },
    onError: (e) => setBanner(netMsg(e)),
  });
  function submit() {
    const e = validateCoupon(f, { edit });
    setErrors(e);
    setBanner("");
    if (Object.keys(e).length) return;
    return save.mutateAsync(buildCouponBody(f, { edit })).catch(() => {});
  }
  const bad = (k) => (errors[k] ? true : undefined);

  return (
    <CrudDialog open title={edit ? "تعديل كود" : "إضافة كود خصم"} onOpenChange={(o) => { if (!o) onClose(); }} onSubmit={submit} submitting={save.isPending} error={banner}>
      <Field label="الكود" htmlFor="cf-code" required hint={edit ? "لا يمكن تغيير الكود بعد إنشائه" : undefined} error={errors.code}>
        <Input id="cf-code" dir="ltr" className="h-11 text-start" maxLength={20} value={f.code} disabled={edit} aria-invalid={bad("code")} onChange={(e) => set("code", e.target.value.toUpperCase())} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="النوع" htmlFor="cf-type">
          <NativeSelect id="cf-type" value={f.type} onChange={(e) => set("type", e.target.value)}>
            <option value="percent">نسبة %</option>
            <option value="fixed">قيمة ثابتة</option>
          </NativeSelect>
        </Field>
        <Field label="القيمة" htmlFor="cf-value" required error={errors.value}>
          <Input id="cf-value" inputMode="decimal" dir="ltr" className="h-11 text-start" value={f.value} aria-invalid={bad("value")} onChange={(e) => set("value", e.target.value)} />
        </Field>
      </div>
      <Field label="الحد الأدنى للطلب" htmlFor="cf-min" error={errors.min}>
        <Input id="cf-min" inputMode="decimal" dir="ltr" className="h-11 text-start" value={f.min} aria-invalid={bad("min")} onChange={(e) => set("min", e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="يبدأ في (بتوقيت عمّان)" htmlFor="cf-starts">
          <Input id="cf-starts" type="datetime-local" dir="ltr" className="h-11 text-start" value={f.starts} onChange={(e) => set("starts", e.target.value)} />
        </Field>
        <Field label="ينتهي في (بتوقيت عمّان)" htmlFor="cf-ends" error={errors.ends}>
          <Input id="cf-ends" type="datetime-local" dir="ltr" className="h-11 text-start" value={f.ends} aria-invalid={bad("ends")} onChange={(e) => set("ends", e.target.value)} />
        </Field>
      </div>
      <Field label="أقصى عدد استخدامات (0 = غير محدود)" htmlFor="cf-max" error={errors.max}>
        <Input id="cf-max" inputMode="numeric" dir="ltr" className="h-11 text-start" value={f.max} aria-invalid={bad("max")} onChange={(e) => set("max", e.target.value)} />
      </Field>
      <SwitchField id="cf-active" label="نشط" checked={f.active} onChange={(c) => set("active", c)} />
    </CrudDialog>
  );
}
