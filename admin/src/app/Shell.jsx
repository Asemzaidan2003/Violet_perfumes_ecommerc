import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { LogOut, Menu, Moon, Sun, Store } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/app/auth";
import { useTheme } from "@/app/theme";
import { MOBILE_TABS, NAV_GROUPS } from "@/app/nav";

const ORDERS_URL = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.key === "orders").legacy;
const TITLE = "نسمات — لوحة الإدارة";

function usePendingCount() {
  const q = useQuery({
    queryKey: ["pending-count"],
    queryFn: async () => (await api("/orders/pending-count")).data?.count ?? 0,
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
    retry: false,
  });
  return q.data ?? 0;
}

function Badge({ n }) {
  if (!n) return null;
  return <span className="ms-auto grid min-w-6 place-items-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground" aria-label={`${n} بانتظار التأكيد`}>{n}</span>;
}

function NavItem({ item, pending, className, onNavigate, children }) {
  const inner = children ?? (<><item.icon className="size-5 shrink-0" aria-hidden /><span>{item.label}</span>{item.badge && <Badge n={pending} />}</>);
  if (item.legacy) return <a href={item.legacy} className={className({ isActive: false })}>{inner}</a>;
  return <NavLink to={item.to} onClick={onNavigate} className={className}>{inner}</NavLink>;
}

const sideClass = ({ isActive }) => cn(
  "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-2",
  isActive ? "bg-accent text-accent-foreground" : "text-foreground/80",
);

function NavList({ pending, onNavigate }) {
  return NAV_GROUPS.map((g) => (
    <div key={g.title} className="space-y-2">
      <p className="px-3 text-xs font-semibold text-muted-foreground">{g.title}</p>
      {g.items.map((item) => <NavItem key={item.key} item={item} pending={pending} className={sideClass} onNavigate={onNavigate} />)}
    </div>
  ));
}

function UserActions() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="icon" className="size-11" onClick={toggle} aria-label={theme === "dark" ? "الوضع الفاتح" : "الوضع الداكن"}>
        {theme === "dark" ? <Sun aria-hidden /> : <Moon aria-hidden />}
      </Button>
      <Button variant="ghost" className="h-11 gap-2" onClick={() => logout().catch(() => {})} aria-label={`تسجيل الخروج (${user?.username ?? ""})`}>
        <LogOut className="size-5" aria-hidden /><span className="hidden sm:inline">خروج</span>
      </Button>
    </div>
  );
}

export default function Shell() {
  const pending = usePendingCount();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const pageTitle = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.to === location.pathname)?.label ?? "نسمات";

  useEffect(() => { document.title = pending > 0 ? `(${pending}) ${TITLE}` : TITLE; }, [pending]);

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-4 overflow-y-auto border-e bg-card p-3 lg:flex">
        <div className="flex items-center gap-2 px-3 py-2 text-lg font-bold text-primary"><Store aria-hidden /> نسمات</div>
        <nav aria-label="القائمة الرئيسية" className="flex flex-1 flex-col gap-4"><NavList pending={pending} /></nav>
        <div className="border-t pt-3"><UserActions /></div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-card/95 px-3 backdrop-blur lg:hidden">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-base font-bold text-primary">{pageTitle}</span>
            {pending > 0 && (
              <a href={ORDERS_URL} className="inline-flex min-h-11 items-center rounded-full bg-primary px-3 text-xs font-bold text-primary-foreground">الطلبات ({pending})</a>
            )}
          </div>
          <UserActions />
        </header>
        <main className="flex-1 pb-20 lg:pb-0"><Outlet key={location.pathname} /></main>
      </div>

      <nav aria-label="التنقل السريع" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-card pb-[env(safe-area-inset-bottom)] lg:hidden">
        {MOBILE_TABS.map((item) => (
          <NavItem key={item.key} item={item} pending={pending}
            className={({ isActive }) => cn("relative flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium", isActive ? "text-primary" : "text-muted-foreground")}>
            <span className="relative"><item.icon className="size-6" aria-hidden />{item.badge && pending > 0 && <span className="absolute -top-1 -end-2 size-2.5 rounded-full bg-destructive" aria-label={`${pending} بانتظار التأكيد`} />}</span>
            <span>{item.label}</span>
          </NavItem>
        ))}
        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger asChild>
            <button type="button" className="flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium text-muted-foreground"><Menu className="size-6" aria-hidden /><span>المزيد</span></button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl">
            <SheetHeader><SheetTitle>كل الصفحات</SheetTitle></SheetHeader>
            <div className="space-y-4 p-4 pb-8"><NavList pending={pending} onNavigate={() => setMoreOpen(false)} /></div>
          </SheetContent>
        </Sheet>
      </nav>
    </div>
  );
}
