import { getCatalog, compactIndex } from "../store/catalog.js";

// GET /api/store/catalog — public compact index for the search overlay and cart pricing.
export const getPublicCatalog = async (req, res) => {
  const { products } = await getCatalog();
  res.set("Cache-Control", "public, max-age=30").status(200).json({ success: true, data: compactIndex(products) });
};
