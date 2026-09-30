import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Loader2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { installBackGuard } from "@/lib/backGuard";
import { PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";

export const ConfirmLeave = ({ open, onStay, onLeave }) => (
  <ConfirmDialog open={open} title="تغييرات غير محفوظة" description="لديك تغييرات لم تُحفظ بعد. هل تريد المغادرة وتجاهلها؟"
    confirmLabel="مغادرة" destructive onConfirm={onLeave} onOpenChange={(o) => { if (!o) onStay(); }} />
);

// The app uses <BrowserRouter basename="/admin"> (no data router), so useBlocker is unavailable. While active:
// beforeunload covers reload/close, a capture-phase click listener intercepts in-app links, and
// installBackGuard (sentinel history entry) intercepts browser Back. Rapid double-Back can still slip past.
const isAdminPath = (p) => p === "/admin" || p.startsWith("/admin/");

function useLeaveGuard(active) {
  const navigate = useNavigate();
  const [target, setTarget] = useState(null); // { path } | { back: true }
  const guardRef = useRef(null);
  useEffect(() => {
    if (!active) return undefined;
    const guard = installBackGuard(window, () => setTarget({ back: true }));
    guardRef.current = guard;
    const beforeUnload = (e) => { e.preventDefault(); e.returnValue = ""; };
    const onClick = (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest?.("a[href]");
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || !isAdminPath(url.pathname)) return;
      e.preventDefault();
      e.stopPropagation();
      setTarget({ path: (url.pathname.replace(/^\/admin/, "") || "/") + url.search + url.hash });
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onClick, true);
      guard.dispose();
      guardRef.current = null;
    };
  }, [active]);
  return {
    open: target !== null,
    onStay: () => setTarget(null),
    onLeave: () => {
      const t = target;
      setTarget(null);
      if (t?.back) guardRef.current?.exit();
      else if (guardRef.current) guardRef.current.leaveTo(() => navigate(t.path));
      else navigate(t.path);
    },
  };
}

export function FormShell({ title, backTo, onSubmit, dirty, submitting, submitLabel = "حفظ", extraActions, children }) {
  const guard = useLeaveGuard(!!dirty && !submitting);
  const sending = useRef(false);
  async function submit(e) {
    e.preventDefault();
    if (sending.current || submitting) return;
    sending.current = true;
    try { await onSubmit?.(e); } finally { sending.current = false; }
  }
  return (
    <div className="space-y-4">
      <PageHeader title={title} actions={backTo && (
        <Button asChild variant="outline" className="h-11"><Link to={backTo}><ArrowRight aria-hidden /> رجوع</Link></Button>
      )} />
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="space-y-4 rounded-xl border bg-card p-4 text-card-foreground">{children}</div>
        {/* Phones: pinned just above the tab bar (4rem + safe-area inset); in flow, so the last field is never hidden. */}
        <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 lg:static lg:border-0 lg:bg-transparent lg:p-0">
          <Button type="submit" className="h-11 min-w-28" disabled={submitting}>
            {submitting && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />}
            {submitLabel}
          </Button>
          {extraActions}
        </div>
      </form>
      <ConfirmLeave {...guard} />
    </div>
  );
}
