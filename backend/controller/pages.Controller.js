import Page from "../models/page.model.js";
import { invalidatePages } from "../services/pages.service.js";
import { renderMarkup } from "../store/markup.js";
import { fail } from "../utils/fail.js";

const FIELDS = ["slug", "title", "body", "footer_group", "sort", "published", "meta_description"];
const pick = (body, fields) => Object.fromEntries(fields.filter((k) => body[k] !== undefined).map((k) => [k, body[k]]));
const DUPLICATE_SLUG = "هذا الرابط مستخدم مسبقًا";

async function savePage(page) {
  try {
    return await page.save();
  } catch (err) {
    if (err?.code === 11000) throw fail(409, DUPLICATE_SLUG);
    throw err;
  }
}

// GET /api/pages
export const listPages = async (req, res) => {
  const pages = await Page.find({}).sort({ footer_group: 1, sort: 1, createdAt: 1 });
  res.status(200).json({ success: true, data: pages });
};

// POST /api/pages
export const createPage = async (req, res) => {
  const page = await savePage(new Page(pick(req.body, FIELDS)));
  invalidatePages();
  res.status(201).json({ success: true, data: page });
};

// PUT /api/pages/:id
export const updatePage = async (req, res) => {
  const page = await Page.findById(req.params.id);
  if (!page) throw fail(404, "الصفحة غير موجودة");
  Object.assign(page, pick(req.body, FIELDS));
  await savePage(page);
  invalidatePages();
  res.status(200).json({ success: true, data: page });
};

// DELETE /api/pages/:id
export const deletePage = async (req, res) => {
  const page = await Page.findById(req.params.id);
  if (!page) throw fail(404, "الصفحة غير موجودة");
  await page.deleteOne();
  invalidatePages();
  res.status(200).json({ success: true, data: page });
};

// POST /api/pages/preview — renders the same markup rules used on the storefront, for the admin's
// live preview. Chosen over a shared client/server module: smaller diff, one implementation.
export const previewPage = async (req, res) => {
  res.status(200).json({ success: true, data: { html: renderMarkup(req.body.body) } });
};
