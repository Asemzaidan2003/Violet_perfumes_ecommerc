// Shared catalogue vocabulary: imported by the server (by path) and by browsers
// (/assets/js/shared/vocab.js). Pure data — no Node or browser APIs.
export const CATEGORIES = [
  { key: "Men", slug: "men", ar: "رجالي" },
  { key: "Women", slug: "women", ar: "نسائي" },
  { key: "Unisex", slug: "unisex", ar: "للجنسين" },
  { key: "Home", slug: "home", ar: "معطرات منزلية" },
  { key: "Car", slug: "car", ar: "معطرات سيارات" },
];

export const FAMILIES = [
  { key: "oud", ar: "عود", swatch: "#5B3A1E" },
  { key: "musk", ar: "مسك", swatch: "#E8E0D5" },
  { key: "amber", ar: "عنبر", swatch: "#C77D2E" },
  { key: "vanilla", ar: "فانيلا", swatch: "#E9D6A8" },
  { key: "leather", ar: "جلد", swatch: "#6B4A3A" },
  { key: "woody", ar: "خشبي", swatch: "#7A5C3E" },
  { key: "floral", ar: "زهري", swatch: "#D98BA0" },
  { key: "citrus", ar: "حمضي", swatch: "#E8C23A" },
  { key: "aquatic", ar: "مائي", swatch: "#5BA4C9" },
  { key: "powdery", ar: "بودري", swatch: "#D8C8D8" },
  { key: "tobacco", ar: "تبغ", swatch: "#8A5A2B" },
  { key: "coffee", ar: "قهوة", swatch: "#4B2E1F" },
  { key: "incense", ar: "بخور", swatch: "#9A8C7A" },
  { key: "oriental", ar: "شرقي", swatch: "#A23B2A" },
  { key: "gourmand", ar: "حلو", swatch: "#C98B5E" },
  { key: "spicy", ar: "توابل", swatch: "#B5532E" },
  { key: "fruity", ar: "فواكه", swatch: "#E0664F" },
  { key: "aromatic", ar: "أروماتيك", swatch: "#6E8B5E" },
  { key: "fresh", ar: "منعش", swatch: "#8FC7B8" },
];

export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);
export const FAMILY_KEYS = FAMILIES.map((f) => f.key);

// "30ml", " 50 مل " → "30", "50" (so the storefront and stock rules see one spelling).
export const normalizeSize = (v) => String(v ?? "").trim().replace(/\s*(ml|مل)\s*$/i, "").trim();
