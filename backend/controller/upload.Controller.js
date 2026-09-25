import Image from "../models/image.model.js";

export const EXT = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };
const fail = (status, message) => Object.assign(new Error(message), { status, expose: true });
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// The declared Content-Type is not trusted: the type comes from the file's magic bytes.
export function sniffImage(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIG)) return "image/png";
  if (buf.length >= 12 && buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  return null;
}

function readImage(req) {
  // A mismatched Content-Type skips express.raw, so the body is {} (app.js sets req.body ??= {}).
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw fail(400, "أرسل ملف صورة (JPEG أو PNG أو WebP)");
  const type = sniffImage(req.body);
  if (!type) throw fail(400, "نوع الملف غير مدعوم — استخدم JPEG أو PNG أو WebP");
  return { type, buf: req.body };
}

const urls = (img) => ({
  id: img._id,
  url: `/img/${img._id}.${EXT[img.type]}`,
  thumb: `/img/${img._id}-480.${EXT[img.type]}`,
});

export const uploadImage = async (req, res) => {
  const { type, buf } = readImage(req);
  const img = await Image.create({ type, full: buf, bytes: buf.length });
  res.status(201).json({ success: true, data: urls(img) });
};

export const uploadThumb = async (req, res) => {
  const { type, buf } = readImage(req);
  const img = await Image.findById(req.params.id);
  if (!img) throw fail(404, "الصورة غير موجودة");
  img.thumb = buf;
  img.thumb_type = type;
  await img.save();
  res.json({ success: true, data: urls(img) });
};
