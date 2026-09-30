import { ActiveSwitch } from "@/components/crud/ActiveSwitch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { moveItem } from "@/lib/reorder";
import { SECTION_LABELS, TITLED } from "./defaults";

// Controlled by the parent form state (a title typed before toggling visibility is never lost).
export function SectionsTable({ sections, onChange }) {
  const patch = (i, part) => onChange(sections.map((s, j) => (j === i ? { ...s, ...part } : s)));
  return (
    <div className="space-y-2">
      <h3 className="text-base font-semibold">أقسام الصفحة الرئيسية</h3>
      <p className="text-sm text-muted-foreground">رتّب الأقسام، أخفِ ما لا تريد عرضه، وخصّص عنوان الأقسام التي تدعم ذلك.</p>
      <ul id="sectionsBody" className="space-y-2">
        {sections.map((s, i) => {
          const label = SECTION_LABELS[s.key] ?? s.key;
          return (
            <li key={s.key} className="flex flex-wrap items-center gap-3 rounded-lg border p-2">
              <span className="min-w-32 flex-1 font-medium">{label}</span>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="size-11 p-0" aria-label={`رفع ${label}`} disabled={i === 0} onClick={() => onChange(moveItem(sections, i, -1))}>▲</Button>
                <Button type="button" variant="outline" className="size-11 p-0" aria-label={`خفض ${label}`} disabled={i === sections.length - 1} onClick={() => onChange(moveItem(sections, i, 1))}>▼</Button>
              </div>
              <ActiveSwitch checked={s.visible} label={`إظهار ${label}`} text="ظاهر" onChange={(v) => patch(i, { visible: v })} />
              {TITLED.includes(s.key)
                ? <Input aria-label={`عنوان مخصص — ${label}`} className="h-11 min-w-40 flex-1" maxLength={40} placeholder={label} value={s.title} onChange={(e) => patch(i, { title: e.target.value })} />
                : <span className="min-w-40 flex-1 text-muted-foreground">—</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
