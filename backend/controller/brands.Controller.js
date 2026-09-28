import Brand from "../models/brand.model.js";
import Product from "../models/product.model.js";
import { invalidateCatalog } from "../store/catalog.js";
import { fail } from "../utils/fail.js";

const FIELDS = ["name_ar", "name_en", "slug", "logo", "active"];
const pick = (body, fields) => Object.fromEntries(fields.filter((k) => body[k] !== undefined).map((k) => [k, body[k]]));
const DUPLICATE_SLUG = "هذا الرابط مستخدم مسبقًا";

async function saveBrand(brand) {
  try {
    return await brand.save();
  } catch (err) {
    if (err?.code === 11000) throw fail(409, DUPLICATE_SLUG);
    throw err;
  }
}

// GET /api/brands
export const listBrands = async (req, res) => {
  const [brands, counts] = await Promise.all([
    Brand.find({}).sort({ createdAt: -1 }),
    Product.aggregate([{ $match: { brand: { $ne: null } } }, { $group: { _id: "$brand", count: { $sum: 1 } } }]),
  ]);
  const countById = new Map(counts.map((c) => [String(c._id), c.count]));
  res.status(200).json({ success: true, data: brands.map((b) => ({ ...b.toObject(), productCount: countById.get(String(b._id)) || 0 })) });
};

// POST /api/brands
export const createBrand = async (req, res) => {
  const brand = await saveBrand(new Brand(pick(req.body, FIELDS)));
  invalidateCatalog();
  res.status(201).json({ success: true, data: brand });
};

// PUT /api/brands/:id — load-and-save so slug/logo validators run on edits too.
export const updateBrand = async (req, res) => {
  const brand = await Brand.findById(req.params.id);
  if (!brand) throw fail(404, "المصمم غير موجود");
  Object.assign(brand, pick(req.body, FIELDS));
  await saveBrand(brand);
  invalidateCatalog();
  res.status(200).json({ success: true, data: brand });
};

// DELETE /api/brands/:id — refused while any product references the brand.
export const deleteBrand = async (req, res) => {
  const brand = await Brand.findById(req.params.id);
  if (!brand) throw fail(404, "المصمم غير موجود");
  const count = await Product.countDocuments({ brand: brand._id });
  if (count > 0) throw fail(409, `لا يمكن حذف مصمم مرتبط بمنتجات (${count})`);
  await brand.deleteOne();
  invalidateCatalog();
  res.status(200).json({ success: true, data: brand });
};
