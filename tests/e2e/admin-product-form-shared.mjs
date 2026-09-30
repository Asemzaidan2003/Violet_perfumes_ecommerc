// Shared helpers for the product form e2e files.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import Brand from "../../backend/models/brand.model.js";
import Category from "../../backend/models/category.model.js";
import Oil from "../../backend/models/oil.model.js";
import Product from "../../backend/models/product.model.js";
import { invalidateCategories } from "../../backend/services/categories.service.js";
import { invalidateCatalog } from "../../backend/store/catalog.js";

export const NET_NOISE = /status of (400|404|409)|ERR_FAILED/;
export async function until(fn, msg, tries = 60) {
  for (let i = 0; i < tries; i++) { if (await fn()) return; await new Promise((r) => setTimeout(r, 50)); }
  assert.fail(msg);
}
export const ready = (page) => page.locator('[data-ready="true"]').waitFor();
export const apiProduct = (page, id) => page.evaluate(async (i) => (await (await fetch(`/api/products/${i}`)).json()).data, String(id));
export const apiByName = (page, name) => page.evaluate(async (n) => ((await (await fetch("/api/products")).json()).data ?? []).find((p) => p.p_name === n) ?? null, name);

// Seeds hostile-labelled lookups and returns a cleanup function; call INSIDE try.
export async function seedLookups(stamp) {
  const s = { stamp, prods: [] };
  s.cleanup = async () => {
    await Product.deleteMany({ $or: [{ _id: { $in: s.prods } }, { p_name: new RegExp(stamp) }] });
    await Brand.deleteMany({ name_en: new RegExp(stamp) });
    await Category.deleteMany({ key: { $in: [`Cat${stamp}`, `Hid${stamp}`] } });
    await Oil.deleteMany({ id: { $in: [`OIL-${stamp}`, `ZED-${stamp}`] } });
    invalidateCategories();
    invalidateCatalog();
  };
  try { return await seedInto(s); } catch (e) { await s.cleanup?.(); throw e; }
}

async function seedInto(s) {
  const { stamp } = s;
  s.brand = await Brand.create({ name_ar: `<img src=x onerror=window.__xss=3> ${stamp}`, name_en: `Brand ${stamp}` });
  s.brandOff = await Brand.create({ name_ar: `مصمم متوقف ${stamp}`, name_en: `Off ${stamp}`, active: false });
  s.cat = await Category.create({ key: `Cat${stamp}`, slug: `cat-${stamp}`, name_ar: `قسم "الأزهار" & ${stamp}` });
  s.catHidden = await Category.create({ key: `Hid${stamp}`, slug: `hid-${stamp}`, name_ar: `<b onmouseover=window.__xss=4>${stamp}`, visible: false });
  s.oilName = `<svg onload=window.__xss=1> زيت ${stamp}`;
  s.oil = await Oil.create({ id: `OIL-${stamp}`, oil_name: s.oilName, oil_cost: 1, oil_quantity: 500 });
  s.oil2 = await Oil.create({ id: `ZED-${stamp}`, oil_name: `زيت ثانٍ ${stamp}`, oil_cost: 2, oil_quantity: 100 });
  invalidateCategories();
  invalidateCatalog();
  s.product = async (over = {}) => {
    const p = await Product.create({ p_name: `منتج ${crypto.randomUUID().slice(0, 6)} ${stamp}`, p_image: ".", p_category: s.cat.key, oil_id: s.oil.id, oil_percentage: 20, alcohol_percentage: 80, size_list: [{ size: "30", price: 15.5 }], ...over });
    s.prods.push(p._id);
    return p;
  };
  return s;
}

