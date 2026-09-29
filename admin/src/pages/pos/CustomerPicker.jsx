import { useMemo, useState } from "react";
import { Check, UserPlus, X } from "lucide-react";
import { normalizePhone } from "@store-shared/phone.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CustomerPicker({ customers, value, onChange }) {
  const [query, setQuery] = useState("");
  const q = query.trim();
  const digits = normalizePhone(q);
  const matches = useMemo(() => {
    if (!q) return [];
    const lower = q.toLowerCase();
    return customers.filter((c) => c.name?.toLowerCase().includes(lower) || (digits.length >= 4 && c.phone?.includes(digits))).slice(0, 5);
  }, [customers, q, digits]);

  if (value.mode === "existing") {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border bg-accent p-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-sm font-semibold text-accent-foreground"><Check className="size-4 shrink-0" aria-hidden />{value.customer.name}</p>
          {value.customer.phone && <p className="text-xs text-muted-foreground"><bdi dir="ltr">{value.customer.phone}</bdi></p>}
        </div>
        <Button variant="ghost" className="h-11 shrink-0" onClick={() => onChange({ mode: "none" })}>تغيير</Button>
      </div>
    );
  }

  if (value.mode === "new") {
    return (
      <div className="space-y-3 rounded-xl border p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">زبون جديد</p>
          <Button variant="ghost" size="icon" className="size-11" onClick={() => onChange({ mode: "none" })} aria-label="إلغاء الزبون الجديد"><X aria-hidden /></Button>
        </div>
        <div className="space-y-1">
          <Label htmlFor="new-customer-name">الاسم</Label>
          <Input id="new-customer-name" value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} className="h-11 text-base" autoComplete="off" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="new-customer-phone">الهاتف (اختياري)</Label>
          <Input id="new-customer-phone" dir="ltr" inputMode="tel" value={value.phone} onChange={(e) => onChange({ ...value, phone: e.target.value })} className="h-11 text-base" autoComplete="off" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border p-3">
      <Label htmlFor="customer-search">الزبون</Label>
      <Input id="customer-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث بالاسم أو رقم الهاتف" className="h-11 text-base" autoComplete="off" />
      {matches.length > 0 && (
        <ul className="space-y-2" aria-label="نتائج الزبائن">
          {matches.map((c) => (
            <li key={c._id}>
              <button type="button" onClick={() => { onChange({ mode: "existing", customer: c }); setQuery(""); }}
                className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-3 text-start hover:bg-accent focus-visible:outline-2">
                <span className="text-sm font-medium">{c.name}</span>
                {c.phone && <span className="text-xs text-muted-foreground"><bdi dir="ltr">{c.phone}</bdi></span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {q && matches.length === 0 && <p className="text-xs text-muted-foreground">لا يوجد زبون مطابق</p>}
      <Button type="button" variant="outline" className="h-11 w-full gap-2"
        onClick={() => onChange({ mode: "new", name: digits.length >= 7 ? "" : q, phone: digits.length >= 7 ? digits : "" })}>
        <UserPlus className="size-4" aria-hidden />زبون جديد
      </Button>
    </div>
  );
}
