import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FAMILIES } from "@store-shared/vocab.js";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { isoToAmmanLocal } from "@/lib/amman";
import { NativeSelect } from "@/components/native-select";
import { BannerUpload } from "@/components/crud/BannerUpload";
import { CrudDialog } from "@/components/crud/CrudDialog";
import { Field, SwitchField } from "@/components/form/fields";
import { Input } from "@/components/ui/input";
import { buildPlacementBody, slotOf, SLOTS, validatePlacement } from "./slots";

const THEMES = [["dark", "داكن"], ["light", "فاتح"], ["gold", "ذهبي"]];
const netMsg = (e) => (e instanceof ApiError ? e.message : "تعذّر الاتصال بالخادم");
const fromPlacement = (p) => ({
  slot: p.slot, title: p.title ?? "", subtitle: p.subtitle ?? "", image: p.image ?? "", link: p.link ?? "", cta: p.cta ?? "", theme: p.theme ?? "dark",
  category: p.target?.category ?? "", family: p.target?.family ?? "", starts: isoToAmmanLocal(p.starts_at), ends: isoToAmmanLocal(p.ends_at),
  sort: String(p.sort ?? 0), active: p.active !== false,
});
const EMPTY = { slot: "announcement", title: "", subtitle: "", image: "", link: "", cta: "", theme: "dark", category: "", family: "", starts: "", ends: "", sort: "0", active: true };

export function PlacementDialog({ placement, categories, onClose }) {
  const qc = useQueryClient();
  const edit = !!placement?._id;
  const [f, setF] = useState(() => (edit ? fromPlacement(placement) : EMPTY));
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState("");
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const slot = slotOf(f.slot);
  const save = useMutation({
    mutationFn: (body) => api(edit ? `/placements/${placement._id}` : "/placements", { method: edit ? "PUT" : "POST", body }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["placements"] }); toast.success(edit ? "تم تحديث الموضع" : "تمت إضافة الموضع"); onClose(); },
    onError: (e) => setBanner(netMsg(e)),
  });
  function submit() {
    const e = validatePlacement(f);
    setErrors(e);
    setBanner("");
    if (Object.keys(e).length) return;
    return save.mutateAsync(buildPlacementBody(f)).catch(() => {});
  }
  const bad = (k) => (errors[k] ? true : undefined);

  return (
    <CrudDialog open title={edit ? "تعديل موضع" : "إضافة موضع"} onOpenChange={(o) => { if (!o) onClose(); }} onSubmit={submit} submitting={save.isPending} error={banner}>
      <Field label="الموضع" htmlFor="pf-slot">
        <NativeSelect id="pf-slot" value={f.slot} onChange={(e) => set("slot", e.target.value)}>
          {SLOTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </NativeSelect>
      </Field>
      <Field label="العنوان" htmlFor="pf-title" required error={errors.title}>
        <Input id="pf-title" className="h-11" maxLength={80} value={f.title} aria-invalid={bad("title")} onChange={(e) => set("title", e.target.value)} />
      </Field>
      <Field label="النص الفرعي" htmlFor="pf-subtitle" error={errors.subtitle}>
        <Input id="pf-subtitle" className="h-11" maxLength={160} value={f.subtitle} onChange={(e) => set("subtitle", e.target.value)} />
      </Field>
      <Field label={slot?.imageRequired ? "الصورة (مطلوبة لهذا الموضع)" : "الصورة"} error={errors.image}>
        <BannerUpload id="pf-image" value={f.image} onChange={(v) => set("image", v)} />
      </Field>
      <Field label="الرابط" htmlFor="pf-link" hint="/c/men أو https://…" error={errors.link}>
        <Input id="pf-link" dir="ltr" className="h-11 text-start" value={f.link} aria-invalid={bad("link")} onChange={(e) => set("link", e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="نص الزر" htmlFor="pf-cta" error={errors.cta}>
          <Input id="pf-cta" className="h-11" maxLength={30} value={f.cta} onChange={(e) => set("cta", e.target.value)} />
        </Field>
        <Field label="السمة" htmlFor="pf-theme">
          <NativeSelect id="pf-theme" value={f.theme} onChange={(e) => set("theme", e.target.value)}>
            {THEMES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </NativeSelect>
        </Field>
      </div>
      {slot?.targeted && (
        <div id="pf-target-wrap" className="grid gap-4 sm:grid-cols-2">
          <Field label="الفئة المستهدفة" htmlFor="pf-target-category">
            <NativeSelect id="pf-target-category" value={f.category} onChange={(e) => set("category", e.target.value)}>
              <option value="">— الكل —</option>
              {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name_ar}</option>)}
              {f.category && !categories.some((c) => c.slug === f.category) && <option value={f.category}>{f.category}</option>}
            </NativeSelect>
          </Field>
          <Field label="العائلة المستهدفة" htmlFor="pf-target-family">
            <NativeSelect id="pf-target-family" value={f.family} onChange={(e) => set("family", e.target.value)}>
              <option value="">— الكل —</option>
              {FAMILIES.map((x) => <option key={x.key} value={x.key}>{x.ar}</option>)}
            </NativeSelect>
          </Field>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="يبدأ في (بتوقيت عمّان)" htmlFor="pf-starts">
          <Input id="pf-starts" type="datetime-local" dir="ltr" className="h-11 text-start" value={f.starts} onChange={(e) => set("starts", e.target.value)} />
        </Field>
        <Field label="ينتهي في (بتوقيت عمّان)" htmlFor="pf-ends" error={errors.ends}>
          <Input id="pf-ends" type="datetime-local" dir="ltr" className="h-11 text-start" value={f.ends} aria-invalid={bad("ends")} onChange={(e) => set("ends", e.target.value)} />
        </Field>
      </div>
      <Field label="الترتيب" htmlFor="pf-sort">
        <Input id="pf-sort" inputMode="numeric" dir="ltr" className="h-11 text-start" value={f.sort} onChange={(e) => set("sort", e.target.value)} />
      </Field>
      <SwitchField id="pf-active" label="نشط" checked={f.active} onChange={(c) => set("active", c)} />
    </CrudDialog>
  );
}
