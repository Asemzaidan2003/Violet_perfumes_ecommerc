import { describe, expect, test } from "vitest";
import { GOVERNORATES } from "@/lib/governorates";
import { fromSettings, toPatch, validate } from "./form.js";

const settings = {
  home: { hero_title: "عنوان", hero_subtitle: "", cta_primary: { label: "أ", link: "/c/men" }, cta_secondary: { label: "", link: "" }, sections: [{ key: "aisles", visible: true, title: "" }, { key: "offers", visible: false, title: "عروضنا" }], service_items: [{ title: "توصيل", text: "" }] },
  contact: { phone: "0791234567" }, social: {}, footer: {}, texts: {}, delivery: { governorates: ["عمّان", "إربد"] }, seo: {},
};

describe("storefront form", () => {
  test("fromSettings then toPatch round-trips the storefront groups", () => {
    const p = toPatch(fromSettings(settings));
    expect(p.home.sections).toEqual(settings.home.sections);
    expect(p.home.hero_title).toBe("عنوان");
    expect(p.delivery.governorates).toEqual(["عمّان", "إربد"]);
    expect(Object.keys(p).sort()).toEqual(["contact", "delivery", "footer", "home", "seo", "social", "texts"]);
  });
  test("blank service rows are dropped, strings trimmed", () => {
    const f = fromSettings(settings);
    f.service_items = [{ title: " أ ", text: "" }, { title: " ", text: " " }, { title: "", text: "ب" }];
    expect(toPatch(f).home.service_items).toEqual([{ title: "أ", text: "" }, { title: "", text: "ب" }]);
  });
  test("governorates default to all when missing and keep the server order", () => {
    expect(fromSettings({}).governorates).toEqual(GOVERNORATES);
    const f = fromSettings(settings);
    f.governorates = ["إربد", "عمّان"];
    expect(toPatch(f).delivery.governorates).toEqual(["عمّان", "إربد"]);
  });
  test("validate", () => {
    const ok = fromSettings(settings);
    expect(validate(ok)).toEqual({});
    expect(validate({ ...ok, cta1_link: "javascript:alert(1)" }).cta1_link).toBeTruthy();
    expect(validate({ ...ok, instagram: "http://x.com" }).instagram).toBeTruthy();
    expect(validate({ ...ok, map_url: "http://maps" }).map_url).toBeTruthy();
    expect(validate({ ...ok, phone: "abc" }).phone).toBeTruthy();
    expect(validate({ ...ok, email: "a@b" }).email).toBeTruthy();
    expect(validate({ ...ok, governorates: [] }).governorates).toBe("يجب تفعيل محافظة واحدة على الأقل");
  });
});
