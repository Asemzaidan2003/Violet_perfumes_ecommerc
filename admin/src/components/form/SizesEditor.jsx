import { Plus, Trash2 } from "lucide-react";
import { normalizeSize } from "@store-shared/vocab.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizeNumberInput } from "@/lib/cart";
import { NumberField } from "./fields";

// value: [{ size: string, price: number | null }]. The parent schema enforces at least one row.
export function SizesEditor({ value, onChange, idPrefix = "size" }) {
  const set = (i, patch) => onChange(value.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-3">
      {value.map((row, i) => {
        const norm = normalizeNumberInput(normalizeSize(row.size));
        return (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-start gap-2">
            <div className="space-y-1">
              <Label htmlFor={`${idPrefix}-${i}`}>الحجم (مل)</Label>
              <Input id={`${idPrefix}-${i}`} className="h-11" dir="ltr" inputMode="decimal" value={row.size}
                onChange={(e) => set(i, { size: e.target.value })} />
              {row.size.trim() !== "" && norm !== row.size && (
                <p className="text-sm text-muted-foreground">سيُحفظ: <bdi dir="ltr">{norm}</bdi></p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${idPrefix}-price-${i}`}>السعر</Label>
              <NumberField id={`${idPrefix}-price-${i}`} value={row.price} onChange={(price) => set(i, { price })} />
            </div>
            <Button type="button" variant="outline" className="mt-6 size-11" aria-label={`حذف الحجم ${i + 1}`}
              onClick={() => onChange(value.filter((_, j) => j !== i))}>
              <Trash2 aria-hidden />
            </Button>
          </div>
        );
      })}
      <Button type="button" variant="outline" className="h-11" onClick={() => onChange([...value, { size: "", price: null }])}>
        <Plus aria-hidden /> إضافة حجم
      </Button>
    </div>
  );
}
