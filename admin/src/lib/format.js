export const money = (n) => `${(Number(n) || 0).toFixed(2)} JOD`;
export const shortId = (id) => String(id ?? "").slice(-6).toUpperCase();
