import { useState } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { money, num } from "@/lib/format";
import { bdi, EmptyState } from "@/components/page";
import { ResponsiveTable, useWide } from "@/components/ResponsiveTable";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INVALID = "يرجى تعبئة جميع الحقول بشكل صحيح";
const FIELDS = [
  { key: "name", label: "الاسم", type: "text" },
  { key: "type", label: "النوع", type: "text" },
  { key: "quantity", label: "الكمية", type: "number", step: "any" },
  { key: "add", label: "إضافة", type: "number", step: "any", min: "0", placeholder: "+ إضافة" },
  { key: "cost", label: "التكلفة", type: "number", step: "0.01" },
];

// Builds the PUT body, or null when the form is invalid. `quantity` only when changed, `add_quantity` only when > 0.
export function alcoholPayload(d, original) {
  const name = d.name.trim();
  const type = d.type.trim();
  const add = d.add.trim();
  const quantity = d.quantity.trim() === "" ? NaN : Number(d.quantity);
  const cost = d.cost.trim() === "" ? NaN : Number(d.cost);
  if (!name || !type || !Number.isFinite(quantity) || !Number.isFinite(cost) || cost < 0) return null;
  if (add !== "" && !(Number(add) > 0)) return null;
  const body = { name, type, cost };
  if (quantity !== original.quantity) body.quantity = quantity;
  if (add !== "") body.add_quantity = Number(add);
  return body;
}

export default function AlcoholSection({ rows, onSaved }) {
  const wide = useWide();
  const [editing, setEditing] = useState(null); // the row being edited
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const start = (row) => {
    setEditing(row);
    setDraft({ name: row.name ?? "", type: row.type ?? "", quantity: String(row.quantity ?? 0), add: "", cost: String(row.cost ?? 0) });
    setError("");
  };
  const cancel = () => { setEditing(null); setError(""); };
  const save = async () => {
    const body = alcoholPayload(draft, editing);
    if (!body) { setError(INVALID); return; }
    setSaving(true);
    try {
      await api(`/alcohols/${editing.id}`, { method: "PUT", body });
      toast.success("تم حفظ التعديلات");
      setEditing(null);
      setError("");
      await onSaved();
    } catch (err) {
      setError(err?.message || "تعذر حفظ التعديلات");
    } finally { setSaving(false); }
  };

  const input = (f, id) => (
    <Input id={`alcohol-${f.key}-${id}`} aria-label={f.label} className="h-11 min-w-24" type={f.type} step={f.step} min={f.min} placeholder={f.placeholder}
      value={draft[f.key]} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))} />
  );
  const inline = (row) => wide && editing?.id === row.id;
  const field = (key) => FIELDS.find((f) => f.key === key);
  const columns = [
    { key: "name", header: "الاسم", cell: (r) => (inline(r) ? input(field("name"), r.id) : r.name) },
    { key: "type", header: "النوع", cell: (r) => (inline(r) ? input(field("type"), r.id) : r.type) },
    { key: "quantity", header: "الكمية", cell: (r) => (inline(r)
      ? <div className="grid gap-2">{input(field("quantity"), r.id)}{input(field("add"), r.id)}</div> : bdi(num(r.quantity))) },
    { key: "cost", header: "التكلفة", cell: (r) => (inline(r) ? input(field("cost"), r.id) : bdi(money(r.cost))) },
    { key: "value", header: "القيمة", cell: (r) => bdi(money(r.value)) },
    { key: "actions", header: "إجراءات", cell: (r) => (inline(r) ? (
      <div className="flex gap-2">
        <Button type="button" className="h-11" disabled={saving} onClick={save}>حفظ</Button>
        <Button type="button" variant="outline" className="h-11" disabled={saving} onClick={cancel}>إلغاء</Button>
      </div>
    ) : (
      <Button type="button" variant="outline" className="h-11" onClick={() => start(r)}><Pencil aria-hidden />تعديل</Button>
    )) },
  ];

  return (
    <section className="space-y-3">
      <h2 className="font-semibold">الكحول</h2>
      <div id="alcoholTable">
        <ResponsiveTable columns={columns} rows={rows} rowKey={(r) => r.id} emptyState={<EmptyState title="لا توجد بيانات" />} />
      </div>
      {wide && error && <p role="alert" className="text-sm font-medium text-st-canceled-fg">{error}</p>}
      <Dialog open={!wide && !!editing} onOpenChange={(o) => { if (!o) cancel(); }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>تعديل الكحول</DialogTitle>
            <DialogDescription>عدّل بيانات الصنف ثم احفظ</DialogDescription>
          </DialogHeader>
          {editing && !wide && (
            <div className="grid gap-3">
              {FIELDS.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label htmlFor={`alcohol-${f.key}-${editing.id}`}>{f.label}</Label>
                  {input(f, editing.id)}
                </div>
              ))}
              {error && <p role="alert" className="text-sm font-medium text-st-canceled-fg">{error}</p>}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button type="button" className="h-11" disabled={saving} onClick={save}>حفظ</Button>
            <Button type="button" variant="outline" className="h-11" disabled={saving} onClick={cancel}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
