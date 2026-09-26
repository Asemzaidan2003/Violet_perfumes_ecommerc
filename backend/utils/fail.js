// The central error handler (backend/middleware/error.js) returns `message` for any error with
// `expose: true`. One definition, shared by the order service, the storefront validators and
// their controllers, so a 4xx error always looks the same shape everywhere.
export const fail = (status, message) => Object.assign(new Error(message), { status, expose: true });
