import {
  ShoppingCart, ClipboardList, Inbox, Package, Droplets, FlaskConical, ListChecks, Tag, Wine,
  LayoutDashboard, BarChart3, Store, FileText, Megaphone, Settings, Layers,
} from "lucide-react";

const L = "/admin/html/"; // legacy pages, replaced one by one in later plans

export const NAV_GROUPS = [
  { title: "المبيعات", items: [
    { key: "pos", label: "نقطة البيع", to: "/pos", icon: ShoppingCart },
    { key: "orders", label: "الطلبات", to: "/orders", icon: ClipboardList, badge: true },
    { key: "interests", label: "طلبات الاهتمام", to: "/interests", icon: Inbox },
  ] },
  { title: "الكتالوج", items: [
    { key: "products", label: "المنتجات", to: "/products", icon: Package },
    { key: "oils", label: "الزيوت", to: "/oils", icon: Droplets },
    { key: "bottles", label: "الزجاجات", to: "/bottles", icon: FlaskConical },
    { key: "alcohol", label: "الكحول", to: "/alcohol", icon: Wine },
    { key: "tagging", label: "تصنيف المنتجات", legacy: `${L}catalog.html`, icon: ListChecks },
    { key: "categories", label: "الأقسام", legacy: `${L}categories.html`, icon: Layers },
    { key: "brands", label: "المصممون", legacy: `${L}brands.html`, icon: Tag },
  ] },
  { title: "التحليلات", items: [
    { key: "dashboard", label: "لوحة المعلومات", to: "/dashboard", icon: LayoutDashboard },
    { key: "reports", label: "التقارير", to: "/reports", icon: BarChart3 },
  ] },
  { title: "المتجر", items: [
    { key: "storefront", label: "واجهة المتجر", legacy: `${L}storefront.html`, icon: Store },
    { key: "pages", label: "الصفحات", legacy: `${L}pages.html`, icon: FileText },
    { key: "promotions", label: "العروض والإعلانات", legacy: `${L}promotions.html`, icon: Megaphone },
    { key: "settings", label: "إعدادات المتجر", legacy: `${L}settings.html`, icon: Settings },
  ] },
];

const byKey = Object.fromEntries(NAV_GROUPS.flatMap((g) => g.items).map((i) => [i.key, i]));
export const MOBILE_TABS = ["pos", "orders", "products", "reports"].map((k) => byKey[k]);
