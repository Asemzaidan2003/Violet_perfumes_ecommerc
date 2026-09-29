export class ApiError extends Error {
  constructor(status, message, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

export async function api(path, { method = "GET", body, signal } = {}) {
  const hasBody = body !== undefined;
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: hasBody ? { "Content-Type": "application/json" } : undefined,
    body: hasBody ? JSON.stringify(body) : undefined,
    signal,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty or non-JSON body */ }
  if (res.status === 401 && !path.startsWith("/auth/login")) onUnauthorized();
  if (!res.ok) throw new ApiError(res.status, data?.message || "تعذّر إكمال الطلب", data);
  return data;
}

export const unwrap = (body) => (Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : []);

export const listOf = (path) => async () => {
  try {
    return unwrap(await api(path));
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return [];
    throw err;
  }
};
