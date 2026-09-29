import Category from "../models/category.model.js";
import Product from "../models/product.model.js";
import { invalidateCategories, getCategories } from "../services/categories.service.js";
import { fail } from "../utils/fail.js";

const CREATE_FIELDS = ["key", "slug", "name_ar", "name_en", "icon", "image", "sort", "visible"];
const UPDATE_FIELDS = ["slug", "name_ar", "name_en", "icon", "image", "sort", "visible"];
const pick = (body, fields) => Object.fromEntries(fields.filter((k) => body[k] !== undefined).map((k) => [k, body[k]]));
const DUPLICATE = "هذا الرابط أو المفتاح مستخدم مسبقًا";

async function saveCategory(category) {
  try {
    return await category.save();
  } catch (err) {
    if (err?.code === 11000) throw fail(409, DUPLICATE);
    throw err;
  }
}

// GET /api/categories
export const listCategories = async (req, res) => {
  const [categories, counts] = await Promise.all([
    getCategories(),
    Product.aggregate([{ $group: { _id: "$p_category", count: { $sum: 1 } } }]),
  ]);
  const countByKey = new Map(counts.map((c) => [c._id, c.count]));
  res.status(200).json({ success: true, data: categories.map((c) => ({ ...c, productCount: countByKey.get(c.key) || 0 })) });
};

// POST /api/categories
export const createCategory = async (req, res) => {
  const category = await saveCategory(new Category(pick(req.body, CREATE_FIELDS)));
  invalidateCategories();
  res.status(201).json({ success: true, data: category });
};

// PUT /api/categories/:id — key can never change.
export const updateCategory = async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) throw fail(404, "القسم غير موجود");
  if (req.body.key !== undefined && req.body.key !== category.key) throw fail(400, "لا يمكن تغيير المفتاح");
  Object.assign(category, pick(req.body, UPDATE_FIELDS));
  await saveCategory(category);
  invalidateCategories();
  res.status(200).json({ success: true, data: category });
};

// DELETE /api/categories/:id — refused while any product references the category.
export const deleteCategory = async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) throw fail(404, "القسم غير موجود");
  const count = await Product.countDocuments({ p_category: category.key });
  if (count > 0) throw fail(409, `لا يمكن حذف قسم مرتبط بمنتجات (${count})`);
  await category.deleteOne();
  invalidateCategories();
  res.status(200).json({ success: true, data: category });
};
