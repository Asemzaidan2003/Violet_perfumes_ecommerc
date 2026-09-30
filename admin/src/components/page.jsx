import { AlertTriangle, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { trendArrow, trendClass } from "@/lib/format";

export const bdi = (v) => <bdi dir="ltr">{v}</bdi>;

export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0 space-y-1">
        {eyebrow && <p className="text-sm font-semibold text-primary">{eyebrow}</p>}
        <h1 className="text-2xl font-bold">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

const TONES = {
  default: "bg-card text-card-foreground",
  accent: "bg-accent text-accent-foreground",
  warning: "bg-st-pending-bg text-st-pending-fg",
  danger: "bg-st-canceled-bg text-st-canceled-fg",
};
// Trend colours are only used on the plain card surface; tinted tones keep their own text colour.
const TREND = { up: "text-st-completed-fg", down: "text-st-canceled-fg", flat: "text-muted-foreground" };

export function StatCard({ label, value, sub, tone = "default", trend }) {
  const t = trend == null ? null : trendClass(trend);
  return (
    <div className={cn("rounded-xl border p-4", TONES[tone] ?? TONES.default)}>
      <p className="text-sm font-medium">{label}</p>
      <p className="mt-1 text-2xl font-bold"><bdi dir="ltr">{value}</bdi></p>
      {(sub || t) && (
        <p className="mt-1 flex items-center gap-2 text-sm">
          {t && <span className={cn("font-semibold", tone === "default" && TREND[t])}><bdi dir="ltr">{trendArrow(trend)}</bdi></span>}
          {sub && <span>{sub}</span>}
        </p>
      )}
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, hint }) {
  return (
    <div className="grid place-items-center gap-2 px-4 py-12 text-center text-muted-foreground">
      <Icon className="size-10" aria-hidden />
      <p className="font-medium text-foreground">{title}</p>
      {hint && <p className="text-sm">{hint}</p>}
    </div>
  );
}

export function ErrorState({ title = "تعذر تحميل البيانات", hint, onRetry }) {
  return (
    <div role="alert" className="grid place-items-center gap-2 px-4 py-12 text-center">
      <AlertTriangle className="size-10 text-st-canceled-fg" aria-hidden />
      <p className="font-medium">{title}</p>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      {onRetry && <Button variant="outline" className="h-11" onClick={onRetry}>إعادة المحاولة</Button>}
    </div>
  );
}

// Usage: <ChartCard title="..."><ChartContainer config={...}>...</ChartContainer></ChartCard>; the [&>*]:aspect-auto rule makes the chart fill the box.
export function ChartCard({ title, description, children }) {
  return (
    <section className="rounded-xl border bg-card p-4 text-card-foreground">
      <h2 className="font-semibold">{title}</h2>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
      <div className="mt-3 h-72 w-full [&>*]:aspect-auto [&>*]:h-full [&>*]:w-full" dir="ltr">{children}</div>
    </section>
  );
}
