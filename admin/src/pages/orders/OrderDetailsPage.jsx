import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { ApiError, api, listOf } from "@/lib/api";
import { bottlesFor, normalizeNumberInput } from "@/lib/cart";
import { fmtDate, money, paymentLabel } from "@/lib/format";
import { NativeSelect } from "@/components/native-select";
import { ErrorState, PageHeader } from "@/components/page";
import { ResponsiveTable } from "@/components/ResponsiveTable";
import { StatusBadge } from "@/components/StatusBadge";
import { WhatsAppLink } from "@/components/WhatsAppLink";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

const bdi = (v) => <bdi dir="ltr">{v}</bdi>;
const orNone = (v) => (v == null || v === "" ? "-" : String(v));
const stockLabel = (o) => (o.status === "canceled" ? "ملغي (أُعيد المخزون)" : o.stock_deducted === false ? "بانتظار التأكيد" : "تم الخصم");
const isConfirmMode = (o) => o.source === "online" && o.stock_deducted === false && o.status !== "canceled";
const errText = (err) => (err instanceof ApiError ? err.message : "تعذّر الاتصال بالخادم");

function Item({ label, children }) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="break-words font-medium">{children}</dd>
    </div>
  );
}

function Summary({ o }) {
  return (
    <section className="rounded-xl border bg-card p-4 text-card-foreground">
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Item label="الحالة"><StatusBadge status={o.status} /></Item>
        <Item label="طريقة الدفع">{orNone(paymentLabel(o.payment_method))}</Item>
        <Item label="عدد المنتجات">{bdi(o.total_items ?? 0)}</Item>
        <Item label="الإجمالي">{bdi(money(o.final_total))}</Item>
        <Item label="الربح">{bdi(money(o.total_profit))}</Item>
        <Item label="التكلفة الإجمالية">{bdi(money(o.total_cost))}</Item>
        <Item label="تاريخ الإنشاء">{bdi(fmtDate(o.createdAt))}</Item>
        <Item label="ملاحظات">{orNone(o.order_notes)}</Item>
        <Item label="المصدر">{o.source === "online" ? "الموقع" : "نقطة البيع"}</Item>
        <Item label="المخزون">{stockLabel(o)}</Item>
      </dl>
    </section>
  );
}

function Delivery({ d }) {
  return (
    <section id="deliveryInfo" className="rounded-xl border bg-card p-4 text-card-foreground">
      <h2 className="mb-3 font-semibold">معلومات التوصيل</h2>
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Item label="الاسم">{orNone(d.name)}</Item>
        <Item label="الهاتف">
          <span className="flex flex-wrap items-center gap-2">
            {bdi(orNone(d.phone))}
            {d.phone && <WhatsAppLink phone={d.phone} name={d.name} />}
          </span>
        </Item>
        <Item label="المحافظة">{orNone(d.city)}</Item>
        <Item label="العنوان">{orNone(d.address)}</Item>
        <Item label="ملاحظات التوصيل">{orNone(d.notes)}</Item>
      </dl>
    </section>
  );
}

const readOnlyColumns = [
  { key: "n", header: "#", cell: (_, i) => bdi(i + 1) },
  { key: "name", header: "اسم العطر", cell: (p) => <span className="break-words">{orNone(p.p_name)}</span> },
  { key: "size", header: "الحجم", cell: (p) => bdi(orNone(p.product_size)) },
  { key: "qty", header: "الكمية", cell: (p) => bdi(p.quantity ?? 0) },
  { key: "price", header: "سعر البيع", cell: (p) => bdi(money(p.selling_price)) },
  { key: "bottle", header: "اسم الزجاجة", cell: (p) => <span className="break-words">{orNone(p.bottle?.name)}</span> },
  { key: "rev", header: "الإيراد", cell: (p) => bdi(money(p.total_revenue)) },
  { key: "cost", header: "الكلفة", cell: (p) => bdi(money(p.total_cost)) },
  { key: "profit", header: "الربح", cell: (p) => bdi(money(p.total_profit)) },
];

const withKeys = (products) => (products ?? []).map((p, i) => ({ ...p, _id: p._id ?? `line-${i}` }));

function ConfirmForm({ order, bottles, onConfirmed }) {
  const products = withKeys(order.products);
  const [lines, setLines] = useState(() => products.map((p) => ({ quantity: String(p.quantity ?? 1), price: String(p.selling_price ?? 0), bottle: "" })));
  const [fee, setFee] = useState(String(order.delivery_fee ?? 0));
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);

  const patch = (i, k) => (e) => { setError(""); setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: e.target.value } : l))); };

  async function submit(e) {
    e.preventDefault();
    if (inFlight.current) return;
    if (lines.some((l) => !l.bottle)) { setError("يرجى اختيار زجاجة لكل منتج"); return; }
    inFlight.current = true;
    setPending(true);
    try {
      const clean = (v) => normalizeNumberInput(v).trim();
      const res = await api(`/orders/${order._id}/confirm`, { method: "POST", body: {
        lines: lines.map((l) => ({ bottle_id: l.bottle, quantity: clean(l.quantity), price: clean(l.price) })),
        delivery_fee: clean(fee),
      } });
      toast.success("تم تأكيد الطلب وخصم المخزون");
      await onConfirmed(Array.isArray(res?.shortages) ? res.shortages : []);
    } catch (err) {
      toast.error(errText(err));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  const columns = [
    { key: "n", header: "#", cell: (_, i) => bdi(i + 1) },
    { key: "name", header: "اسم العطر", cell: (p) => <span className="break-words">{orNone(p.p_name)}</span> },
    { key: "size", header: "الحجم", cell: (p) => bdi(orNone(p.product_size)) },
    { key: "qty", header: "الكمية", cell: (p, i) => (
      <Input id={`qty-${i}`} aria-label={`الكمية للسطر ${i + 1}`} inputMode="numeric" dir="ltr" className="h-11 w-24" value={lines[i].quantity} onChange={patch(i, "quantity")} />
    ) },
    { key: "price", header: "سعر البيع", cell: (p, i) => (
      <Input id={`price-${i}`} aria-label={`السعر للسطر ${i + 1}`} inputMode="decimal" dir="ltr" className="h-11 w-28" value={lines[i].price} onChange={patch(i, "price")} />
    ) },
    { key: "bottle", header: "اسم الزجاجة", cell: (p, i) => {
      const fit = bottlesFor(bottles, p.product_size);
      return (
        <div className="space-y-1">
          <NativeSelect id={`bottle-${i}`} aria-label={`الزجاجة للسطر ${i + 1}`} aria-invalid={!!error && !lines[i].bottle} className="min-w-48" value={lines[i].bottle} onChange={patch(i, "bottle")}>
            <option value="">-- اختر زجاجة --</option>
            {fit.map((b) => <option key={b._id} value={b._id}>{`${b.name} (المتوفر: ${b.quantity})`}</option>)}
          </NativeSelect>
          {fit.length === 0 && <p className="text-sm text-muted-foreground">لا توجد زجاجة بهذه السعة</p>}
        </div>
      );
    } },
    { key: "rev", header: "الإيراد", cell: (p) => bdi(money(p.total_revenue)) },
    { key: "cost", header: "الكلفة", cell: () => "-" },
    { key: "profit", header: "الربح", cell: () => "-" },
  ];

  return (
    <form onSubmit={submit} className="space-y-4">
      <ResponsiveTable columns={columns} rows={products} rowKey={(p) => p._id} />
      {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
      <div id="confirmBar" className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
        <div className="space-y-1.5">
          <label htmlFor="deliveryFeeInput" className="text-sm font-medium">رسوم التوصيل</label>
          <Input id="deliveryFeeInput" inputMode="decimal" dir="ltr" className="h-11 w-32" value={fee} onChange={(e) => setFee(e.target.value)} />
        </div>
        <Button id="confirmBtn" type="submit" className="h-11" disabled={pending}>{pending ? "جارٍ التأكيد..." : "تأكيد الطلب وخصم المخزون"}</Button>
      </div>
    </form>
  );
}

function Shortages({ items }) {
  return (
    <div role="alert" className="space-y-2 rounded-xl border bg-st-pending-bg p-4 text-st-pending-fg">
      <p className="flex items-center gap-2 font-semibold"><TriangleAlert className="size-5" aria-hidden /> المخزون غير كافٍ لهذه المواد — سيصبح رصيدها بالسالب</p>
      <ul className="list-disc space-y-1 ps-6 text-sm">
        {items.map((s, i) => <li key={i}><span className="break-words">{s.item}</span>: المطلوب {bdi(s.needed)}، المتوفر {bdi(s.available)}</li>)}
      </ul>
    </div>
  );
}

export default function OrderDetailsPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [shortages, setShortages] = useState([]);
  const orderQ = useQuery({
    queryKey: ["order", id],
    queryFn: async () => (await api(`/orders/${encodeURIComponent(id)}`)).data,
    staleTime: 0,
    retry: (n, err) => !(err instanceof ApiError) && n < 1,
  });
  const order = orderQ.data;
  const confirmMode = !!order && isConfirmMode(order);
  const bottlesQ = useQuery({ queryKey: ["order-bottles"], queryFn: listOf("/bottles"), enabled: confirmMode, staleTime: 0 });

  async function confirmed(list) {
    setShortages(list);
    qc.invalidateQueries({ queryKey: ["orders"] });
    qc.invalidateQueries({ queryKey: ["pending-count"] });
    qc.invalidateQueries({ queryKey: ["order-bottles"] });
    await orderQ.refetch();
  }

  const back = (
    <Link to="/orders" className="inline-flex h-11 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground">
      <ArrowRight className="size-4" aria-hidden /> الرجوع إلى الطلبات
    </Link>
  );

  let body;
  if (orderQ.error && !order) {
    const err = orderQ.error;
    body = err instanceof ApiError && err.status === 404
      ? <ErrorState title="الطلب غير موجود" />
      : <ErrorState title="تعذر تحميل الطلب" hint={errText(err)} onRetry={() => orderQ.refetch()} />;
  } else if (!order) {
    body = <div className="space-y-3" role="status" aria-label="جارٍ التحميل">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>;
  } else {
    body = (
      <>
        <Summary o={order} />
        {order.source === "online" && order.delivery && <Delivery d={order.delivery} />}
        {shortages.length > 0 && <Shortages items={shortages} />}
        {confirmMode
          ? bottlesQ.isPending ? <Skeleton className="h-40 w-full" />
            : bottlesQ.error ? <ErrorState title="تعذر تحميل الزجاجات" hint={errText(bottlesQ.error)} onRetry={() => bottlesQ.refetch()} />
            : <ConfirmForm order={order} bottles={bottlesQ.data ?? []} onConfirmed={confirmed} />
          : <ResponsiveTable columns={readOnlyColumns} rows={withKeys(order.products)} rowKey={(p) => p._id} />}
      </>
    );
  }

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader eyebrow="الطلبات" title="تفاصيل الطلب" actions={back} />
      {body}
    </div>
  );
}
