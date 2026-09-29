import mongoose from "mongoose";

const SLUG_RE = /^[a-z0-9-]{2,40}$/;
export const FOOTER_GROUPS = ["info", "help", "none"];

// Top-level routes storefront.Routs.js already owns; pages live under /page/:slug so collision is
// impossible anyway, but reserved slugs are still rejected with 400 (short and sensible, per spec).
export const RESERVED_SLUGS = [
  "c", "p", "brand", "brands", "family", "search", "offers", "new", "best-sellers",
  "cart", "checkout", "order", "admin", "api", "assets", "vendor", "img", "robots.txt", "sitemap.xml",
];

const pageSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, match: [SLUG_RE, "رابط غير صالح"] },
    title: { type: String, required: true, trim: true, maxlength: 80 },
    body: { type: String, default: "", maxlength: 20000 },
    footer_group: { type: String, enum: FOOTER_GROUPS, default: "info" },
    sort: { type: Number, default: 0 },
    published: { type: Boolean, default: true },
    meta_description: { type: String, default: "", trim: true, maxlength: 160 },
  },
  { timestamps: true }
);

pageSchema.pre("validate", function preValidate(next) {
  if (RESERVED_SLUGS.includes(this.slug)) this.invalidate("slug", "هذا الرابط محجوز");
  next();
});

export default mongoose.model("pages", pageSchema);
