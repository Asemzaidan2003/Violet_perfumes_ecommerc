import { X } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { effectivePrice } from "@/lib/cart";
import { money } from "@/lib/format";

export function SizePicker({ product, onPick, onClose }) {
  return (
    <Dialog open={!!product} onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="sm:max-w-sm">
        <DialogHeader className="flex-row items-start justify-between gap-2">
          <div className="space-y-1.5 text-start">
            <DialogTitle>{product?.p_name}</DialogTitle>
            <DialogDescription>اختر الحجم</DialogDescription>
          </div>
          <DialogClose aria-label="إغلاق" className="-mt-2 -me-2 grid size-11 shrink-0 place-items-center rounded-lg hover:bg-accent focus-visible:outline-2"><X className="size-5" aria-hidden /></DialogClose>
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
