// Browser image upload: resize to webp (jpeg fallback for Safari), then upload
// full + thumb. Never uses URL.createObjectURL — the admin CSP img-src has no blob:.
async function encode(bitmap, maxEdge) {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const toBlob = (type) => new Promise((resolve) => canvas.toBlob(resolve, type, 0.85));
  let blob = await toBlob("image/webp");
  if (!blob || blob.type !== "image/webp") blob = await toBlob("image/jpeg"); // Safari has no WebP encoder
  if (!blob) throw new Error("تعذر معالجة الصورة في المتصفح");
  return blob;
}

async function post(url, blob) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": blob.type }, body: blob });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || "فشل رفع الصورة");
  return body.data;
}

export async function uploadImage(file, { kind = "product" } = {}) {
  const bitmap = await createImageBitmap(file);
  try {
    const full = await encode(bitmap, kind === "banner" ? 2400 : 1400);
    const thumb = await encode(bitmap, 480);
    const saved = await post(`/api/uploads?kind=${kind}`, full);
    await post(`/api/uploads/${saved.id}/thumb`, thumb);
    return saved; // { id, url, thumb }
  } finally {
    bitmap.close();
  }
}
