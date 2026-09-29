import { Loader2, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { totals } from "@/lib/cart";
import { money } from "@/lib/format";
import { CartLine } from "@/pages/pos/CartLine";

const METHODS = [{ value: "Cash", label: "نقدًا" }, { value: "Credit", label: "ائتمان" }];

export function CartPanel({ cart, bottles, attempted, customerSlot, payment, onPayment, onQty, onPrice, onBottle, onRemove, onCheckout, pending }) {
  const { items, amount } = totals(cart);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {cart.length === 0 ? (
          <div className="grid place-items-center gap-2 py-12 text-center text-muted-foreground">
            <ShoppingCart className="size-10" aria-hidden />
            <p>السلة فارغة — اضغط على منتج لإضافته</p>
          </div>
        ) : (
          <ul className="space-y-3" aria-label="عناصر السلة">
            {cart.map((line) => <CartLine key={line.key} line={line} bottles={bottles} attempted={attempted} onQty={onQty} onPrice={onPrice} onBottle={onBottle} onRemove={onRemove} />)}
          </ul>
        )}
        {customerSlot}
      </div>

      <div className="space-y-3 border-t bg-card p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="طريقة الدفع">
          {METHODS.map((m) => (
            <button key={m.value} type="button" onClick={() => onPayment(m.value)} aria-pressed={payment === m.value}
              className={cn("h-11 rounded-lg border text-sm font-medium", payment === m.value ? "border-primary bg-primary text-primary-foreground" : "bg-background")}>{m.label}</button>
          ))}
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">{items} قطعة</span>
          <span dir="ltr" className="text-xl font-bold" aria-label="الإجمالي">{money(amount)}</span>
        </div>
        <Button onClick={onCheckout} disabled={pending || cart.length === 0} className="h-12 w-full text-base">
          {pending && <Loader2 className="animate-spin" aria-hidden />} إتمام البيع
        </Button>
      </div>
    </div>
  );
}
