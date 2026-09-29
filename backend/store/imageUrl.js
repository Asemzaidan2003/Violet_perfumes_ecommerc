// Shared by product/brand/category models (and placement.model.js, via product.model.js's
// re-export) — split out so category.model.js -> categories.service.js -> product.model.js
// doesn't form an import cycle.
export const IMAGE_URL = /^(\/img\/[a-f0-9]{24}(-480)?\.(webp|jpg|png)|https:\/\/[^\s"'<>]+)$/;
