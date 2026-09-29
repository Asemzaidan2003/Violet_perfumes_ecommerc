import { useSyncExternalStore } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const MQ = "(min-width: 768px)";
const subscribe = (cb) => { const m = window.matchMedia(MQ); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); };
const useWide = () => useSyncExternalStore(subscribe, () => window.matchMedia(MQ).matches, () => true);

const ALIGN = { start: "text-start", center: "text-center", end: "text-end" };
const cellOf = (c, row, i) => (c.cell ? c.cell(row, i) : row[c.key]);

// columns: [{ key, header, cell?(row, index), align?, className? }]. Only one layout is rendered at a time.
export function ResponsiveTable({ columns, rows, rowKey, emptyState, renderCard }) {
  const wide = useWide();
  if (!rows?.length) return emptyState ?? null;
  if (!wide) {
    return (
      <ul className="space-y-3">
        {rows.map((row, i) => (
          <li key={rowKey(row)} className="rounded-xl border bg-card p-4 text-card-foreground">
            {renderCard ? renderCard(row, i) : (
              <dl className="grid gap-2">
                {columns.map((c) => (
                  <div key={c.key} className="flex items-start justify-between gap-3 text-sm">
                    <dt className="font-medium text-muted-foreground">{c.header}</dt>
                    <dd className="min-w-0 text-end">{cellOf(c, row, i)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>{columns.map((c) => <TableHead key={c.key} className={cn(ALIGN[c.align], c.className)}>{c.header}</TableHead>)}</TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={rowKey(row)}>
              {columns.map((c) => <TableCell key={c.key} className={cn(ALIGN[c.align], c.className)}>{cellOf(c, row, i)}</TableCell>)}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
