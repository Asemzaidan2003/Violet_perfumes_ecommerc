import { useRef } from "react";
import { Loader2, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Centered dialog on wide screens, bottom sheet on phones. Close is blocked while submitting.
export function CrudDialog({ open, title, onOpenChange, onSubmit, submitting, error, submitLabel = "حفظ", wide, children }) {
  const sending = useRef(false);
  const body = useRef(null);
  const guarded = (o) => { if (!o && (submitting || sending.current)) return; onOpenChange(o); };
  async function submit(e) {
    e.preventDefault();
    if (sending.current || submitting) return;
    sending.current = true;
    try { await onSubmit?.(e); } finally { sending.current = false; }
  }
  return (
    <Dialog open={open} onOpenChange={guarded}>
      <DialogContent showCloseButton={false} aria-describedby={undefined}
        onOpenAutoFocus={(e) => { e.preventDefault(); body.current?.querySelector("input:not([type=file]),select,textarea")?.focus(); }}
        className={cn("flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 max-sm:inset-x-0 max-sm:top-auto max-sm:bottom-0 max-sm:max-w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-2xl", wide ? "sm:max-w-4xl" : "sm:max-w-xl")}>
        <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-2 border-b p-4">
            <DialogTitle className="text-lg">{title}</DialogTitle>
            <Button type="button" variant="ghost" className="size-11 p-0" aria-label="إغلاق" onClick={() => guarded(false)}><X className="size-5" aria-hidden /></Button>
          </div>
          <div ref={body} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm font-medium text-destructive">{error}</p>}
            {children}
          </div>
          <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t bg-background p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <Button type="submit" className="h-11 min-w-28" disabled={submitting}>
              {submitting && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />}
              {submitLabel}
            </Button>
            <Button type="button" variant="outline" className="h-11" disabled={submitting} onClick={() => guarded(false)}>إلغاء</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
