import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestApp, loginAs } from "./helpers.js";
import Page from "../backend/models/page.model.js";
import { invalidatePages, seedDefaultPages } from "../backend/services/pages.service.js";

const XSS = "<img src=x onerror=alert(1)>";
let t, cookie;

const api = (path, method = "GET", body) =>
  fetch(`${t.url}/api${path}`, {
    method,
    headers: { cookie, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

before(async () => {
  t = await startTestApp();
  cookie = await loginAs(t.url);
  await Page.createIndexes(); // rebuild the unique slug index dropped by startTestApp's dropDatabase()
});
after(() => t.close());

test("admin: create, list, update, delete a page", async () => {
  const created = await api("/pages", "POST", { title: "من نحن", slug: "about-us", body: "# من نحن\n\nنص", footer_group: "help" });
  assert.equal(created.status, 201);
  const { data: page } = await created.json();
  assert.equal(page.slug, "about-us");
  invalidatePages();

  const listed = await (await api("/pages")).json();
  assert.ok(listed.data.some((p) => p._id === page._id));

  const updated = await api(`/pages/${page._id}`, "PUT", { title: "من نحن (محدّث)", published: true });
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).data.title, "من نحن (محدّث)");

  const removed = await api(`/pages/${page._id}`, "DELETE");
  assert.equal(removed.status, 200);
});

test("admin: reserved slug is rejected with 400", async () => {
  const res = await api("/pages", "POST", { title: "سلة", slug: "cart", body: "" });
  assert.equal(res.status, 400);
});

test("admin: duplicate slug is a 409", async () => {
  await api("/pages", "POST", { title: "أ", slug: "dup-slug", body: "" });
  const res = await api("/pages", "POST", { title: "ب", slug: "dup-slug", body: "" });
  assert.equal(res.status, 409);
});

test("admin: XSS in title is stored escaped when rendered, never executed", async () => {
  const created = await api("/pages", "POST", { title: XSS, slug: "xss-title", body: "نص", published: true });
  assert.equal(created.status, 201);
  invalidatePages();
  const res = await fetch(`${t.url}/page/xss-title`);
  const html = await res.text();
  assert.ok(!html.includes("<img src=x onerror"), html);
  assert.match(html, /&lt;img/);
});

test("public: a published page renders with a heading; an unpublished page 404s", async () => {
  await api("/pages", "POST", { title: "الشروط", slug: "terms-pub", body: "# عنوان\n\n- بند أول\n- بند ثاني", published: true, meta_description: "وصف الصفحة" });
  await api("/pages", "POST", { title: "مسودة", slug: "draft-page", body: "نص", published: false });
  invalidatePages();

  const pub = await fetch(`${t.url}/page/terms-pub`);
  assert.equal(pub.status, 200);
  const html = await pub.text();
  assert.match(html, /<h2[^>]*>عنوان<\/h2>/); // body "#" is h2: the page title is the only h1
  assert.equal(html.match(/<h1[\s>]/g)?.length, 1);
  assert.ok(html.includes("<ul>"));
  assert.match(html, /name="description" content="وصف الصفحة"/);

  const draft = await fetch(`${t.url}/page/draft-page`);
  assert.equal(draft.status, 404);

  const unknown = await fetch(`${t.url}/page/does-not-exist`);
  assert.equal(unknown.status, 404);
});

test("footer lists only published pages, grouped by footer_group", async () => {
  await api("/pages", "POST", { title: "صفحة معلومات", slug: "info-page", body: "", published: true, footer_group: "info" });
  await api("/pages", "POST", { title: "صفحة مخفية", slug: "hidden-page", body: "", published: false, footer_group: "info" });
  invalidatePages();
  const html = await (await fetch(`${t.url}/`)).text();
  assert.ok(html.includes('href="/page/info-page"'), "published page missing from footer");
  assert.ok(!html.includes('href="/page/hidden-page"'), "unpublished page leaked into footer");
});

test("sitemap includes published pages", async () => {
  await api("/pages", "POST", { title: "سياسة", slug: "sitemap-page", body: "", published: true });
  invalidatePages();
  const xml = await (await fetch(`${t.url}/sitemap.xml`)).text();
  assert.ok(xml.includes("/page/sitemap-page"));
});

test("checkout shows the terms line only when the terms page is published", async () => {
  const before1 = await (await fetch(`${t.url}/checkout`)).text();
  assert.ok(!before1.includes("الشروط والأحكام"));

  await api("/pages", "POST", { title: "الشروط والأحكام", slug: "terms", body: "", published: true });
  invalidatePages();
  const after1 = await (await fetch(`${t.url}/checkout`)).text();
  assert.match(after1, /href="\/page\/terms">الشروط والأحكام/);
});

test("seed is idempotent: running twice yields 7 pages with no duplicates, keeps edits", async () => {
  await Page.deleteMany({});
  await seedDefaultPages();
  const first = await Page.find({}).lean();
  assert.equal(first.length, 7);

  // Simulate an owner edit, then reseed: the edit must survive.
  await Page.updateOne({ slug: "terms" }, { $set: { title: "شروطنا المعدّلة" } });
  await seedDefaultPages();
  const second = await Page.find({}).lean();
  assert.equal(second.length, 7);
  const slugs = second.map((p) => p.slug);
  assert.equal(new Set(slugs).size, 7);
  assert.equal(second.find((p) => p.slug === "terms").title, "شروطنا المعدّلة");
});
