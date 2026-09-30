import { useEffect, useState } from "react";
import { FAMILIES } from "@store-shared/vocab.js";
import { ChipGroup, Field } from "@/components/form/fields";
import { NativeSelect } from "@/components/native-select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { splitList } from "@/lib/numbers";

// A raw-text field that round-trips through splitList on blur (comma/، separated), the same
// parse-on-commit shape as NumberField: typing isn't clobbered mid-edit by the array<->string conversion.
function ListField({ id, label, value, onChange, error }) {
  const [text, setText] = useState(value.join("، "));
  useEffect(() => {
    setText((t) => (splitList(t).join("، ") === value.join("، ") ? t : value.join("، ")));
  }, [value]);
  const commit = () => {
    const list = splitList(text);
    onChange(list);
    setText(list.join("، "));
  };
  return (
    <Field label={label} htmlFor={id} error={error}>
      <Textarea id={id} rows={2} value={text} aria-invalid={error ? true : undefined} onChange={(e) => setText(e.target.value)} onBlur={commit} />
    </Field>
  );
}

const familyOptions = FAMILIES.map((f) => ({
  value: f.key,
  label: (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block size-3 rounded-full border" style={{ background: f.swatch }} aria-hidden />
      {f.ar}
    </span>
  ),
}));

// v/set/errors: the form's watch(), setValue() setter and react-hook-form errors, as in ProductFormPage.
// brands: the raw lookup list (active + inactive) — filtered here to active ones plus whichever one is
// already selected, so an edit never silently drops an inactive designer.
export function TaxonomySection({ v, set, errors, brands }) {
  const brandOptions = brands.filter((b) => b.active !== false || String(b._id) === v.brand);
  const notesErr = (layer) => {
    const e = errors.notes?.[layer];
    return e?.message ?? (Array.isArray(e) ? e.find(Boolean)?.message : undefined);
  };

  return (
    <>
      <Field label="العائلات العطرية">
        {/* FAMILIES order is also the ChipGroup's DOM order; families[] is re-sorted to that same
            order on every toggle (not click order), so it stays a stable, predictable list. */}
        <ChipGroup label="العائلات العطرية" options={familyOptions} selected={v.families}
          onChange={(next) => set("families", FAMILIES.filter((f) => next.includes(f.key)).map((f) => f.key))} />
      </Field>

      <Field label="المصمم" htmlFor="p_brand">
        <NativeSelect id="p_brand" value={v.brand} onChange={(e) => set("brand", e.target.value)}>
          <option value="">بدون</option>
          {brandOptions.map((b) => <option key={b._id} value={b._id}>{`${b.name_ar} / ${b.name_en}`}</option>)}
        </NativeSelect>
      </Field>

      <ListField id="notes_top" label="النوتات العليا (افصل بفواصل)" value={v.notes.top}
        onChange={(list) => set("notes", { ...v.notes, top: list })} error={notesErr("top")} />
      <ListField id="notes_heart" label="نوتات القلب (افصل بفواصل)" value={v.notes.heart}
        onChange={(list) => set("notes", { ...v.notes, heart: list })} error={notesErr("heart")} />
      <ListField id="notes_base" label="النوتات الأساسية (افصل بفواصل)" value={v.notes.base}
        onChange={(list) => set("notes", { ...v.notes, base: list })} error={notesErr("base")} />

      <Field label="الوصف" htmlFor="description" hint={`${v.description.length}/2000`} error={errors.description?.message}>
        <Textarea id="description" rows={4} maxLength={2000} value={v.description} aria-invalid={errors.description ? true : undefined}
          onChange={(e) => set("description", e.target.value)} />
      </Field>
      <Field label="كلمات بحث إضافية (مثل الاسم بالإنجليزية)" htmlFor="keywords" hint={`${v.keywords.length}/300`} error={errors.keywords?.message}>
        <Input id="keywords" className="h-11" maxLength={300} value={v.keywords} aria-invalid={errors.keywords ? true : undefined}
          onChange={(e) => set("keywords", e.target.value)} />
      </Field>
    </>
  );
}
