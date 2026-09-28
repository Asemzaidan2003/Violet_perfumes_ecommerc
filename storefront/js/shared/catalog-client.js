// The public compact catalogue (/api/store/catalog), fetched at most once per page and shared by
// every script that imports this module (unversioned, "./shared/catalog-client.js"). A failed fetch
// is forgotten so the next call retries. Browser only.
let pending = null;

export function loadCatalog() {
  pending ??= fetch("/api/store/catalog")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`catalog ${r.status}`))))
    .then((body) => body.data);
  pending.catch(() => { pending = null; });
  return pending;
}

// Forces the next loadCatalog() to fetch fresh (e.g. checkout.js re-pricing after an offer ends).
export function resetCatalog() {
  pending = null;
}
