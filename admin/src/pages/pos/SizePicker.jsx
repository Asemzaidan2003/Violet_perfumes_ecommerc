import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { effectivePrice } from "@/lib/cart";
import { money } from "@/lib/format";

export function SizePicker({ product, onPick, onClose }) {
  return (
    <Dialog open={!!product} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{product?.p_name}</DialogTitle>
          <DialogDescription>اختر الحجم</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {product?.size_list.map((s) => (
            <button key={s.size} type="button" onClick={() => onPick(product, s)}
              className="flex min-h-14 items-center justify-between rounded-lg border bg-card px-4 text-base font-medium hover:bg-accent focus-visible:outline-2">
              <span dir="ltr">{s.size} ml</span>
              <span dir="ltr" className="font-bold text-primary">{money(effectivePrice(product, s))}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
