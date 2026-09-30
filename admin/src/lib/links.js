import { IMAGE_URL } from "@/lib/productForm";

export const isHttps = (u) => {
  try { return new URL(u).protocol === "https:"; } catch { return false; }
};
// Port of backend/models/placement.model.js validLink: an internal path (no // or \) or an https URL.
export const validLink = (l) => typeof l === "string" && (/^\/(?![/\\])\S*$/.test(l) || isHttps(l));
export const isImageUrl = (u) => typeof u === "string" && IMAGE_URL.test(u);
