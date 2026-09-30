import { useState } from "react";
import { ApiError } from "@/lib/api";
import { useSettings } from "@/hooks/useSettings";
import { ErrorState, PageHeader } from "@/components/page";
import { FormShell } from "@/components/form/FormShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fromSettings, toPatch, validate } from "./form";
import { ContactGroup, DeliveryGroup, HomeGroup, SeoGroup, TextsGroup } from "./Groups";

const netMsg = (e) => (e instanceof ApiError ? e.message : "تعذّر الاتصال بالخادم");

function StorefrontForm({ settings, save }) {
  const [f, setF] = useState(() => fromSettings(settings));
  const [base, setBase] = useState(f);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState({ kind: "", text: "" });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const dirty = JSON.stringify(f) !== JSON.stringify(base);

  async function submit() {
    const e = validate(f);
    setErrors(e);
    setBanner({ kind: "", text: "" });
    if (Object.keys(e).length) { setTimeout(() => document.querySelector('form [aria-invalid="true"], form [role="alert"]')?.scrollIntoView?.({ block: "center" }), 0); return; }
    setSaving(true);
    try {
      const saved = await save(toPatch(f)); // all groups are sent, even collapsed ones
      if (saved === null) return;
      const next = fromSettings(saved);
      setF(next);
      setBase(next);
      setBanner({ kind: "ok", text: "تم الحفظ" });
    } catch (err) {
      setBanner({ kind: "err", text: `${netMsg(err)} — لم يُحفظ شيء` });
    } finally { setSaving(false); }
  }

  return (
    <FormShell title="واجهة المتجر" dirty={dirty} submitting={saving} submitId="sfSave" submitLabel="حفظ" onSubmit={submit}
      extraActions={<>
        {banner.kind === "ok" && <p role="status" id="sfSuccess" className="text-sm font-medium text-st-completed-fg">{banner.text}</p>}
        {banner.kind === "err" && <p role="alert" id="sfError" className="text-sm font-medium text-destructive">{banner.text}</p>}
      </>}>
      <p className="text-sm text-muted-foreground">حفظ واحد لكل المجموعات، حتى المطوية. أي خطأ يمنع حفظ كل شيء.</p>
      <HomeGroup f={f} set={set} errors={errors} />
      <ContactGroup f={f} set={set} errors={errors} />
      <TextsGroup f={f} set={set} />
      <DeliveryGroup f={f} set={set} errors={errors} />
      <SeoGroup f={f} set={set} />
    </FormShell>
  );
}

export default function StorefrontPage() {
  const { settings, error, refetch, save } = useSettings();
  return (
    <div className="p-4 lg:p-6">
      {settings ? <StorefrontForm settings={settings} save={save} /> : (
        <div className="space-y-4">
          <PageHeader title="واجهة المتجر" />
          {error ? <ErrorState title="تعذر تحميل الإعدادات" hint="أعد المحاولة قبل الحفظ" onRetry={() => refetch()} />
            : <div className="space-y-3" role="status" aria-label="جارٍ التحميل">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>}
          <Button id="sfSave" type="button" className="h-11" disabled>حفظ</Button>
        </div>
      )}
    </div>
  );
}
