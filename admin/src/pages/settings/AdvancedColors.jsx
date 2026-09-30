import { Button } from "@/components/ui/button";
import { DEFAULT_THEME, deriveTokens, isHex6, OVERRIDE_TOKENS } from "@/lib/themeColors";

// overrides: token -> "#rrggbb" for the ones the owner set ("" or missing = derived from the four main colours).
export function AdvancedColors({ theme, overrides, onChange }) {
  const derived = deriveTokens({ ...DEFAULT_THEME, ...theme });
  const isSet = (k) => isHex6(overrides[k]);
  return (
    <details id="advancedColors" className="rounded-lg border p-3">
      <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">خيارات متقدمة (12 لونًا)</summary>
      <div className="space-y-4 pt-3">
        <p className="text-sm text-muted-foreground">الألوان غير المضبوطة تُشتق تلقائيًا من الألوان الأربعة الرئيسية وتظهر بعلامة «مشتق».</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {OVERRIDE_TOKENS.map(({ key, label }) => {
            const shown = isSet(key) ? overrides[key] : derived[key];
            const swatch = isHex6(shown) ? shown : undefined;
            return (
              <div key={key} className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
                <label htmlFor={`ov_${key}`} className="min-w-0 flex-1 text-sm font-medium">{label}</label>
                {isSet(key)
                  ? <span className="text-xs text-muted-foreground">مضبوط</span>
                  : <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">مشتق</span>}
                <input id={`ov_${key}`} data-token={key} type="color" value={swatch ?? "#808080"} onChange={(e) => onChange({ ...overrides, [key]: e.target.value })}
                  className="h-11 w-14 cursor-pointer rounded-md border bg-background p-1" />
                {!isHex6(shown) && <span className="text-xs text-muted-foreground" dir="ltr">{shown}</span>}
                {isSet(key) && <Button type="button" variant="outline" className="h-11" data-reset={key} onClick={() => onChange({ ...overrides, [key]: "" })}>إعادة تعيين</Button>}
              </div>
            );
          })}
        </div>
        <Button type="button" variant="outline" className="h-11" disabled={!OVERRIDE_TOKENS.some((t) => isSet(t.key))}
          onClick={() => onChange(Object.fromEntries(OVERRIDE_TOKENS.filter((t) => isSet(t.key)).map((t) => [t.key, ""])))}>مسح كل التخصيصات</Button>
      </div>
    </details>
  );
}
