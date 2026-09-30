import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const MAX = 4;

export function ServiceItems({ items, onChange }) {
  const patch = (i, part) => onChange(items.map((s, j) => (j === i ? { ...s, ...part } : s)));
  return (
    <div className="space-y-2">
      <h3 className="text-base font-semibold">شريط الخدمات <span className="text-sm font-normal text-muted-foreground">(حتى 4 عناصر)</span></h3>
      <p className="text-sm text-muted-foreground">إذا أفرغتَ كل العناصر تُستعاد العناصر الثلاثة الافتراضية. لإخفاء الشريط استخدم زر الإظهار في جدول الأقسام.</p>
      <ul id="serviceItemsBody" className="space-y-2">
        {items.map((s, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2">
            <Input aria-label={`عنوان العنصر ${i + 1}`} className="h-11 min-w-40 flex-1" maxLength={40} placeholder="العنوان" value={s.title} onChange={(e) => patch(i, { title: e.target.value })} />
            <Input aria-label={`نص العنصر ${i + 1}`} className="h-11 min-w-40 flex-[2]" maxLength={80} placeholder="النص" value={s.text} onChange={(e) => patch(i, { text: e.target.value })} />
            <Button type="button" variant="outline" className="h-11 gap-2 text-destructive" aria-label={`حذف العنصر ${i + 1}`} onClick={() => onChange(items.filter((_, j) => j !== i))}><Trash2 className="size-4" aria-hidden />حذف</Button>
          </li>
        ))}
      </ul>
      <Button id="addServiceItem" type="button" variant="secondary" className="h-11" disabled={items.length >= MAX} onClick={() => onChange([...items, { title: "", text: "" }])}>إضافة عنصر</Button>
    </div>
  );
}
