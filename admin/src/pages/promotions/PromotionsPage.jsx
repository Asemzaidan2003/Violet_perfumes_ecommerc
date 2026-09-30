import { useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/page";
import { cn } from "@/lib/utils";
import { CouponsTab } from "./CouponsTab";
import { PlacementsTab } from "./PlacementsTab";

const TABS = [["placements", "الإعلانات"], ["coupons", "أكواد الخصم"]];

// Hand-rolled tablist (RTL: ArrowLeft = next). The selected tab persists in ?tab=.
export default function PromotionsPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([k]) => k === params.get("tab")) ? params.get("tab") : "placements";
  const refs = useRef({});
  const select = (k) => { setParams({ tab: k }, { replace: true }); refs.current[k]?.focus(); };
  function onKeyDown(e) {
    const i = TABS.findIndex(([k]) => k === tab);
    const to = { ArrowLeft: (i + 1) % TABS.length, ArrowRight: (i - 1 + TABS.length) % TABS.length, Home: 0, End: TABS.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    select(TABS[to][0]);
  }
  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader eyebrow="المتجر" title="العروض والإعلانات" />
      <div role="tablist" aria-label="العروض والإعلانات" className="flex gap-2 border-b">
        {TABS.map(([k, label]) => (
          <button key={k} ref={(el) => { refs.current[k] = el; }} id={`tab-btn-${k}`} data-tab={k} type="button" role="tab" aria-selected={tab === k} aria-controls={`tab-${k}`}
            tabIndex={tab === k ? 0 : -1} onClick={() => select(k)} onKeyDown={onKeyDown}
            className={cn("min-h-11 border-b-2 px-4 text-sm font-semibold focus-visible:outline-2", tab === k ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>{label}</button>
        ))}
      </div>
      <div role="tabpanel" id={`tab-${tab}`} aria-labelledby={`tab-btn-${tab}`}>{tab === "placements" ? <PlacementsTab /> : <CouponsTab />}</div>
    </div>
  );
}
