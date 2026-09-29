import { uploadImage } from "/admin/js/upload.js";

const form = document.getElementById("settingsForm");
const errorEl = document.getElementById("error");
const successEl = document.getElementById("success");
const saveBtn = document.getElementById("saveBtn");
const uploadStatus = document.getElementById("identity-upload-status");

const DEFAULT_THEME = { bg: "#0E0C0A", surface: "#17130F", text: "#F4EDE3", accent: "#D4AF37" };
const themeInputs = { bg: form.theme_bg, surface: form.theme_surface, text: form.theme_text, accent: form.theme_accent };

// Advanced-mode token whitelist + Arabic labels — must mirror backend/store/theme.js OVERRIDE_TOKENS.
const OVERRIDE_TOKENS = {
  "surface-2": "لون السطح الثانوي",
  line: "لون الخطوط",
  "text-muted": "لون النص الباهت",
  "gold-strong": "لون التمييز الغامق",
  "gold-ink": "لون النص فوق التمييز",
  cream: "لون الكريمي (قواعد البطاقات)",
  ink: "لون الحبر",
  "ink-muted": "لون الحبر الباهت",
  danger: "لون التنبيه (خطأ)",
  success: "لون النجاح",
  focus: "لون التركيز",
};

let overrides = {};

const advancedFields = document.getElementById("advancedColorFields");
for (const [key, label] of Object.entries(OVERRIDE_TOKENS)) {
  const wrap = document.createElement("div");
  wrap.className = "field";
  wrap.innerHTML = `
    <label for="ov_${key}">${label}</label>
    <input type="color" id="ov_${key}" data-token="${key}">
    <a href="#" data-reset="${key}">إعادة تعيين</a>
  `;
  advancedFields.append(wrap);
}
advancedFields.addEventListener("input", (e) => {
  const token = e.target.dataset?.token;
  if (!token) return;
  overrides[token] = e.target.value;
});
advancedFields.addEventListener("click", (e) => {
  const token = e.target.dataset?.reset;
  if (!token) return;
  e.preventDefault();
  delete overrides[token];
  document.getElementById(`ov_${token}`).value = "#000000";
  document.getElementById(`ov_${token}`).removeAttribute("value");
});

// Same WCAG relative-luminance/contrast math as backend/store/theme.js, duplicated here so the
// preview works without shipping a bundler for one small function. Informational only — never blocks save.
function contrast(hexA, hexB) {
  const lum = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [L1, L2] = [lum(hexA), lum(hexB)].sort((a, b) => b - a);
  return (L1 + 0.05) / (L2 + 0.05);
}

function currentTheme() {
  return { bg: themeInputs.bg.value, surface: themeInputs.surface.value, text: themeInputs.text.value, accent: themeInputs.accent.value };
}

function updatePreview() {
  const t = currentTheme();
  const r = { text_bg: contrast(t.text, t.bg), text_surface: contrast(t.text, t.surface), accent_bg: contrast(t.accent, t.bg) };
  document.getElementById("themePreview").style.background = t.bg;
  document.getElementById("themePreview").style.color = t.text;
  document.getElementById("previewSurface").style.background = t.surface;
  document.getElementById("previewAccentBtn").style.background = t.accent;
  document.getElementById("previewAccentBtn").style.color = t.text;
  document.getElementById("ratioBg").textContent = `(${r.text_bg.toFixed(1)}:1)`;
  document.getElementById("ratioSurface").textContent = `(${r.text_surface.toFixed(1)}:1)`;
  document.getElementById("ratioAccent").textContent = `(${r.accent_bg.toFixed(1)}:1)`;
}

Object.values(themeInputs).forEach((input) => input.addEventListener("input", updatePreview));

document.getElementById("resetThemeBtn").addEventListener("click", async () => {
  for (const k of Object.keys(DEFAULT_THEME)) themeInputs[k].value = DEFAULT_THEME[k];
  updatePreview();
  await saveTheme();
});

// ------------------------------------------------------------------ Uploads
const IMAGE_FIELDS = ["logo_light", "logo_dark", "favicon", "share_image"];
const fieldSetters = {};
for (const field of IMAGE_FIELDS) {
  const hidden = document.getElementById(field);
  const preview = document.getElementById(`${field}_preview`);
  const fileInput = document.getElementById(`${field}_file`);
  const removeBtn = document.getElementById(`${field}_remove`);

  function setValue(url) {
    hidden.value = url || "";
    if (url) {
      preview.src = url;
      preview.style.display = "";
      removeBtn.hidden = false;
    } else {
      preview.removeAttribute("src");
      preview.style.display = "none";
      removeBtn.hidden = true;
    }
  }
  setValue.forField = field;

  fileInput.addEventListener("change", async (e) => {
    const [file] = e.target.files;
    if (!file) return;
    uploadStatus.textContent = "جارٍ رفع الصورة…";
    try {
      const saved = await uploadImage(file, { kind: "banner" });
      setValue(saved.url);
      uploadStatus.textContent = "تم رفع الصورة ✓";
    } catch (err) {
      uploadStatus.textContent = err.message || "تعذر رفع الصورة";
    }
    fileInput.value = "";
  });

  removeBtn.addEventListener("click", () => setValue(""));

  fieldSetters[field] = setValue;
}

// The form stays disabled until the current settings actually load — saving before that
// would silently overwrite fields the admin never saw with client-side defaults (0/"").
async function loadSettings() {
  try {
    const res = await fetch("/api/settings");
    if (!res.ok) throw new Error("تعذر تحميل الإعدادات");
    const { data } = await res.json();
    form.store_name.value = data.store_name || "نسمات";
    form.tagline.value = data.tagline || "";
    for (const field of IMAGE_FIELDS) fieldSetters[field](data[field] || "");
    form.whatsapp.value = data.whatsapp || "";
    form.instagram.value = data.instagram || "";
    form.delivery_fee.value = data.delivery_fee ?? 0;
    form.free_delivery_over.value = data.free_delivery_over ?? 0;
    const theme = { ...DEFAULT_THEME, ...(data.theme || {}) };
    for (const k of Object.keys(DEFAULT_THEME)) themeInputs[k].value = theme[k];
    overrides = { ...(data.theme?.overrides || {}) };
    for (const key of Object.keys(OVERRIDE_TOKENS)) {
      const input = document.getElementById(`ov_${key}`);
      if (overrides[key]) input.value = overrides[key];
    }
    updatePreview();
    saveBtn.disabled = false;
  } catch (err) {
    console.error("Error loading settings:", err);
    errorEl.textContent = "تعذر تحميل الإعدادات — أعد تحميل الصفحة";
    errorEl.hidden = false;
  }
}

async function saveTheme() {
  const res = await fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ theme: { ...currentTheme(), overrides } }),
  });
  const data = await res.json().catch(() => ({}));
  errorEl.hidden = true;
  successEl.hidden = true;
  if (!res.ok) {
    errorEl.textContent = data.message || "تعذر حفظ الإعدادات";
    errorEl.hidden = false;
    return false;
  }
  successEl.textContent = "تم حفظ الإعدادات ✓";
  successEl.hidden = false;
  return true;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.hidden = true;
  successEl.hidden = true;

  const body = {
    store_name: form.store_name.value.trim(),
    tagline: form.tagline.value.trim(),
    logo_light: form.logo_light.value,
    logo_dark: form.logo_dark.value,
    favicon: form.favicon.value,
    share_image: form.share_image.value,
    whatsapp: form.whatsapp.value.trim(),
    instagram: form.instagram.value.trim(),
    delivery_fee: Number(form.delivery_fee.value),
    free_delivery_over: Number(form.free_delivery_over.value),
    theme: { ...currentTheme(), overrides },
  };

  const res = await fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    errorEl.textContent = data.message || "تعذر حفظ الإعدادات";
    errorEl.hidden = false;
    return;
  }
  successEl.textContent = "تم حفظ الإعدادات ✓";
  successEl.hidden = false;
});

loadSettings();
