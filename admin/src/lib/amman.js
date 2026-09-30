const TZ = "Asia/Amman";
const RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });

// Wall-clock fields of an instant in Amman, as a UTC-based ms value (so differences give the zone offset).
function ammanWallMs(ms) {
  const p = Object.fromEntries(parts.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
}

// "YYYY-MM-DDTHH:mm" interpreted as Amman wall time -> ISO string; anything else -> null.
export function ammanLocalToIso(local) {
  const m = RE.exec(String(local ?? "").trim());
  if (!m) return null;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let ms = wall - (ammanWallMs(wall) - wall); // first guess with the offset at the wall instant
  ms = wall - (ammanWallMs(ms) - ms); // re-evaluate at the guess (handles DST edges)
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function isoToAmmanLocal(iso) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return "";
  const p = Object.fromEntries(parts.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

const fmt = new Intl.DateTimeFormat("ar-JO-u-nu-latn", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" });
export const formatAmman = (iso) => {
  const d = new Date(iso);
  return !iso || Number.isNaN(d.getTime()) ? "" : fmt.format(d);
};
