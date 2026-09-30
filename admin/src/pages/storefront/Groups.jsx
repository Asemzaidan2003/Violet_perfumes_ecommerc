import { GOVERNORATES } from "@/lib/governorates";
import { DEFAULTS } from "./defaults";
import { Group, Txt } from "./parts";
import { SectionsTable } from "./SectionsTable";
import { ServiceItems } from "./ServiceItems";

export function HomeGroup({ f, set, errors }) {
  return (
    <Group title="الصفحة الرئيسية" open>
      <Txt f={f} set={set} k="hero_title" id="hero_title" label="عنوان الغلاف" hint="استخدم {store_name} لاسم المتجر" max={80} dflt={DEFAULTS.hero_title} />
      <Txt f={f} set={set} k="hero_subtitle" id="hero_subtitle" label="نص الغلاف الفرعي" area max={200} dflt={DEFAULTS.hero_subtitle} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Txt f={f} set={set} k="cta1_label" id="cta_primary_label" label="زر أول — النص" max={30} placeholder={DEFAULTS.cta_primary.label} />
        <Txt f={f} set={set} k="cta1_link" id="cta_primary_link" label="زر أول — الرابط" ltr placeholder={DEFAULTS.cta_primary.link} error={errors.cta1_link} />
        <Txt f={f} set={set} k="cta2_label" id="cta_secondary_label" label="زر ثانٍ — النص" max={30} placeholder={DEFAULTS.cta_secondary.label} />
        <Txt f={f} set={set} k="cta2_link" id="cta_secondary_link" label="زر ثانٍ — الرابط" ltr placeholder={DEFAULTS.cta_secondary.link} error={errors.cta2_link} />
      </div>
      <SectionsTable sections={f.sections} onChange={(v) => set("sections", v)} />
      <ServiceItems items={f.service_items} onChange={(v) => set("service_items", v)} />
    </Group>
  );
}

export function ContactGroup({ f, set, errors }) {
  return (
    <Group title="التذييل والتواصل">
      <div className="grid gap-4 sm:grid-cols-2">
        <Txt f={f} set={set} k="phone" id="contact_phone" label="الهاتف" ltr max={20} error={errors.phone} />
        <Txt f={f} set={set} k="email" id="contact_email" label="البريد الإلكتروني" ltr type="email" error={errors.email} />
      </div>
      <Txt f={f} set={set} k="address" id="contact_address" label="العنوان" max={200} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Txt f={f} set={set} k="map_url" id="contact_map_url" label="رابط الخريطة (https فقط)" ltr placeholder="https://maps.google.com/..." error={errors.map_url} />
        <Txt f={f} set={set} k="hours" id="contact_hours" label="ساعات العمل" max={120} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Txt f={f} set={set} k="instagram" id="social_instagram" label="انستغرام" ltr placeholder="https://instagram.com/..." error={errors.instagram} />
        <Txt f={f} set={set} k="tiktok" id="social_tiktok" label="تيك توك" ltr error={errors.tiktok} />
        <Txt f={f} set={set} k="facebook" id="social_facebook" label="فيسبوك" ltr error={errors.facebook} />
        <Txt f={f} set={set} k="snapchat" id="social_snapchat" label="سناب شات" ltr error={errors.snapchat} />
      </div>
      <Txt f={f} set={set} k="about_text" id="footer_about" label="نبذة التذييل" area max={300} counter dflt={DEFAULTS.about_text} />
      <Txt f={f} set={set} k="copyright" id="footer_copyright" label="نص حقوق النشر" hint="استخدم {store_name} و{year}" max={120} dflt={DEFAULTS.copyright} />
    </Group>
  );
}

export function TextsGroup({ f, set }) {
  return (
    <Group title="نصوص المتجر">
      <Txt f={f} set={set} k="oos_note" id="texts_oos" label="نص نفاد المخزون" max={200} dflt={DEFAULTS.oos_note} />
      <Txt f={f} set={set} k="checkout_note" id="texts_checkout" label="نص أعلى صفحة إتمام الطلب (اختياري)" max={200} />
      <Txt f={f} set={set} k="order_thanks" id="texts_thanks" label="نص صفحة الشكر بعد الطلب" max={200} dflt={DEFAULTS.order_thanks} />
    </Group>
  );
}

export function DeliveryGroup({ f, set, errors }) {
  const toggle = (g, on) => set("governorates", on ? [...f.governorates, g] : f.governorates.filter((x) => x !== g));
  return (
    <Group title="التوصيل">
      <p className="text-sm text-muted-foreground">المحافظات المتاحة عند إتمام الطلب — يجب تفعيل محافظة واحدة على الأقل.</p>
      <div id="governoratesBody" className="flex flex-wrap gap-2">
        {GOVERNORATES.map((g) => (
          <label key={g} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-medium has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground">
            <input type="checkbox" value={g} data-gov={g} className="size-4" checked={f.governorates.includes(g)} onChange={(e) => toggle(g, e.target.checked)} />
            {g}
          </label>
        ))}
      </div>
      {errors.governorates && <p role="alert" className="text-sm font-medium text-destructive">{errors.governorates}</p>}
    </Group>
  );
}

export function SeoGroup({ f, set }) {
  return (
    <Group title="محركات البحث">
      <Txt f={f} set={set} k="seo_title" id="seo_title" label="عنوان الصفحة الرئيسية (SEO)" max={70} counter hint="إذا تُرك فارغًا يستخدم المتجر عنوانًا افتراضيًا" />
      <Txt f={f} set={set} k="seo_desc" id="seo_desc" label="وصف الصفحة الرئيسية (SEO)" area max={160} counter />
    </Group>
  );
}
