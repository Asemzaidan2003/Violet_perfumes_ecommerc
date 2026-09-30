import { useState } from "react";
import { Field } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { contrastReport, isHex6 } from "@/lib/themeColors";
import { AdvancedColors } from "./AdvancedColors";

const COLORS = [["bg", "theme_bg", "لون الخلفية"], ["surface", "theme_surface", "لون السطح"], ["text", "theme_text", "لون النص"], ["accent", "theme_accent", "لون التمييز"]];
const RATIO_IDS = { "text-bg": "ratioBg", "text-surface": "ratioSurface", "accent-bg": "ratioAccent" };

function ColorField({ id, label, value, onChange }) {
  const [text, setText] = useState(value);
  const shown = text.toLowerCase() === value.toLowerCase() || !isHex6(text) ? text : value;
  return (
    <Field label={label} htmlFor={id}>
      <div className="flex items-center gap-2">
        <input id={id} type="color" value={value} onChange={(e) => { setText(e.target.value); onChange(e.target.value); }} className="h-11 w-14 shrink-0 cursor-pointer rounded-md border bg-background p-1" />
        <Input id={`${id}_hex`} aria-label={`${label} (hex)`} dir="ltr" className="h-11 text-start" maxLength={7} value={shown}
          onChange={(e) => { setText(e.target.value); if (isHex6(e.target.value)) onChange(e.target.value.toLowerCase()); }} />
      </div>
    </Field>
  );
}

export function ThemeSection({ theme, setTheme, overrides, setOverrides, onReset, resetting }) {
  const report = contrastReport(theme);
  const failing = report.filter((r) => !r.ok);
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        {COLORS.map(([k, id, label]) => <ColorField key={k} id={id} label={label} value={theme[k]} onChange={(v) => setTheme({ ...theme, [k]: v })} />)}
      </div>
      <div id="themePreview" className="space-y-3 rounded-lg border p-4" style={{ background: theme.bg, color: theme.text }}>
        <p>نص على الخلفية <span id="ratioBg" dir="ltr">({report[0].ratio.toFixed(1)}:1)</span></p>
        <div className="rounded-md p-3" style={{ background: theme.surface }}>نص على السطح <span id="ratioSurface" dir="ltr">({report[1].ratio.toFixed(1)}:1)</span></div>
        <p className="flex flex-wrap items-center gap-2">
          <span className="rounded-md px-3 py-2" style={{ background: theme.accent, color: theme.text }}>زر بلون التمييز</span>
          <span id="ratioAccent" dir="ltr">({report[2].ratio.toFixed(1)}:1)</span>
        </p>
      </div>
      <p className="text-sm text-muted-foreground">نسب التباين إعلامية ولا تمنع الحفظ.</p>
      {failing.length > 0 && (
        <ul role="status" className="space-y-1 rounded-lg border border-st-pending-fg/40 bg-st-pending-bg p-3 text-sm text-st-pending-fg">
          {failing.map((r) => <li key={r.key}>تحذير: {r.label} ({r.ratio.toFixed(1)}:1) أقل من الحد الموصى به {r.threshold}:1</li>)}
        </ul>
      )}
      <Button id="resetThemeBtn" type="button" variant="outline" className="h-11" disabled={resetting} onClick={onReset}>استعادة الألوان الافتراضية</Button>
      <AdvancedColors theme={theme} overrides={overrides} onChange={setOverrides} />
    </>
  );
}
