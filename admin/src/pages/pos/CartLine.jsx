import { useEffect, useState } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { NativeSelect } from "@/components/native-select";
import { Input } from "@/components/ui/input";
import { bottlesFor, linePrice, lineTotal, setPrice, setQuantity } from "@/lib/cart";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

function PriceInput({ line, onPrice }) {
  const shown = String(linePrice(line));
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]);
  // Reset the text to what setPrice actually charges (same function the parent runs), so blank/garbage/equal-to-unit input never lingers.
  const commit = () => {
    const [next] = setPrice([line], line.key, text);
    setText(String(linePrice(next)));
    onPrice(line.key, text);
  };
  return (
    <Input dir="ltr" inputMode="decimal" value={text} aria-label={`سعر ${line.name} ${line.size} مل`}
      onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      className={cn("h-11 w-24 text-center text-base", line.priceOverride != null && "border-primary")} />
  );
}

function QtyInput({ line, onQty }) {
  const shown = String(line.quantity);
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]);
  // Commit on blur/Enter so clearing the field and typing a new number works; the text then shows the quantity actually kept.
  const commit = () => {
    const [next] = setQuantity([line], line.key, text);
    setText(String(next.quantity));
    onQty(line.key, text);
  };
  return (
    <Input dir="ltr" inputMode="numeric" value={text} aria-label={`كمية ${line.name} ${line.size} مل`}
      onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      className="h-11 w-14 text-center text-base" />
  );
}

export function CartLine({ line, bottles, attempted, onQty, onPrice, onBottle, onRemove }) {
  const options = bottlesFor(bottles, line.size);
  const missing = attempted && !line.bottleId;
  return (
    <li className="space-y-3 rounded-xl border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{line.name}</p>
          <p className="text-xs text-muted-foreground"><bdi dir="ltr">{line.size} ml</bdi></p>
        </div>
        <button type="button" onClick={() => onRemove(line.key)} aria-label={`حذف ${line.name}`}
          className="grid size-11 shrink-0 place-items-center rounded-lg text-destructive hover:bg-destructive/10 focus-visible:outline-2"><Trash2 className="size-5" aria-hidden /></button>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2" role="group" aria-label="الكمية">
          <button type="button" onClick={() => onQty(line.key, line.quantity - 1)} aria-label="إنقاص الكمية" disabled={line.quantity <= 1}
            className="grid size-11 place-items-center rounded-lg border bg-background disabled:bg-muted disabled:text-muted-foreground focus-visible:outline-2"><Minus className="size-4" aria-hidden /></button>
          <QtyInput line={line} onQty={onQty} />
          <button type="button" onClick={() => onQty(line.key, line.quantity + 1)} aria-label="زيادة الكمية"
            className="grid size-11 place-items-center rounded-lg border bg-background focus-visible:outline-2"><Plus className="size-4" aria-hidden /></button>
        </div>
        <PriceInput line={line} onPrice={onPrice} />
      </div>

      <div className="space-y-1">
        <NativeSelect value={line.bottleId ?? ""} onChange={(e) => onBottle(line.key, e.target.value)} aria-label={`زجاجة ${line.name} ${line.size} مل`} aria-invalid={missing || undefined}>
          <option value="">{options.length ? "اختر زجاجة" : `لا توجد زجاجة بسعة ${line.size} مل`}</option>
          {options.map((b) => <option key={b._id} value={b._id}>{b.name} (المتوفر: {b.quantity})</option>)}
        </NativeSelect>
        {missing && <p role="alert" className="text-xs font-medium text-destructive">{options.length ? "اختر زجاجة لهذا السطر" : "لا توجد زجاجة بهذه السعة"}</p>}
      </div>

      <p className="text-end text-sm font-bold"><bdi dir="ltr">{money(lineTotal(line))}</bdi></p>
    </li>
  );
}
