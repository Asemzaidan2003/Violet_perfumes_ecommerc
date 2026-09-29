import { useState } from "react";
import { presetRange } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import { cn } from "@/lib/utils";

export const PRESETS = [
  { key: "today", label: "اليوم" },
  { key: "week", label: "هذا الأسبوع" },
  { key: "month", label: "هذا الشهر" },
  { key: "30d", label: "آخر 30 يوم" },
  { key: "90d", label: "آخر 90 يوم" },
];
const STATUS_OPTIONS = [
  { value: "completed", label: "المكتملة فقط (المبيعات الفعلية)" },
  { value: "all", label: "جميع الحالات (عدا الملغاة)" },
  { value: "pending", label: "قيد الانتظار" },
  { value: "canceled", label: "ملغاة" },
];

// Presets apply immediately (dates only); "تطبيق" applies the date and status inputs.
export function ReportFilters({ applied, preset, onApply, onPreset }) {
  const [draft, setDraft] = useState(applied);
  const set = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  const pick = (key) => {
    const r = { ...presetRange(key), status: draft.status }; // presets apply the current status too
    setDraft((d) => ({ ...d, ...r }));
    onPreset(key, r);
  };
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4 text-card-foreground" aria-label="تصفية التقارير">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.5fr_auto] lg:items-end">
        <div className="space-y-1.5"><Label htmlFor="rep-from">من تاريخ</Label><Input id="rep-from" type="date" className="h-11" value={draft.from} onChange={set("from")} /></div>
        <div className="space-y-1.5"><Label htmlFor="rep-to">إلى تاريخ</Label><Input id="rep-to" type="date" className="h-11" value={draft.to} onChange={set("to")} /></div>
        <div className="space-y-1.5">
          <Label htmlFor="rep-status">حالة الطلبات</Label>
          <NativeSelect id="rep-status" value={draft.status} onChange={set("status")}>
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </NativeSelect>
        </div>
        <Button type="button" className="h-11" onClick={() => onApply(draft)}>تطبيق</Button>
      </div>
      <p className="text-sm text-muted-foreground">الطلبات الملغاة لا تظهر في التقارير، لذلك يعيد خيار «ملغاة» نتائج فارغة.</p>
      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="فترات جاهزة">
        {PRESETS.map((p) => (
          <Button key={p.key} type="button" variant={preset === p.key ? "default" : "outline"} aria-pressed={preset === p.key}
            className={cn("h-11 flex-none whitespace-nowrap")} onClick={() => pick(p.key)}>{p.label}</Button>
        ))}
      </div>
    </section>
  );
}
