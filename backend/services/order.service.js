import crypto from "node:crypto";
import mongoose from "mongoose";
import Order from "../models/order.model.js";
import Product from "../models/product.model.js";
import Oil from "../models/oil.model.js";
import Bottle from "../models/bottle.model.js";
import Alcohol from "../models/alcohol.model.js";
import Customer from "../models/customer.model.js";
import { normalizeSize } from "../../storefront/js/shared/vocab.js";
import { normalizePhone } from "../../storefront/js/shared/phone.js";
import { effectivePrice } from "../catalog/pricing.js";

// Business rule: an order is never blocked for stock. Stock is deducted only when an
// order is confirmed through the POS; it may go negative (what the shop owes) and any
// gap is returned as a shortage. The next restock (add_quantity -> $inc) covers the debt.

const round2 = (n) => Math.round(n * 100) / 100;
// The central error handler returns `message` for exposed 4xx errors.
const fail = (status, message) => Object.assign(new Error(message), { status, expose: true });
const NEEDS_CONFIRMATION = ["completed", "ready for delivery", "in delivery", "uncollected payment"];
const MAX_LINES = 50;
const MAX_QTY = 1000;

// Base32-ish alphabet, no ambiguous chars (0/O, 1/I/L); 32 entries so one random byte % 32 is
// unbiased. Displayed to customers as "NS-XXXXXXXXXX".
const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function newRef() {
  const bytes = crypto.randomBytes(10);
  let ref = "";
  for (const b of bytes) ref += REF_ALPHABET[b % REF_ALPHABET.length];
  return ref;
}

// Order + stock changes commit or roll back together. A concurrent write to the same
// stock record raises a write conflict, which connection.transaction() retries.
async function inTransaction(fn) {
  let result;
  await mongoose.connection.transaction(async (session) => {
    result = await fn(session);
  });
  return result;
}

async function priceLines(items, source, session) {
  if (!Array.isArray(items) || items.length === 0) throw fail(400, "الطلب يجب أن يحتوي على منتج واحد على الأقل");
  if (items.length > MAX_LINES) throw fail(400, "عدد المنتجات في الطلب كبير جدًا (الحد 50)");
  const lines = [];
  for (const [i, item] of items.entries()) {
    const n = i + 1;
    const quantity = Number(item?.quantity);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_QTY) throw fail(400, `السطر ${n}: الكمية يجب أن تكون بين 1 و 1000`);
    if (!mongoose.isValidObjectId(item.product_id)) throw fail(400, `السطر ${n}: معرّف المنتج غير صالح`);
    const product = await Product.findById(item.product_id).session(session);
    if (!product) throw fail(404, `السطر ${n}: المنتج غير موجود`);
    if (source === "online" && product.status === "discontinued") throw fail(404, "المنتج غير متوفر");
    const size = normalizeSize(item.size);
    const ml = parseFloat(size);
    const listed = product.size_list.find((s) => s.size === size);
    if (!listed || !(ml > 0)) throw fail(400, `السطر ${n}: الحجم "${item.size}" غير متوفر للعطر ${product.p_name}`);

    const override = source === "pos" && item.price != null && item.price !== "";
    const price = override ? Number(item.price) : effectivePrice(product, listed);
    if (!Number.isFinite(price) || price < 0) throw fail(400, `السطر ${n}: السعر غير صالح`);

    lines.push({
      product_id: product._id,
      p_name: product.p_name,
      product_size: size,
      quantity,
      selling_price: price,
      total_revenue: round2(price * quantity),
      oil_id: product.oil_id,
      oil_ml: round2((product.oil_percentage / 100) * ml * quantity),
      alcohol_ml: round2((product.alcohol_percentage / 100) * ml * quantity),
      bottle: source === "pos" && item.bottle_id ? { bottle_id: item.bottle_id } : undefined,
    });
  }
  return lines;
}

// Takes the full `amount`; stock may go negative (what the shop owes) and the next
// restock (add_quantity → $inc) covers it. Any gap is still reported as a shortage.
async function take(Model, filter, field, nameField, amount, missingMessage, ctx) {
  const doc = await Model.findOne(filter).session(ctx.session);
  if (!doc) throw fail(404, missingMessage);
  const had = doc[field];
  if (had < amount) ctx.shortages.push({ item: doc[nameField], needed: amount, available: had });
  await Model.updateOne({ _id: doc._id }, { $set: { [field]: round2(had - amount) } }, { session: ctx.session });
  return { doc, taken: amount };
}

function setTotals(order) {
  const sum = (key) => round2(order.products.reduce((s, line) => s + (line[key] || 0), 0));
  order.total_items = order.products.reduce((s, line) => s + line.quantity, 0);
  order.total_revenue = sum("total_revenue");
  order.total_cost = sum("total_cost");
  order.total_profit = sum("total_profit");
  order.final_total = round2(order.total_revenue + (order.delivery_fee || 0));
}

async function deductAndCost(order, session) {
  const ctx = { session, shortages: [] };
  for (const [i, line] of order.products.entries()) {
    const n = i + 1;
    const bottleId = line.bottle?.bottle_id;
    if (!bottleId || !mongoose.isValidObjectId(bottleId)) throw fail(400, `السطر ${n}: يرجى اختيار زجاجة`);
    if (!line.oil_id) throw fail(400, `السطر ${n}: المنتج غير مرتبط بزيت`);

    const bottle = await take(Bottle, { _id: bottleId }, "quantity", "name", line.quantity, `السطر ${n}: الزجاجة غير موجودة`, ctx);
    if (bottle.doc.capacity !== parseFloat(line.product_size)) {
      throw fail(400, `السطر ${n}: الزجاجة "${bottle.doc.name}" سعتها ${bottle.doc.capacity} مل بينما الحجم ${line.product_size}`);
    }
    const oil = await take(Oil, { id: line.oil_id }, "oil_quantity", "oil_name", line.oil_ml, `السطر ${n}: الزيت ${line.oil_id} غير موجود`, ctx);
    const alcohol = await take(Alcohol, {}, "quantity", "name", line.alcohol_ml, "سجل الكحول غير موجود", ctx);

    const cost = line.oil_ml * oil.doc.oil_cost + line.alcohol_ml * alcohol.doc.cost + line.quantity * bottle.doc.cost;
    line.bottle = { bottle_id: bottle.doc._id, name: bottle.doc.name, cost: bottle.doc.cost };
    line.stock = { oil_ml: oil.taken, alcohol_ml: alcohol.taken, oil_doc_id: oil.doc._id, alcohol_id: alcohol.doc._id, bottles: bottle.taken };
    line.total_cost = round2(cost);
    line.cost_price = round2(cost / line.quantity);
    line.total_profit = round2(line.total_revenue - line.total_cost);
  }
  order.stock_deducted = true;
  setTotals(order);
  return ctx.shortages;
}

async function restock(order, session) {
  if (!order.stock_deducted) return;
  for (const line of order.products) {
    const s = line.stock;
    if (s?.bottles == null) continue; // legacy line: the deducted amounts were never recorded
    await Oil.updateOne({ _id: s.oil_doc_id }, { $inc: { oil_quantity: s.oil_ml } }, { session });
    await Alcohol.updateOne({ _id: s.alcohol_id }, { $inc: { quantity: s.alcohol_ml } }, { session });
    await Bottle.updateOne({ _id: line.bottle.bottle_id }, { $inc: { quantity: s.bottles } }, { session });
  }
  order.stock_deducted = false;
}

export async function placeOrder(input = {}, source) {
  if (source !== "pos" && source !== "online") throw fail(400, "مصدر الطلب غير صالح");
  const online = source === "online";
  let deliveryFee = 0;
  if (online) {
    const p = input.delivery_policy;
    if (!p || !(Number(p.fee) >= 0) || !(Number(p.free_over) >= 0) || !input.delivery || typeof input.client_key !== "string") {
      // Programmer error: the public controller must always supply these. Not a user-facing 4xx.
      throw new Error("placeOrder(online) requires delivery_policy, delivery and client_key");
    }
  } else {
    deliveryFee = Number(input.delivery_fee ?? 0);
    if (!Number.isFinite(deliveryFee) || deliveryFee < 0) throw fail(400, "رسوم التوصيل غير صالحة");
  }
  return inTransaction(async (session) => {
    if (online) {
      const existing = await Order.findOne({ client_key: input.client_key }).session(session);
      if (existing) return { order: existing, shortages: [], replay: true };
    }
    const order = new Order({
      products: await priceLines(input.products, source, session),
      source,
      customer_id: online ? undefined : input.customer_id || undefined,
      payment_method: online ? "Cash" : input.payment_method || "Cash",
      delivery_fee: online ? 0 : deliveryFee,
      order_notes: online ? "" : input.order_notes || "",
      created_by: online ? "online" : "admin",
      ...(online && { delivery: input.delivery, client_key: input.client_key, public_ref: newRef() }),
      stock_deducted: false,
      total_items: 0, total_revenue: 0, total_cost: 0, total_profit: 0, final_total: 0,
    });
    setTotals(order);
    if (online) {
      const { fee, free_over } = input.delivery_policy;
      order.delivery_fee = Number(free_over) > 0 && order.total_revenue >= Number(free_over) ? 0 : Number(fee);
      setTotals(order);
    }
    const shortages = online ? [] : await deductAndCost(order, session);
    await order.save({ session });
    return { order, shortages, replay: false };
  });
}

export async function confirmOrder(id, edits = [], { delivery_fee } = {}) {
  if (!Array.isArray(edits)) throw fail(400, "بيانات الأسطر غير صالحة");
  return inTransaction(async (session) => {
    const order = await Order.findById(id).session(session);
    if (!order) throw fail(404, "الطلب غير موجود");
    if (order.status === "canceled") throw fail(409, "الطلب ملغي");
    if (order.stock_deducted) throw fail(409, "تم تأكيد هذا الطلب مسبقًا");

    order.products.forEach((line, i) => {
      const edit = edits[i] || {};
      if (edit.quantity != null && edit.quantity !== "") {
        const q = Number(edit.quantity);
        if (!Number.isSafeInteger(q) || q < 1 || q > MAX_QTY) throw fail(400, `السطر ${i + 1}: الكمية يجب أن تكون بين 1 و 1000`);
        line.oil_ml = round2((line.oil_ml / line.quantity) * q);
        line.alcohol_ml = round2((line.alcohol_ml / line.quantity) * q);
        line.quantity = q;
      }
      if (edit.price != null && edit.price !== "") {
        const p = Number(edit.price);
        if (!Number.isFinite(p) || p < 0) throw fail(400, `السطر ${i + 1}: السعر غير صالح`);
        line.selling_price = p;
      }
      line.total_revenue = round2(line.selling_price * line.quantity);
      if (edit.bottle_id) line.bottle = { bottle_id: edit.bottle_id };
    });

    if (delivery_fee != null) {
      const fee = Number(delivery_fee);
      if (!Number.isFinite(fee) || fee < 0) throw fail(400, "رسوم التوصيل غير صالحة");
      order.delivery_fee = fee;
    }

    // Online orders arrive with an unverified phone snapshot, not a customer record. Link (or
    // create) the customer only now, at confirmation.
    if (order.source === "online" && !order.customer_id && order.delivery?.phone) {
      const phone = normalizePhone(order.delivery.phone);
      let customer = await Customer.findOne({ phone }).session(session);
      if (!customer) {
        [customer] = await Customer.create([{
          name: order.delivery.name, phone,
          address: [order.delivery.city, order.delivery.address].filter(Boolean).join(" — "),
        }], { session });
      }
      order.customer_id = customer._id;
    }

    const shortages = await deductAndCost(order, session);
    await order.save({ session });
    return { order, shortages };
  });
}

// Public, storefront-safe projection of an order: no ids, costs or stock data.
export function publicOrder(order) {
  return {
    ref: order.public_ref,
    subtotal: order.total_revenue,
    delivery_fee: order.delivery_fee,
    discount: order.discount ?? 0,
    total: order.final_total,
    items: order.products.map(({ p_name, product_size, quantity, selling_price, total_revenue }) => ({
      name: p_name,
      size: product_size,
      quantity,
      price: selling_price,
      line_total: total_revenue,
    })),
  };
}

export async function getOrderByRef(ref) {
  return Order.findOne({ public_ref: ref });
}

export async function changeStatus(id, status) {
  if (typeof status !== "string" || !status) throw fail(400, "الحالة مطلوبة");
  return inTransaction(async (session) => {
    const order = await Order.findById(id).session(session);
    if (!order) throw fail(404, "الطلب غير موجود");
    if (order.status === "canceled" && status !== "canceled") throw fail(409, "لا يمكن إعادة فتح طلب ملغي");
    if (NEEDS_CONFIRMATION.includes(status) && !order.stock_deducted) {
      throw fail(409, "يرجى تأكيد الطلب من نقطة البيع أولًا");
    }
    if (status === "canceled" && order.status !== "canceled") await restock(order, session);
    order.status = status;
    await order.save({ session, validateModifiedOnly: true });
    return order;
  });
}

export async function removeOrder(id) {
  return inTransaction(async (session) => {
    const order = await Order.findById(id).session(session);
    if (!order) throw fail(404, "الطلب غير موجود");
    if (order.status !== "canceled") await restock(order, session);
    await order.deleteOne({ session });
    return order;
  });
}
