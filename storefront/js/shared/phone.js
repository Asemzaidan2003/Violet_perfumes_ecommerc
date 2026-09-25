// Jordan phone numbers as customers really type them (Arabic-Indic digits, +962, spaces).
// Pure — shared by the server, the checkout and the admin.
const ARABIC_DIGITS = /[٠-٩۰-۹]/g;

export function normalizePhone(input) {
  let digits = String(input ?? "")
    .replace(ARABIC_DIGITS, (d) => {
      const c = d.charCodeAt(0);
      return String(c <= 0x0669 ? c - 0x0660 : c - 0x06f0);
    })
    .replace(/\D/g, "");
  if (digits.startsWith("00962")) digits = "0" + digits.slice(5);
  else if (digits.startsWith("962")) digits = "0" + digits.slice(3);
  else if (digits.length === 9 && digits.startsWith("7")) digits = "0" + digits;
  return digits;
}

export const isJordanMobile = (p) => /^07[789]\d{7}$/.test(p);
