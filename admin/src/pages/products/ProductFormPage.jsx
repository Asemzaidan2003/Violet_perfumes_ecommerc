import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { emptyValues, productSchema, toFormValues, toPayload } from "@/lib/productForm";
import { waitForGuardClear } from "@/lib/backGuard";
import { ErrorState } from "@/components/page";
import { NativeSelect } from "@/components/native-select";
import { Field, NumberField, SwitchField } from "@/components/form/fields";
import { FormShell } from "@/components/form/FormShell";
import { SizesEditor } from "@/components/form/SizesEditor";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { MediaSection } from "./MediaSection";
import { OilPicker } from "./OilPicker";
import { TaxonomySection } from "./TaxonomySection";
import { useProductLookups } from "./useProductLookups";

const STATUSES = [["available", "متوفر"], ["out of stock", "غير متوفر"], ["discontinued", "متوقف"]];
const Section = ({ title, children }) => (
  <section className="space-y-4"><h2 className="text-lg font-semibold">{title}</h2>{children}</section>
);

function ProductForm({ mode, id, initial, lookups }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const { setValue, watch, handleSubmit, setError, formState: { errors, isDirty, isSubmitted } } = useForm({
    resolver: zodResolver(productSchema), defaultValues: initial,
  });
  const v = watch();
  const set = (k, val) => setValue(k, val, { shouldDirty: true, shouldValidate: isSubmitted });
  const bad = (k) => (errors[k] ? true : undefined);
  const err = (k) => errors[k]?.message;
  const cats = lookups.categories.some((c) => c.key === v.p_category) || !v.p_category
    ? lookups.categories : [...lookups.categories, { key: v.p_category, name_ar: v.p_category }];
  const sizeErrors = [...new Set([errors.size_list?.message, errors.size_list?.root?.message,
    ...(Array.isArray(errors.size_list) ? errors.size_list.flatMap((r) => [r?.size?.message, r?.price?.message]) : [])].filter(Boolean))];

  async function save(values) {
    setSaving(true);
    try {
      const payload = toPayload(values, { mode });
      await api(mode === "edit" ? `/products/${encodeURIComponent(id)}` : "/products", { method: mode === "edit" ? "PUT" : "POST", body: payload });
      toast.success(mode === "edit" ? "تم تحديث المنتج" : "تمت إضافة المنتج");
      qc.invalidateQueries({ queryKey: ["products-list"] });
      qc.removeQueries({ queryKey: ["product", id] });
      // The back-guard drops its sentinel history entry asynchronously once saving starts; navigating before that
      // lands would leave the form in history. Wait (bounded) for it.
      await waitForGuardClear(window);
      navigate("/products", { replace: true }); // saving stays true: no guard prompt during the navigation
    } catch (e) {
      setSaving(false);
      if (e instanceof ApiError && e.status === 409) setError("p_name", { message: "اسم المنتج مستخدم مسبقًا" });
      else toast.error(e instanceof ApiError ? e.message : "تعذّر الاتصال بالخادم");
    }
  }
  const onInvalid = () => setTimeout(() => document.querySelector('form [aria-invalid="true"]')?.focus(), 0);

  return (
    <FormShell title={mode === "edit" ? "تعديل المنتج" : "إضافة منتج"} backTo="/products" dirty={isDirty} submitting={saving}
      submitLabel={mode === "edit" ? "حفظ التعديلات" : "إضافة المنتج"} onSubmit={handleSubmit(save, onInvalid)}>
      <Section title="البيانات الأساسية">
        <Field label="اسم المنتج" htmlFor="p_name" required error={err("p_name")}>
          <Input id="p_name" className="h-11" value={v.p_name} aria-invalid={bad("p_name")} onChange={(e) => set("p_name", e.target.value)} />
        </Field>
        <Field label="الفئة" htmlFor="p_category" required error={err("p_category")}>
          <NativeSelect id="p_category" value={v.p_category} aria-invalid={bad("p_category")} onChange={(e) => set("p_category", e.target.value)}>
            <option value="">— اختر الفئة —</option>
            {cats.map((c) => <option key={c.key} value={c.key}>{(c.name_ar || c.key) + (c.visible === false ? " (مخفية)" : "")}</option>)}
          </NativeSelect>
        </Field>
        <Field label="الحالة" htmlFor="status">
          <NativeSelect id="status" value={v.status} onChange={(e) => set("status", e.target.value)}>
            {STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </NativeSelect>
        </Field>
        <SwitchField id="visible" label="ظاهر في المتجر" checked={v.visible} onChange={(c) => set("visible", c)} />
      </Section>

      <Section title="العرض">
        <Field label="نسبة العرض %" htmlFor="p_offer_percentage" hint="من 0 إلى 100، وتُقبل الكسور" error={err("p_offer_percentage")}>
          <NumberField id="p_offer_percentage" value={v.p_offer_percentage} invalid={bad("p_offer_percentage")} onChange={(n) => set("p_offer_percentage", n)} />
        </Field>
        <Field label="ينتهي العرض في" htmlFor="offer_ends_at" hint="اختياري — يُترك فارغًا للعرض المفتوح">
          <Input id="offer_ends_at" type="datetime-local" className="h-11" value={v.offer_ends_at} onChange={(e) => set("offer_ends_at", e.target.value)} />
        </Field>
      </Section>

      <Section title="التركيب">
        <Field label="الزيت" required error={err("oil_id")}>
          <OilPicker value={v.oil_id} oils={lookups.oils} invalid={bad("oil_id")} onChange={(oid) => set("oil_id", oid)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="نسبة الزيت %" htmlFor="oil_percentage" required hint="0 مقبول" error={err("oil_percentage")}>
            <NumberField id="oil_percentage" value={v.oil_percentage} invalid={bad("oil_percentage")} onChange={(n) => set("oil_percentage", n)} />
          </Field>
          <Field label="نسبة الكحول %" htmlFor="alcohol_percentage" required hint="0 مقبول" error={err("alcohol_percentage")}>
            <NumberField id="alcohol_percentage" value={v.alcohol_percentage} invalid={bad("alcohol_percentage")} onChange={(n) => set("alcohol_percentage", n)} />
          </Field>
        </div>
      </Section>

      <Section title="الأحجام والأسعار">
        <SizesEditor value={v.size_list} onChange={(rows) => set("size_list", rows)} />
        {sizeErrors.map((m) => <p key={m} role="alert" className="text-sm font-medium text-destructive">{m}</p>)}
      </Section>

      <Section title="الصورة">
        <MediaSection image={v.p_image} images={v.images} onImageChange={(url) => set("p_image", url)}
          onImagesChange={(list) => set("images", list)} error={bad("p_image")} invalid={bad("p_image")} />
      </Section>

      <Section title="التصنيف والوصف">
        <TaxonomySection v={v} set={set} errors={errors} brands={lookups.brands} />
      </Section>
    </FormShell>
  );
}

export default function ProductFormPage() {
  const { id } = useParams();
  const mode = id ? "edit" : "create";
  const lookups = useProductLookups();
  const product = useQuery({
    queryKey: ["product", id], enabled: mode === "edit", retry: false, staleTime: 0, gcTime: 0,
    queryFn: async () => {
      const body = await api(`/products/${encodeURIComponent(id)}`);
      if (!body?.data?._id) throw new ApiError(404, "المنتج غير موجود", body);
      return body.data;
    },
  });
  const [settled, setSettled] = useState(false);
  useEffect(() => { if (!lookups.loading) setSettled(true); }, [lookups.loading]);

  const failed = product.error || (lookups.error && !lookups.loading);
  const ready = settled && !lookups.error && (mode === "create" || product.isSuccess);
  const notFound = product.error instanceof ApiError && (product.error.status === 404 || product.error.status === 400);
  return (
    <div className="p-4 lg:p-6" data-ready={ready ? "true" : "false"}>
      {failed ? (
        <ErrorState title={notFound ? "المنتج غير موجود" : "تعذر تحميل النموذج"} hint={notFound ? "قد يكون حُذف أو أن الرابط غير صحيح" : "تحقق من الاتصال ثم أعد المحاولة"}
          onRetry={notFound ? undefined : () => { lookups.refetch(); product.refetch(); }} />
      ) : !ready ? (
        <div className="space-y-3" role="status" aria-label="جارٍ التحميل">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : (
        <ProductForm mode={mode} id={id} lookups={lookups} initial={mode === "edit" ? toFormValues(product.data) : emptyValues()} />
      )}
    </div>
  );
}
