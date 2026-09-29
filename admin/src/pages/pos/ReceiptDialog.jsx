import { CheckCircle2, Printer, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { money, shortId } from "@/lib/format";

// The print: variants un-fix the dialog so #receipt (index.css print rules) is placed and paginated against the page, not the viewport-centred, scroll-clipped dialog box.
const PRINT = "print:static print:max-h-none print:translate-x-0 print:translate-y-0 print:overflow-visible print:border-0 print:shadow-none";

export function ReceiptDialog({ result, onNewSale }) {
  const order = result?.order;
  return (
    <Dialog open={!!result} onOpenChange={(open) => !open && onNewSale()}>
      {/* The X is 16px (too small a target) and "بيع جديد" is the way out; an outside tap must not dismiss a receipt that has not been printed. */}
      <DialogContent showCloseButton={false} onInteractOutside={(e) => e.preventDefault()} className={`max-h-[90dvh] overflow-y-auto sm:max-w-md ${PRINT}`}>
        <div id="receipt" className="space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CheckCircle2 className="text-primary" aria-hidden />تم إنشاء الطلب</DialogTitle>
            <DialogDescription>رقم الطلب <bdi dir="ltr" className="font-bold">#{shortId(order?._id)}</bdi></DialogDescription>
          </DialogHeader>
          <ul className="divide-y text-sm">
            {order?.products?.map((p, i) => (
              <li key={i} className="flex items-start justify-between gap-3 py-2">
                <span>{p.p_name} <bdi dir="ltr" className="text-muted-foreground">{p.product_size} ml × {p.quantity}</bdi></span>
                <bdi dir="ltr" className="shrink-0 font-medium">{money(p.total_revenue)}</bdi>
              </li>
            ))}
          </ul>
          <div className="flex items-baseline justify-between border-t pt-3">
            <span className="font-semibold">الإجمالي</span>
            <bdi dir="ltr" className="text-xl font-bold">{money(order?.final_total ?? order?.total_revenue)}</bdi>
          </div>
          {result?.shortages?.length > 0 && (
            <div role="alert" className="rounded-lg print:hidden border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <p className="mb-1 flex items-center gap-2 font-semibold"><TriangleAlert className="size-4 shrink-0 text-destructive" aria-hidden />المخزون غير كافٍ لهذه المواد</p>
              <ul className="space-y-0.5">{result.shortages.map((s, i) => <li key={i}>{s.item}: المطلوب <bdi dir="ltr">{s.needed}</bdi>، المتوفر <bdi dir="ltr">{s.available}</bdi></li>)}</ul>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-12 gap-2" onClick={() => window.print()}><Printer className="size-4" aria-hidden />طباعة</Button>
          <Button className="h-12" onClick={onNewSale}>بيع جديد</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
