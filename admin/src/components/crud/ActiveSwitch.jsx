import { cn } from "@/lib/utils";

// 44px hit area with a visible text label. `label` is the accessible name (e.g. "تفعيل عرض الصيف").
export function ActiveSwitch({ checked, onChange, label, text = "مفعّل", pending }) {
  return (
    <button type="button" role="switch" aria-checked={!!checked} aria-label={label} disabled={pending} onClick={() => onChange(!checked)}
      className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-70">
      <span dir="ltr" aria-hidden className={cn("flex h-6 w-11 shrink-0 items-center rounded-full border-2 p-0.5 transition-colors motion-reduce:transition-none", checked ? "border-primary bg-primary" : "border-muted-foreground bg-muted")}>
        <span className={cn("size-4 rounded-full transition-transform motion-reduce:transition-none", checked ? "translate-x-5 bg-primary-foreground" : "translate-x-0 bg-muted-foreground")} />
      </span>
      <span>{text}</span>
    </button>
  );
}
