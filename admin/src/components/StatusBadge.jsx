import { cn } from "@/lib/utils";
import { arabicStatus } from "@/lib/format";

const TONE = {
  pending: "bg-st-pending-bg text-st-pending-fg",
  completed: "bg-st-completed-bg text-st-completed-fg",
  canceled: "bg-st-canceled-bg text-st-canceled-fg",
  "ready for delivery": "bg-st-ready-bg text-st-ready-fg",
  "in delivery": "bg-st-delivery-bg text-st-delivery-fg",
  "uncollected payment": "bg-st-uncollected-bg text-st-uncollected-fg",
  unconfirmed: "bg-st-unconfirmed-bg text-st-unconfirmed-fg",
  default: "bg-secondary text-secondary-foreground",
};

export function Pill({ tone = "default", className, children }) {
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", TONE[tone] ?? TONE.default, className)}>{children}</span>;
}

export function StatusBadge({ status }) {
  return <Pill tone={status}>{status === "unconfirmed" ? "بانتظار التأكيد" : arabicStatus(status)}</Pill>;
}
