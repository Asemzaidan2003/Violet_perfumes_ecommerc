// Strictly parses TRUST_PROXY_HOPS: only a non-negative integer string is valid.
// Returns the integer, or null for missing/invalid input (never silently NaN).
export function parseTrustProxyHops(raw) {
  if (raw === undefined || raw === null || raw === "") return null;
  if (!/^\d+$/.test(raw)) return null;
  return Number(raw);
}
