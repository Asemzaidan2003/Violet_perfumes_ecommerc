import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ShoppingCart, X } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { addToCart, removeLine, restoreLine, setBottle, setPrice, setQuantity, totals } from "@/lib/cart";
import { money } from "@/lib/format";
import { CartPanel } from "@/pages/pos/CartPanel";
import { CustomerPicker } from "@/pages/pos/CustomerPicker";
import { ProductGrid } from "@/pages/pos/ProductGrid";
import { ReceiptDialog } from "@/pages/pos/ReceiptDialog";
import { useCheckout } from "@/pages/pos/useCheckout";
import { useCatalog } from "@/pages/pos/useCatalog";

export default function PosPage() {
  const catalog = useCatalog();
  const [cart, setCart] = useState([]);
  const [customer, setCustomer] = useState({ mode: "none" });
  const [receipt, setReceipt] = useState(null);
  const [payment, setPayment] = useState("Cash");
  const [sheetOpen, setSheetOpen] = useState(false);
  const desktop = useMediaQuery("(min-width: 1024px)");
  const searchRef = useRef(null);
  const { items, amount } = totals(cart);

  const checkout = useCheckout({
    cart, bottles: catalog.bottles, customer, payment,
    onCustomerCreated: (created) => setCustomer({ mode: "existing", customer: created }),
    onDone: (result) => { setReceipt(result); setSheetOpen(false); },
  });
  const newSale = () => { setReceipt(null); setCart([]); setCustomer({ mode: "none" }); setPayment("Cash"); checkout.reset(); };

  // Refreshed on every render. runCheckout reads checkoutRef only AFTER flushSync has re-rendered, so it always submits the freshest cart.
  const checkoutRef = useRef(checkout.submit);
  checkoutRef.current = checkout.submit;
  // Safari does not focus a tapped button, so a price input can still be focused (uncommitted) at checkout: blur it first and flush its setCart.
  const runCheckout = () => {
    if (receipt) return;
    flushSync(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
    checkoutRef.current();
  };
  const runCheckoutRef = useRef(runCheckout);
  runCheckoutRef.current = runCheckout;

  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      const typing = t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); runCheckoutRef.current(); return; }
      if (e.key === "/" && !typing) { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onPick = (product, sizeEntry) => setCart((c) => addToCart(c, product, sizeEntry, catalog.bottles));
  const onRemove = (key) => {
    const index = cart.findIndex((l) => l.key === key);
    if (index < 0) return;
    const line = cart[index];
    setCart((c) => removeLine(c, key));
    toast(`تم حذف ${line.name}`, { action: { label: "تراجع", onClick: () => setCart((c) => restoreLine(c, line, index)) } });
  };

  const panel = (
    <CartPanel cart={cart} bottles={catalog.bottles} attempted={checkout.attempted} payment={payment} onPayment={setPayment}
      onQty={(k, q) => setCart((c) => setQuantity(c, k, q))} onPrice={(k, v) => setCart((c) => setPrice(c, k, v))}
      onBottle={(k, id) => setCart((c) => setBottle(c, k, id))} onRemove={onRemove}
      customerSlot={<CustomerPicker customers={catalog.customers} value={customer} onChange={setCustomer} />}
      onCheckout={runCheckout} pending={checkout.pending} />
  );

  // Below lg the fixed cart bar floats above the 64px tab bar, so the page reserves 3.5rem (+safe area) extra bottom padding on top of the shell's own pb-20.
  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:min-h-dvh lg:pb-0">
      <ProductGrid products={catalog.products} loading={catalog.loading} error={catalog.error} onRetry={catalog.refetch} onPick={onPick} searchRef={searchRef} />

      {desktop ? (
        <aside aria-label="السلة" className="sticky top-0 h-dvh w-[26rem] shrink-0 border-s bg-background">{panel}</aside>
      ) : (
        <>
          <button type="button" onClick={() => setSheetOpen(true)} aria-label={`فتح السلة، ${items} قطعة`}
            className="fixed inset-x-3 bottom-[calc(4rem+env(safe-area-inset-bottom)+0.5rem)] z-20 flex h-14 items-center justify-between rounded-xl bg-primary px-4 text-primary-foreground shadow-lg focus-visible:outline-2">
            <span className="flex items-center gap-2 font-semibold" aria-live="polite"><ShoppingCart className="size-5" aria-hidden />السلة ({items})</span>
            <span dir="ltr" className="font-bold">{money(amount)}</span>
          </button>
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetContent side="bottom" showCloseButton={false} aria-describedby={undefined} className="h-[88dvh] gap-0 rounded-t-2xl p-0">
              <SheetHeader className="flex-row items-center justify-between border-b py-2 ps-4 pe-2">
                <SheetTitle>السلة</SheetTitle>
                <SheetClose aria-label="إغلاق" className="grid size-11 place-items-center rounded-lg hover:bg-accent focus-visible:outline-2"><X className="size-5" aria-hidden /></SheetClose>
              </SheetHeader>
              <div className="min-h-0 flex-1">{panel}</div>
            </SheetContent>
          </Sheet>
        </>
      )}
      <ReceiptDialog result={receipt} onNewSale={newSale} />
    </div>
  );
}
