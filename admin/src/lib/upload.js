// Browser image upload (port of frontend/js/upload.js): resize, encode webp (jpeg fallback), upload full + thumb.
// Never uses URL.createObjectURL: the admin CSP img-src has no blob:. Preview from the returned server URL.
export const MAX_BYTES = 3 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_EDGE = { product: 1400, banner: 2400 };
const THUMB_EDGE = 480;

export function planResize(width, height, maxEdge) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { w: Math.max(1, Math.round(width * scale)), h: Math.max(1, Math.round(height * scale)) };
}

export const pickEncoding = (supportsWebp) => ({ type: supportsWebp ? "image/webp" : "image/jpeg", quality: 0.85 });

async function browserEncode(bitmap, maxEdge) {
  const { w, h } = planResize(bitmap.width, bitmap.height, maxEdge);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
  const toBlob = ({ type, quality }) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  let blob = await toBlob(pickEncoding(true));
  if (!blob || blob.type !== "image/webp") blob = await toBlob(pickEncoding(false)); // Safari has no WebP encoder
  if (!blob) throw new Error("تعذر معالجة الصورة في المتصفح");
  return blob;
}

const browserDeps = {
  bitmap: (file) => createImageBitmap(file),
  encode: browserEncode,
  fetchImpl: (...a) => fetch(...a),
};

async function post(fetchImpl, url, blob, signal) {
  let res;
  try {
    res = await fetchImpl(url, { method: "POST", credentials: "same-origin", headers: { "Content-Type": blob.type }, body: blob, signal });
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    throw new Error("تعذّر الاتصال بالخادم");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message || "فشل رفع الصورة");
  return body.data;
}

// `deps` lets tests inject bitmap/encode/fetch. Resolves { id, url, thumb }.
export async function uploadImage(file, { kind = "product", signal, deps = {} } = {}) {
  const { bitmap: makeBitmap, encode, fetchImpl } = { ...browserDeps, ...deps };
  if (!TYPES.includes(file?.type)) throw new Error("نوع الملف غير مدعوم — استخدم JPEG أو PNG أو WebP");
  if (file.size > MAX_BYTES) throw new Error("حجم الصورة يتجاوز 3 ميغابايت");
  let bitmap;
  try {
    bitmap = await makeBitmap(file);
  } catch {
    throw new Error("تعذر معالجة الصورة في المتصفح");
  }
  try {
    const full = await encode(bitmap, MAX_EDGE[kind] ?? MAX_EDGE.product);
    const thumb = await encode(bitmap, THUMB_EDGE);
    const saved = await post(fetchImpl, `/api/uploads?kind=${kind}`, full, signal);
    await post(fetchImpl, `/api/uploads/${saved.id}/thumb`, thumb, signal);
    return saved;
  } finally {
    bitmap.close?.();
  }
}
