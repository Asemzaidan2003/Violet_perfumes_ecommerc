import { Field, NumberField } from "@/components/form/fields";

// Current stock + "add quantity". Negative stock means owed stock. If both are filled the add wins (see quantityUpdate).
export function QuantityFields({ idPrefix, qty, add, onQty, onAdd, unit, error }) {
  return (
    <>
      <Field label={`الكمية الحالية${unit ? ` (${unit})` : ""}`} htmlFor={`${idPrefix}_qty`} hint="القيمة السالبة تعني مخزونًا مستحقًا" error={error}>
        <NumberField id={`${idPrefix}_qty`} value={qty} invalid={error ? true : undefined} onChange={onQty} />
      </Field>
      <Field label="إضافة كمية" htmlFor={`${idPrefix}_add`}
        hint={typeof add === "number" && add > 0 ? "سيُضاف هذا الرقم إلى المخزون ويُتجاهل تعديل الكمية الحالية أعلاه" : "اختياري — يُضاف إلى المخزون الحالي"}>
        <NumberField id={`${idPrefix}_add`} value={add} onChange={onAdd} />
      </Field>
    </>
  );
}
