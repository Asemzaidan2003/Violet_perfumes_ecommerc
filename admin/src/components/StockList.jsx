import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { api, ApiError, listOf } from "@/lib/api";
import { EmptyState, ErrorState, PageHeader, StatCard } from "@/components/page";
import { ResponsiveTable } from "@/components/ResponsiveTable";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

const norm = (v) => String(v ?? "").toLowerCase();

// Generic list for the stock catalogues (oils, bottles). cfg: { key, path, capitalPath, capitalLabels: [qtyLabel, capitalLabel],
// title, searchLabel, searchOf(row), sorts: [{ key, label, cmp }], columns, card, rowKey, addTo, addLabel, icon, emptyTitle, emptyHint }
export function StockList({ cfg }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState(cfg.sorts[0].key);
  const list = useQuery({ queryKey: [cfg.key], queryFn: listOf(cfg.path), staleTime: 0, refetchOnMount: "always" });
  const capital = useQuery({
    queryKey: [cfg.key, "capital"], retry: false, staleTime: 0, refetchOnMount: "always",
    queryFn: async () => {
      try { return (await api(cfg.capitalPath))?.data ?? null; } catch (e) { if (e instanceof ApiError && e.status === 404) return null; throw e; }
    },
  });
  const all = list.data ?? [];
  const rows = useMemo(() => {
    const needle = norm(q.trim());
    const cmp = cfg.sorts.find((s) => s.key === sort)?.cmp;
    const out = all.filter((r) => !needle || cfg.searchOf(r).some((v) => norm(v).includes(needle)));
    return cmp ? [...out].sort(cmp) : out;
  }, [all, q, sort, cfg]);
  const add = <Button asChild className="h-11 gap-2"><Link to={cfg.addTo}><Plus className="size-5" aria-hidden />{cfg.addLabel}</Link></Button>;
  const cap = capital.data;

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader eyebrow="الكتالوج" title={cfg.title} actions={add} />
      {cap && (
        <div className="grid gap-3 sm:grid-cols-2">
          <StatCard label={cfg.capitalLabels[0]} value={Number(cap.quantity) || 0} />
          <StatCard label={cfg.capitalLabels[1]} value={`${(Number(cap.capital) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} د.أ`} />
        </div>
      )}
      {list.error && !list.data ? <ErrorState onRetry={() => list.refetch()} hint="تحقق من الاتصال ثم أعد المحاولة" />
        : list.isPending ? <div className="space-y-3" role="status" aria-label="جارٍ التحميل">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
        : all.length === 0 ? (
          <div className="grid place-items-center gap-3">
            <EmptyState icon={cfg.icon} title={cfg.emptyTitle} hint={cfg.emptyHint} />
            {add}
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="relative space-y-1.5">
                <Label htmlFor="stock-search">{cfg.searchLabel}</Label>
                <Search className="pointer-events-none absolute start-3 bottom-3 size-5 text-muted-foreground" aria-hidden />
                <Input id="stock-search" className="h-11 ps-10 text-base" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stock-sort">الترتيب</Label>
                <NativeSelect id="stock-sort" value={sort} onChange={(e) => setSort(e.target.value)}>
                  {cfg.sorts.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </NativeSelect>
              </div>
            </div>
            <ResponsiveTable columns={cfg.columns} rows={rows} rowKey={cfg.rowKey} renderCard={cfg.card}
              emptyState={<EmptyState icon={cfg.icon} title="لا توجد نتائج مطابقة" hint="جرّب تعديل البحث" />} />
          </>
        )}
    </div>
  );
}
