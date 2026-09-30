import { Field } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// A text field bound to form key `k`. `dflt` = the server default shown as placeholder; clearing the field restores it.
export function Txt({ f, set, k, id, label, error, hint, max, area, dflt, ltr, type = "text", placeholder, counter }) {
  const value = f[k];
  const Comp = area ? Textarea : Input;
  return (
    <Field label={label} htmlFor={id} error={error} hint={counter ? `${value.length}/${max}` : hint}>
      <Comp id={id} type={area ? undefined : type} rows={area ? 2 : undefined} dir={ltr ? "ltr" : undefined} maxLength={max}
        className={area ? undefined : `h-11 ${ltr ? "text-start" : ""}`} value={value} placeholder={dflt ?? placeholder} aria-invalid={error ? true : undefined}
        onChange={(e) => set(k, e.target.value)} />
      {dflt !== undefined && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs text-muted-foreground">إذا تُرك فارغًا يُستخدم النص الافتراضي.</span>
          <Button type="button" variant="ghost" className="h-11 px-3 text-sm" disabled={value === ""} onClick={() => set(k, "")}>استعادة الافتراضي</Button>
        </div>
      )}
    </Field>
  );
}

export const Group = ({ title, open, children }) => (
  <details open={open} className="rounded-xl border bg-card p-4 text-card-foreground [&>summary]:min-h-11">
    <summary className="cursor-pointer py-2 text-lg font-semibold">{title}</summary>
    <div className="space-y-4 pt-3">{children}</div>
  </details>
);
