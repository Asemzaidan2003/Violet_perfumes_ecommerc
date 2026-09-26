import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize, tokens, searchProducts } from "../storefront/js/shared/search.js";

const p = (id, name, extra = {}) => ({ id, name, keywords: "", families: [], notes: {}, rank: null, ...extra });
const ids = (list) => list.map((x) => x.id);

const PRODUCTS = [
  p("chanel", "شانيل بلو", { keywords: "Bleu de Chanel", families: ["woody"], rank: 3 }),
  p("ysl", "ايف سان لوران ليبر", { families: ["floral"] }),
  p("sauvage", "ديور سوفاج", { keywords: "Dior Sauvage", families: ["fresh"], rank: 1 }),
  p("oud", "عود ملكي", { families: ["oud"], notes: { base: ["عنبر"] } }),
  p("amber-oud", "مسك العنبر", { keywords: "عود", families: ["amber"] }),
  p("n5", "رقم ٥", {}),
];

test("normalize strips diacritics and tatweel and unifies letters and digits", () => {
  assert.equal(normalize("أَحْمَد"), "احمد");
  assert.equal(normalize("ـعـود"), "عود");
  assert.equal(normalize("إيف آدم ٱ"), "ايف ادم ا");
  assert.equal(normalize("وردة ليلى مؤمن شاطئ"), "ورده ليلي مومن شاطي");
  assert.equal(normalize("٣٠ ۵۰ SAUVAGE"), "30 50 sauvage");
});

test("tokens drop a leading ال / وال / بال / لل on words longer than 3 letters", () => {
  assert.deepEqual(tokens("الشانيل والعود بالمسك للرجال"), ["شانيل", "عود", "مسك", "رجال"]);
  assert.deepEqual(tokens("الف"), ["الف"], "3-letter words keep their prefix");
  assert.deepEqual(tokens("  Dior, Sauvage! "), ["dior", "sauvage"]);
});

test("searchProducts: Arabic spelling variants match", () => {
  assert.deepEqual(ids(searchProducts(PRODUCTS, "الشانيل")), ["chanel"]);
  assert.deepEqual(ids(searchProducts(PRODUCTS, "إيف")), ["ysl"]);
  assert.deepEqual(ids(searchProducts(PRODUCTS, "رقم 5")), ["n5"], "Arabic-Indic digits in the name");
  assert.deepEqual(ids(searchProducts(PRODUCTS, "رقم ٥")), ["n5"]);
});

test("searchProducts: English keywords, family labels and notes", () => {
  assert.deepEqual(ids(searchProducts(PRODUCTS, "sauvage")), ["sauvage"]);
  assert.deepEqual(ids(searchProducts(PRODUCTS, "SAUV")), ["sauvage"], "prefix, case-insensitive");
  assert.deepEqual(ids(searchProducts(PRODUCTS, "زهري")), ["ysl"], "family label from vocab");
  assert.deepEqual(ids(searchProducts(PRODUCTS, "ديور sauvage")), ["sauvage"], "every token must match somewhere");
});

test("searchProducts ranks name-prefix > name > keywords > families/notes, then best-seller rank", () => {
  // "عود": name prefix (oud) > keyword (amber-oud). "عنبر": name (amber-oud) > notes (oud).
  assert.deepEqual(ids(searchProducts(PRODUCTS, "عود")), ["oud", "amber-oud"]);
  assert.deepEqual(ids(searchProducts(PRODUCTS, "عنبر")), ["amber-oud", "oud"]);
  const tie = [p("a", "عطر أول", { rank: 5 }), p("b", "عطر ثاني", { rank: 2 }), p("c", "عطر ثالث")];
  assert.deepEqual(ids(searchProducts(tie, "عطر")), ["b", "a", "c"]);
});

test("searchProducts returns nothing for garbage or an empty query", () => {
  assert.deepEqual(searchProducts(PRODUCTS, "zzqxw"), []);
  assert.deepEqual(searchProducts(PRODUCTS, "   "), []);
  assert.deepEqual(searchProducts(PRODUCTS, "!!!"), []);
});
