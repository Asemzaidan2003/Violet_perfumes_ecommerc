import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Hourglass } from "lucide-react";
import { presetRange } from "@/lib/dates";
import { EmptyState, PageHeader } from "@/components/page";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReportFilters } from "./ReportFilters";
import SalesTab from "./SalesTab";
import ProductsTab from "./ProductsTab";
import CustomersTab from "./CustomersTab";

const TABS = [
  { value: "sales", label: "المبيعات" },
  { value: "products", label: "المنتجات" },
  { value: "inventory", label: "المخزون" },
  { value: "customers", label: "العملاء" },
];

export default function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const asked = params.get("tab");
  const tab = TABS.some((t) => t.value === asked) ? asked : "sales";
  const [filters, setFilters] = useState(() => ({ ...presetRange("30d"), status: "completed" }));
  const [preset, setPreset] = useState("30d");

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader eyebrow="تحليلات" title="التقارير" />
      <Tabs dir="rtl" value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <TabsList className="self-start">
          {TABS.map((t) => <TabsTrigger key={t.value} value={t.value} data-tab={t.value}>{t.label}</TabsTrigger>)}
        </TabsList>
        {tab !== "inventory" && (
          <ReportFilters applied={filters} preset={preset}
            onApply={(f) => { setFilters(f); setPreset(null); }}
            onPreset={(key, r) => { setFilters((f) => ({ ...f, ...r })); setPreset(key); }} />
        )}
        <TabsContent value="sales"><SalesTab filters={filters} /></TabsContent>
        <TabsContent value="products"><ProductsTab filters={filters} /></TabsContent>
        <TabsContent value="customers"><CustomersTab filters={filters} /></TabsContent>
        <TabsContent value="inventory"><EmptyState icon={Hourglass} title="قريبًا" /></TabsContent>
      </Tabs>
    </div>
  );
}
