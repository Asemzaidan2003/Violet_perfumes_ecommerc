import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { formatForInput, parseNumberInput } from "@/lib/numbers";

export function Field({ label, htmlFor, hint, error, required, className, children }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <Label htmlFor={htmlFor}>
          {label}
          {required && <span className="text-destructive" aria-hidden> *</span>}
        </Label>
      )}
      {children}
      {hint && !error && <p className="text-sm text-muted-foreground">{hint}</p>}
      {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
    </div>
  );
}

// Text input that parses on blur (Arabic digits / decimal commas) and shows the parsed value back.
// value: number | null; onChange gets number | null. min/max/step are hints only (data attributes), the schema validates.
export function NumberField({ id, value, onChange, min, max, step, invalid, className, ...props }) {
  const [text, setText] = useState(formatForInput(value));
  useEffect(() => {
    setText((t) => (parseNumberInput(t) === value ? t : formatForInput(value)));
  }, [value]);
  const commit = () => {
    const n = parseNumberInput(text);
    onChange(n);
    setText(formatForInput(n));
  };
  return (
    <Input
      id={id}
      type="text"
      inputMode="decimal"
      dir="ltr"
      className={cn("h-11 text-start", className)}
      value={text}
      aria-invalid={invalid || undefined}
      data-min={min}
      data-max={max}
      data-step={step}
      onChange={(e) => { setText(e.target.value); onChange(parseNumberInput(e.target.value)); }}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
      {...props}
    />
  );
}

export function SwitchField({ id, label, checked, onChange, disabled }) {
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
      <span className="text-sm font-medium">{label}</span>
      <Switch id={id} dir="ltr" checked={!!checked} onCheckedChange={onChange} disabled={disabled} />
    </label>
  );
}

// options: [{ value, label }]; selected: value[]
export function ChipGroup({ options, selected, onChange, label }) {
  const toggle = (v) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <label
            key={o.value}
            className={cn(
              "inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-sm font-medium select-none has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
              on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background text-foreground hover:bg-accent",
            )}
          >
            <input type="checkbox" className="sr-only" checked={on} onChange={() => toggle(o.value)} />
            {o.label}
          </label>
        );
      })}
    </div>
  );
}
