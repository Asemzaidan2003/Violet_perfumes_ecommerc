// `add_quantity` adds to stock atomically ($inc): a delivery then also covers owed
// (negative) stock, and never overwrites a sale made while the edit form was open.
export function stockUpdate(body, field) {
  const { add_quantity, ...fields } = body ?? {};
  if (add_quantity === undefined || add_quantity === null || add_quantity === "") return fields;
  const n = Number(add_quantity);
  if (!Number.isFinite(n) || n <= 0) {
    throw Object.assign(new Error("كمية الإضافة يجب أن تكون رقمًا موجبًا"), { status: 400, expose: true });
  }
  delete fields[field]; // $set and $inc on the same path would conflict
  return { $set: fields, $inc: { [field]: n } };
}
