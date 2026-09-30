import { Trash2 } from "lucide-react";
import { ImageUpload } from "@/components/form/ImageUpload";
import { Field, NumberField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isImageUrl } from "@/lib/links";

const IMAGES = [["logo_light", "الشعار (خلفية داكنة)"], ["logo_dark", "الشعار (خلفية فاتحة)"], ["favicon", "أيقونة المتصفح (favicon)"], ["share_image", "صورة المشاركة (og:image)"]];

// f/set: the settings form state and its setter (see SettingsPage). Uploads only persist when the form is saved.
export function IdentitySection({ f, set, errors }) {
  return (
    <>
      <Field label="اسم المتجر" htmlFor="store_name" required error={errors.store_name}>
        <Input id="store_name" className="h-11" maxLength={40} value={f.store_name} aria-invalid={errors.store_name ? true : undefined} onChange={(e) => set("store_name", e.target.value)} />
      </Field>
      <Field label="الشعار الفرعي" htmlFor="tagline">
        <Input id="tagline" className="h-11" maxLength={80} value={f.tagline} onChange={(e) => set("tagline", e.target.value)} />
      </Field>
      <div className="grid gap-4 md:grid-cols-2">
        {IMAGES.map(([key, label]) => (
          <div key={key} className="space-y-2 rounded-lg border p-3">
            <p className="text-sm font-medium">{label}</p>
            <input id={key} type="hidden" value={f[key]} readOnly />
            <ImageUpload id={`${key}_file`} value={isImageUrl(f[key]) ? f[key] : ""} kind="banner" onChange={(url) => set(key, url)} />
            {f[key] && <Button id={`${key}_remove`} type="button" variant="outline" className="h-11 gap-2" onClick={() => set(key, "")}><Trash2 className="size-4" aria-hidden />إزالة</Button>}
          </div>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">الصور المرفوعة والمزالة لا تُطبَّق على المتجر إلا بعد الضغط على «حفظ الإعدادات».</p>
      <Field label="رقم واتساب (أرقام فقط، مثال: 962791234567)" htmlFor="whatsapp" hint="من 8 إلى 15 رقمًا بدون + أو مسافات">
        <Input id="whatsapp" dir="ltr" className="h-11 text-start" placeholder="962791234567" value={f.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} />
      </Field>
      <Field label="رابط انستغرام" htmlFor="instagram" hint="https:// فقط">
        <Input id="instagram" dir="ltr" className="h-11 text-start" placeholder="https://instagram.com/nsamat" value={f.instagram} onChange={(e) => set("instagram", e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="رسوم التوصيل (دينار)" htmlFor="delivery_fee" required error={errors.delivery_fee}>
          <NumberField id="delivery_fee" value={f.delivery_fee} invalid={errors.delivery_fee ? true : undefined} onChange={(n) => set("delivery_fee", n)} />
        </Field>
        <Field label="توصيل مجاني فوق (دينار، 0 = معطّل)" htmlFor="free_delivery_over" required error={errors.free_delivery_over}>
          <NumberField id="free_delivery_over" value={f.free_delivery_over} invalid={errors.free_delivery_over ? true : undefined} onChange={(n) => set("free_delivery_over", n)} />
        </Field>
      </div>
    </>
  );
}
