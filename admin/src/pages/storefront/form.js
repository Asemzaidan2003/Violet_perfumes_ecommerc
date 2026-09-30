import { validLink, isHttps } from "@/lib/links";
import { GOVERNORATES } from "@/lib/governorates";

// Storefront-owned groups only; the settings page owns identity, theme, fees and whatsapp.
export function fromSettings(s) {
  const h = s.home ?? {}, c = s.contact ?? {}, so = s.social ?? {}, ft = s.footer ?? {}, t = s.texts ?? {}, se = s.seo ?? {};
  return {
    hero_title: h.hero_title ?? "", hero_subtitle: h.hero_subtitle ?? "",
    cta1_label: h.cta_primary?.label ?? "", cta1_link: h.cta_primary?.link ?? "", cta2_label: h.cta_secondary?.label ?? "", cta2_link: h.cta_secondary?.link ?? "",
    sections: (h.sections ?? []).map((x) => ({ key: x.key, visible: x.visible !== false, title: x.title ?? "" })),
    service_items: (h.service_items ?? []).map((x) => ({ title: x.title ?? "", text: x.text ?? "" })),
    phone: c.phone ?? "", email: c.email ?? "", address: c.address ?? "", map_url: c.map_url ?? "", hours: c.hours ?? "",
    instagram: so.instagram ?? "", tiktok: so.tiktok ?? "", facebook: so.facebook ?? "", snapchat: so.snapchat ?? "",
    about_text: ft.about_text ?? "", copyright: ft.copyright ?? "",
    oos_note: t.oos_note ?? "", checkout_note: t.checkout_note ?? "", order_thanks: t.order_thanks ?? "",
    governorates: s.delivery?.governorates ?? [...GOVERNORATES],
    seo_title: se.home_title ?? "", seo_desc: se.home_description ?? "",
  };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[\d\s-]{6,20}$/;

export function validate(f) {
  const e = {};
  if (f.cta1_link.trim() && !validLink(f.cta1_link.trim())) e.cta1_link = "رابط غير صالح: يبدأ بـ / أو https://";
  if (f.cta2_link.trim() && !validLink(f.cta2_link.trim())) e.cta2_link = "رابط غير صالح: يبدأ بـ / أو https://";
  if (f.phone.trim() && !PHONE.test(f.phone.trim())) e.phone = "رقم هاتف غير صالح";
  if (f.email.trim() && !EMAIL.test(f.email.trim())) e.email = "بريد إلكتروني غير صالح";
  if (f.map_url.trim() && !isHttps(f.map_url.trim())) e.map_url = "الرابط يجب أن يبدأ بـ https";
  for (const k of ["instagram", "tiktok", "facebook", "snapchat"]) if (f[k].trim() && !isHttps(f[k].trim())) e[k] = "الرابط يجب أن يبدأ بـ https";
  if (f.governorates.length === 0) e.governorates = "يجب تفعيل محافظة واحدة على الأقل";
  return e;
}

export function toPatch(f) {
  const t = (v) => String(v ?? "").trim();
  return {
    home: {
      hero_title: t(f.hero_title), hero_subtitle: t(f.hero_subtitle),
      cta_primary: { label: t(f.cta1_label), link: t(f.cta1_link) }, cta_secondary: { label: t(f.cta2_label), link: t(f.cta2_link) },
      sections: f.sections.map((s) => ({ key: s.key, visible: s.visible !== false, title: t(s.title) })),
      service_items: f.service_items.map((s) => ({ title: t(s.title), text: t(s.text) })).filter((s) => s.title || s.text),
    },
    contact: { phone: t(f.phone), email: t(f.email), address: t(f.address), map_url: t(f.map_url), hours: t(f.hours) },
    social: { instagram: t(f.instagram), tiktok: t(f.tiktok), facebook: t(f.facebook), snapchat: t(f.snapchat) },
    footer: { about_text: t(f.about_text), copyright: t(f.copyright) },
    texts: { oos_note: t(f.oos_note), checkout_note: t(f.checkout_note), order_thanks: t(f.order_thanks) },
    delivery: { governorates: GOVERNORATES.filter((g) => f.governorates.includes(g)) },
    seo: { home_title: t(f.seo_title), home_description: t(f.seo_desc) },
  };
}
