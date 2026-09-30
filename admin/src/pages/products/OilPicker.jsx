import { useState } from "react";
import { Droplet, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const norm = (v) => String(v ?? "").toLowerCase();

// value: the oil's custom id ("" = none). Search matches the oil name AND its id. Every string renders as text.
export function OilPicker({ value, oils, onChange, invalid }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const selected = oils.find((o) => o.id === value);
  const needle = norm(q.trim());
  const rows = oils.filter((o) => !needle || norm(o.oil_name).includes(needle) || norm(o.id).includes(needle));
  const pick = (id) => { onChange(id); setOpen(false); };
  return (
    <div className="space-y-2">
      {value ? (
        <p className="break-words rounded-md border bg-muted px-3 py-2 text-sm" data-testid="selected-oil">
          {selected ? <>تم اختيار: <b>{selected.oil_name}</b> (<bdi dir="ltr">{selected.id}</bdi>)</> : <>زيت غير موجود في القائمة: <bdi dir="ltr">{value}</bdi></>}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="h-11 gap-2" aria-invalid={invalid || undefined} onClick={() => { setQ(""); setOpen(true); }}>
          <Droplet className="size-4" aria-hidden />{value ? "تغيير الزيت" : "اختيار زيت"}
        </Button>
        {value ? <Button type="button" variant="ghost" className="h-11 gap-2" onClick={() => onChange("")}><X className="size-4" aria-hidden />إزالة الزيت</Button> : null}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false} className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader className="text-start">
            <DialogTitle>اختيار الزيت</DialogTitle>
            <DialogDescription>ابحث باسم الزيت أو رقمه ثم اختر واحدًا.</DialogDescription>
          </DialogHeader>
          <div className="relative space-y-1.5">
            <Label htmlFor="oil-search">بحث</Label>
            <Search className="pointer-events-none absolute start-3 bottom-3 size-5 text-muted-foreground" aria-hidden />
            <Input id="oil-search" className="h-11 ps-10" value={q} autoComplete="off" onChange={(e) => setQ(e.target.value)} />
          </div>
          <ul className="max-h-[45dvh] space-y-2 overflow-y-auto" aria-label="الزيوت">
            {rows.map((o) => (
              <li key={o._id ?? o.id}>
                <button type="button" onClick={() => pick(o.id)} aria-pressed={o.id === value}
                  className="flex min-h-11 w-full flex-col items-start rounded-md border px-3 py-2 text-start hover:bg-accent focus-visible:outline-2 aria-pressed:border-primary">
                  <span className="break-words font-medium">{o.oil_name}</span>
                  <span className="text-sm text-muted-foreground"><bdi dir="ltr">{o.id}</bdi></span>
                </button>
              </li>
            ))}
            {rows.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">{oils.length ? "لا توجد زيوت مطابقة" : "لا توجد زيوت بعد — أضف زيتًا أولًا"}</li>}
          </ul>
          <DialogClose asChild><Button type="button" variant="outline" className="h-11">إغلاق</Button></DialogClose>
        </DialogContent>
      </Dialog>
    </div>
  );
}
