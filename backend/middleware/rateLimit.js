// ponytail: in-memory buckets, one process only; move to Redis/Mongo when running several instances.

// Group IPv6 clients by /64 (one household/device range), IPv4 by address.
export function clientKey(ip = "") {
  const addr = String(ip).replace(/^::ffff:/, "").replace(/%.*$/, "");
  if (!addr.includes(":")) return addr;
  const [head, tail = ""] = addr.split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const full = [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t];
  return `${full.slice(0, 4).map((p) => p.toLowerCase().replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

export function createLimiter({ windowMs, max }) {
  const buckets = new Map();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, b] of buckets) if (now - b.first >= windowMs) buckets.delete(key);
  }, Math.min(windowMs, 60_000));
  sweep.unref();

  const bucketFor = (req, now) => {
    const key = clientKey(req.ip);
    let b = buckets.get(key);
    if (!b || now - b.first >= windowMs) { b = { count: 0, first: now }; buckets.set(key, b); }
    return b;
  };

  return {
    // Synchronous check-and-count, so concurrent requests can't all slip past the limit.
    hit(req) {
      const now = Date.now();
      const b = bucketFor(req, now);
      if (b.count >= max) return { ok: false, retryAfterMs: windowMs - (now - b.first) };
      b.count++;
      return { ok: true };
    },
    reset(req) { buckets.delete(clientKey(req.ip)); },
    size: () => buckets.size,
  };
}

// Express middleware form; `message` may be a function of req (e.g. to include the WhatsApp link).
export const limit = (name, message) => (req, res, next) => {
  const r = req.app.locals.limiters[name].hit(req);
  if (r.ok) return next();
  res.set("Retry-After", String(Math.ceil(r.retryAfterMs / 1000)));
  res.status(429).json({ success: false, message: typeof message === "function" ? message(req) : message });
};
