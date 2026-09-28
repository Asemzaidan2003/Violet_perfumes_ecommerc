// Single place that turns thrown errors into safe JSON. Never leaks err.message
// for unexpected errors — those are logged server-side only.
export function errorHandler(err, req, res, next) {
  const send = (status, message) => res.status(status).json({ success: false, message });
  if (err.type === "entity.parse.failed") return send(400, "Invalid JSON");
  if (err.type === "entity.too.large") return send(413, "Request too large");
  if (err.name === "CastError") return send(400, "Invalid id");
  if (err.name === "ValidationError") {
    return send(400, Object.values(err.errors).map((e) => e.message).join(", "));
  }
  if (err.code === 11000) return send(409, "Duplicate value");
  if (err.status >= 400 && err.status < 500) {
    const body = { success: false, message: err.expose ? err.message : "Bad request" };
    if (err.expose && err.field) body.field = err.field;
    return res.status(err.status).json(body);
  }
  console.error(err);
  send(500, "Server error");
}
