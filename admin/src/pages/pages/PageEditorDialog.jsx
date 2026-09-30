import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bold, Heading2, Heading3, Link2, List } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { htmlToReact } from "@/lib/htmlToReact";
import { applyToolbar } from "@/lib/markupToolbar";
import { RESERVED_PAGE_SLUGS, SLUG_RE, slugify } from "@/lib/slug";
import { NativeSelect } from "@/components/native-select";
import { CrudDialog } from "@/components/crud/CrudDialog";
import { Field, SwitchField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const GROUPS = [["info", "معلومات"], ["help", "مساعدة"], ["none", "بدون"]];
const TOOLS = [["h2", "عنوان رئيسي (H2)", Heading2, "H2"], ["h", "عنوان فرعي (H3)", Heading3, "H3"], ["b", "غامق", Bold, "B"], ["list", "قائمة", List, "قائمة"], ["link", "رابط", Link2, "رابط"]];
const netMsg = (e) => (e instanceof ApiError ? e.message : "تعذّر الاتصال بالخادم");

export function PageEditorDialog({ page, onClose }) {
  const qc = useQueryClient();
  const edit = !!page?._id;
  const [f, setF] = useState(() => (edit
    ? { title: page.title, slug: page.slug, body: page.body ?? "", meta: page.meta_description ?? "", group: page.footer_group ?? "info", published: page.published !== false }
    : { title: "", slug: "", body: "", meta: "", group: "info", published: true }));
  const [touched, setTouched] = useState(edit);
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState("");
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const ta = useRef(null);
  const pendingSel = useRef(null);

  // Live preview: debounced, aborts the previous request and ignores any response that is not the latest.
  const [html, setHtml] = useState("");
  const [previewFailed, setPreviewFailed] = useState(false);
  const latest = useRef(0);
  const abort = useRef(null);
  useEffect(() => {
    const timer = setTimeout(async () => {
      const id = ++latest.current;
      abort.current?.abort();
      const ac = new AbortController();
      abort.current = ac;
      try {
        const r = await api("/pages/preview", { method: "POST", body: { body: f.body }, signal: ac.signal });
        if (id === latest.current) { setHtml(r?.data?.html ?? ""); setPreviewFailed(false); }
      } catch (e) {
        if (e?.name !== "AbortError" && id === latest.current) setPreviewFailed(true);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [f.body]);
  useEffect(() => () => abort.current?.abort(), []);
  useLayoutEffect(() => {
    if (!pendingSel.current || !ta.current) return;
    ta.current.focus();
    ta.current.setSelectionRange(pendingSel.current.selStart, pendingSel.current.selEnd);
    pendingSel.current = null;
  }, [f.body]);

  const tool = (action) => {
    const el = ta.current;
    const r = applyToolbar(f.body, el.selectionStart, el.selectionEnd, action, f.slug);
    pendingSel.current = r;
    set("body", r.value);
  };

  const save = useMutation({
    mutationFn: (body) => api(edit ? `/pages/${page._id}` : "/pages", { method: edit ? "PUT" : "POST", body }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pages"] }); toast.success(edit ? "تم تحديث الصفحة" : "تمت إضافة الصفحة"); onClose(); },
    onError: (e) => setBanner(netMsg(e)),
  });

  function submit() {
    const slug = f.slug.trim();
    const e = {};
    if (!f.title.trim()) e.title = "العنوان مطلوب"; else if (f.title.trim().length > 80) e.title = "الحد الأقصى 80 حرفًا";
    if (!SLUG_RE.test(slug)) e.slug = "الرابط: أحرف إنجليزية صغيرة وأرقام وشرطات (2 إلى 40)";
    else if (RESERVED_PAGE_SLUGS.includes(slug)) e.slug = "هذا الرابط محجوز";
    if (f.body.length > 20000) e.body = "المحتوى طويل جدًا (20000 حرف كحد أقصى)";
    if (f.meta.trim().length > 160) e.meta = "الحد الأقصى 160 حرفًا";
    setErrors(e);
    setBanner("");
    if (Object.keys(e).length) return;
    return save.mutateAsync({ title: f.title.trim(), slug, body: f.body, meta_description: f.meta.trim(), footer_group: f.group, published: f.published }).catch(() => {});
  }

  return (
    <CrudDialog open wide title={edit ? "تعديل صفحة" : "إضافة صفحة"} onOpenChange={(o) => { if (!o) onClose(); }} onSubmit={submit} submitting={save.isPending} error={banner}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="العنوان" htmlFor="pf-title" required error={errors.title}>
          <Input id="pf-title" className="h-11" maxLength={80} value={f.title} aria-invalid={errors.title ? true : undefined}
            onChange={(e) => { set("title", e.target.value); if (!touched) set("slug", slugify(e.target.value)); }} />
        </Field>
        <Field label="الرابط (slug)" htmlFor="pf-slug" required error={errors.slug}>
          <Input id="pf-slug" dir="ltr" className="h-11 text-start" maxLength={40} value={f.slug} aria-invalid={errors.slug ? true : undefined}
            onChange={(e) => { setTouched(true); set("slug", e.target.value); }} />
        </Field>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="pf-body">المحتوى</Label>
          <div role="toolbar" aria-label="أدوات التنسيق" className="flex flex-wrap gap-2">
            {TOOLS.map(([a, label, Icon, text]) => (
              <Button key={a} type="button" variant="outline" className="h-11 min-w-11 gap-1.5 px-3" aria-label={label} onClick={() => tool(a)}><Icon className="size-4" aria-hidden />{text}</Button>
            ))}
          </div>
          <Textarea id="pf-body" ref={ta} rows={10} maxLength={20000} value={f.body} aria-invalid={errors.body ? true : undefined} onChange={(e) => set("body", e.target.value)} />
          <p className="text-sm text-muted-foreground"><bdi dir="ltr">{f.body.length}/20000</bdi> — # عنوان رئيسي، ## عنوان فرعي، - قائمة، **غامق**، [نص](/page/رابط)</p>
          {errors.body && <p role="alert" className="text-sm font-medium text-destructive">{errors.body}</p>}
        </div>
        <div className="space-y-2">
          <span className="text-sm font-medium">معاينة</span>
          <div id="pf-preview" className="min-h-40 rounded-lg border bg-muted/30 p-3 text-sm">{htmlToReact(html)}</div>
          {previewFailed && <p role="status" className="text-sm text-muted-foreground">تعذّرت المعاينة</p>}
        </div>
      </div>
      <Field label="وصف الصفحة (meta description)" htmlFor="pf-meta" hint={`${f.meta.length}/160`} error={errors.meta}>
        <Input id="pf-meta" className="h-11" maxLength={160} value={f.meta} onChange={(e) => set("meta", e.target.value)} />
      </Field>
      <Field label="قسم التذييل" htmlFor="pf-group">
        <NativeSelect id="pf-group" value={f.group} onChange={(e) => set("group", e.target.value)}>
          {GROUPS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </NativeSelect>
      </Field>
      <SwitchField id="pf-published" label="منشورة" checked={f.published} onChange={(c) => set("published", c)} />
    </CrudDialog>
  );
}
