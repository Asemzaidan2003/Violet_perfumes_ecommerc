import { useState } from "react";
import { ApiError } from "@/lib/api";
import { useSettings } from "@/hooks/useSettings";
import { DEFAULT_THEME } from "@/lib/themeColors";
import { ErrorState, PageHeader } from "@/components/page";
import { FormShell } from "@/components/form/FormShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { IdentitySection } from "./IdentitySection";
import { ThemeSection } from "./ThemeSection";

const Section = ({ title, children }) => <section className="space-y-4"><h2 className="text-lg font-semibold">{title}</h2>{children}</section>;
const netMsg = (e) => (e instanceof ApiError ? e.message : "تعذّر الاتصال بالخادم");
const num = (v) => (typeof v === "number" && Number.isFinite(v) && v >= 0);

const fromSettings = (s) => ({
  store_name: s.store_name ?? "", tagline: s.tagline ?? "", logo_light: s.logo_light ?? "", logo_dark: s.logo_dark ?? "", favicon: s.favicon ?? "", share_image: s.share_image ?? "",
  whatsapp: s.whatsapp ?? "", instagram: s.instagram ?? "", delivery_fee: s.delivery_fee ?? 0, free_delivery_over: s.free_delivery_over ?? 0,
  theme: { ...DEFAULT_THEME, ...Object.fromEntries(Object.entries(s.theme ?? {}).filter(([k]) => k in DEFAULT_THEME)) },
  overrides: { ...(s.theme?.overrides ?? {}) },
});

function SettingsForm({ settings, save }) {
  const [f, setF] = useState(() => fromSettings(settings));
  const [base, setBase] = useState(f);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState({ kind: "", text: "" });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const dirty = JSON.stringify(f) !== JSON.stringify(base);

  // Only overrides that changed are sent ("" clears one); the server ignores the rest.
  const changedOverrides = () => Object.fromEntries([...new Set([...Object.keys(f.overrides), ...Object.keys(base.overrides)])]
    .filter((k) => (f.overrides[k] || "") !== (base.overrides[k] || "")).map((k) => [k, f.overrides[k] || ""]));

  async function run(patch, onOk) {
    setSaving(true);
    setBanner({ kind: "", text: "" });
    try {
      const saved = await save(patch);
      if (saved === null) return;
      onOk(fromSettings(saved));
      setBanner({ kind: "ok", text: "تم حفظ الإعدادات" });
    } catch (e) {
      setBanner({ kind: "err", text: netMsg(e) });
    } finally { setSaving(false); }
  }

  async function submit() {
    const e = {};
    if (!f.store_name.trim()) e.store_name = "اسم المتجر مطلوب";
    if (!num(f.delivery_fee)) e.delivery_fee = "أدخل رسوم توصيل صحيحة (0 أو أكثر)";
    if (!num(f.free_delivery_over)) e.free_delivery_over = "أدخل قيمة صحيحة (0 أو أكثر)";
    setErrors(e);
    if (Object.keys(e).length) { setTimeout(() => document.querySelector('form [aria-invalid="true"]')?.focus(), 0); return; }
    await run({
      store_name: f.store_name.trim(), tagline: f.tagline.trim(), logo_light: f.logo_light, logo_dark: f.logo_dark, favicon: f.favicon, share_image: f.share_image,
      whatsapp: f.whatsapp.trim(), instagram: f.instagram.trim(), delivery_fee: f.delivery_fee, free_delivery_over: f.free_delivery_over,
      theme: { ...f.theme, overrides: changedOverrides() },
    }, (s) => { setF(s); setBase(s); });
  }

  // Restores the four colours and saves theme-only right away; overrides are left as they are.
  async function resetTheme() {
    await run({ theme: { ...DEFAULT_THEME } }, (s) => {
      setF((cur) => ({ ...cur, theme: s.theme }));
      setBase((cur) => ({ ...cur, theme: s.theme }));
    });
  }

  return (
    <div className="space-y-3">
      <FormShell title="إعدادات المتجر" dirty={dirty} submitting={saving} submitId="saveBtn" submitLabel="حفظ الإعدادات" onSubmit={submit}
        extraActions={<>
          {banner.kind === "ok" && <p role="status" id="success" className="text-sm font-medium text-st-completed-fg">{banner.text}</p>}
          {banner.kind === "err" && <p role="alert" id="error" className="text-sm font-medium text-destructive">{banner.text}</p>}
        </>}>
        <Section title="الهوية"><IdentitySection f={f} set={set} errors={errors} /></Section>
        <Section title="ألوان المتجر">
          <ThemeSection theme={f.theme} setTheme={(t) => set("theme", t)} overrides={f.overrides} setOverrides={(o) => set("overrides", o)} onReset={resetTheme} resetting={saving} />
        </Section>
      </FormShell>
    </div>
  );
}

export default function SettingsPage() {
  const { settings, error, refetch, save } = useSettings();
  return (
    <div className="p-4 lg:p-6">
      {settings ? <SettingsForm settings={settings} save={save} /> : (
        <div className="space-y-4">
          <PageHeader title="إعدادات المتجر" />
          {error ? <ErrorState title="تعذر تحميل الإعدادات" hint="أعد المحاولة قبل الحفظ" onRetry={() => refetch()} />
            : <div className="space-y-3" role="status" aria-label="جارٍ التحميل">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>}
          <Button id="saveBtn" type="button" className="h-11" disabled>حفظ الإعدادات</Button>
        </div>
      )}
    </div>
  );
}
