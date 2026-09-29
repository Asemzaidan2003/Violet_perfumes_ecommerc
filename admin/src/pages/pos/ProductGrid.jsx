import { useMemo, useState } from "react";
import { ImageOff, RefreshCw, Search } from "lucide-react";
import { CATEGORIES } from "@store-shared/vocab.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { effectivePrice } from "@/lib/cart";
import { money } from "@/lib/format";
import { SizePicker } from "@/pages/pos/SizePicker";

const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.ar]));
const hasImage = (p) => p.p_image && p.p_image !== ".";

function Card({ product, onOpen }) {
  const prices = product.size_list.map((s) => effectivePrice(product, s));
  const from = Math.min(...prices);
  const out = product.status !== "available";
  return (
    <button type="button" onClick={() => onOpen(product)} aria-label={`أضف ${product.p_name}`}
      className={cn("flex flex-col overflow-hidden rounded-xl border bg-card text-start transition-shadow hover:shadow-md focus-visible:outline-2", out && "opacity-70")}>
      <div className="relative aspect-square w-full bg-muted">
        {hasImage(product)
          ? <img src={product.p_image} alt="" loading="lazy" className="size-full object-cover" />
          : <ImageOff className="absolute inset-0 m-auto size-8 text-muted-foreground" aria-hidden />}
        <div className="absolute start-2 top-2 flex flex-col gap-1">
          {product.status === "out of stock" && <span className="rounded bg-destructive px-1.5 py-0.5 text-xs font-semibold text-white">نفد</span>}
          {product.status === "discontinued" && <span className="rounded bg-foreground px-1.5 py-0.5 text-xs font-semibold text-background">متوقف</span>}
          {product.visible === false && <span className="rounded bg-secondary px-1.5 py-0.5 text-xs font-semibold text-secondary-foreground">مخفي عن المتجر</span>}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <span className="line-clamp-2 min-h-10 text-sm font-semibold">{product.p_name}</span>
        <span className="text-sm font-bold text-primary">{product.size_list.length > 1 ? "من " : ""}<bdi dir="ltr">{money(from)}</bdi></span>
      </div>
    </button>
  );
}

export function ProductGrid({ products, loading, error, onRetry, onPick, searchRef }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [sizing, setSizing] = useState(null);

  const categories = useMemo(() => [...new Set(products.map((p) => p.p_category).filter(Boolean))], [products]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => (category === "all" || p.p_category === category) && (!q || p.p_name.toLowerCase().includes(q)));
  }, [products, query, category]);

  const open = (product) => (product.size_list.length === 1 ? onPick(product, product.size_list[0]) : setSizing(product));

  return (
    <section aria-label="المنتجات" className="flex min-w-0 flex-1 flex-col gap-3 p-3 lg:p-4">
      <div className="sticky top-14 z-10 -mx-3 space-y-2 bg-background/95 px-3 pb-2 pt-1 backdrop-blur lg:top-0 lg:-mx-4 lg:px-4">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} type="search" inputMode="search"
            placeholder="ابحث عن منتج…  ( / )" aria-label="بحث عن منتج" className="h-12 ps-10 text-base"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && shown[0]) { e.preventDefault(); open(shown[0]); } }} />
        </div>
        {categories.length > 1 && (
          <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1" role="group" aria-label="التصنيف">
            {["all", ...categories].map((c) => (
              <button key={c} type="button" onClick={() => setCategory(c)} aria-pressed={category === c}
                className={cn("h-11 shrink-0 rounded-full border px-4 text-sm font-medium", category === c ? "border-primary bg-primary text-primary-foreground" : "bg-card")}>
                {c === "all" ? "الكل" : CATEGORY_LABEL[c] ?? c}
              </button>
            ))}
          </div>
        )}
      </div>

      {error ? (
        <div role="alert" className="grid place-items-center gap-3 rounded-xl border bg-card p-8 text-center">
          <p className="font-medium">تعذّر تحميل المنتجات</p>
          <Button onClick={onRetry} className="h-11 gap-2"><RefreshCw className="size-4" aria-hidden />إعادة المحاولة</Button>
        </div>
      ) : loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" aria-busy="true">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-56 rounded-xl" />)}</div>
      ) : shown.length === 0 ? (
        <p className="rounded-xl border bg-card p-8 text-center text-muted-foreground">{products.length ? "لا توجد منتجات مطابقة" : "لا توجد منتجات بعد"}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">{shown.map((p) => <Card key={p._id} product={p} onOpen={open} />)}</div>
      )}

      <SizePicker product={sizing} onClose={() => setSizing(null)} onPick={(p, s) => { setSizing(null); onPick(p, s); }} />
    </section>
  );
}
