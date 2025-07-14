import {
  updateOilStock,
  updateAlcoholStock,
  updateBottleStock,
} from "./update_stocks.js";

export async function checkout(cart) {
  const baseURL = "http://localhost:5000/api";

  // Step 1: التأكد من وجود الكمية الكافية
  const isStockValid = await validateStock(cart);
  if (!isStockValid) {
    alert("❌ الكمية غير كافية، لا يمكن تنفيذ الطلب.");
    return;
  }

  // Step 2: خصم الكميات من المخزون
  for (let product of cart.products) {
    const oil_needed =
      (product.oil_percentage / 100) *
      parseFloat(product.size) *
      product.quantity;
    const alcohol_needed =
      (product.alcohol_percentage / 100) *
      parseFloat(product.size) *
      product.quantity;
    const bottle_quantity = product.quantity;

    await updateOilStock(product.oil_id, -oil_needed);
    await updateAlcoholStock(-alcohol_needed);
    await updateBottleStock(product.bottle.bottle_id, -bottle_quantity);
  }

  // Step 3: تجهيز بيانات الطلب
  const orderProducts = [];

  for (let product of cart.products) {
    const quantity = product.quantity;
    const size = parseFloat(product.size);

    // Fetch زيت
    const oilRes = await fetch(`${baseURL}/oils/${product.oil_id}`);
    const oilData = await oilRes.json();
    const oil_cost_per_ml = oilData.data.oil_cost;

    // Fetch زجاجة
    const bottleRes = await fetch(
      `${baseURL}/bottles/${product.bottle.bottle_id}`
    );
    const bottleData = await bottleRes.json();
    const bottle_cost = bottleData.data.cost;

    // Fetch كحول
    const alcoholRes = await fetch(`${baseURL}/alcohols`);
    const alcoholData = await alcoholRes.json();
    const alcohol_cost_per_ml = alcoholData[0].cost / 1000;

    // حساب التكاليف
    const total_oil_ml = (product.oil_percentage / 100) * size * quantity;
    const total_alcohol_ml =
      (product.alcohol_percentage / 100) * size * quantity;

    const total_cost =
      total_oil_ml * oil_cost_per_ml +
      total_alcohol_ml * alcohol_cost_per_ml +
      bottle_cost * quantity;

    const total_revenue = product.price * quantity;
    const total_profit = total_revenue - total_cost;

    orderProducts.push({
      product_id: product.id,
      p_name: product.name,
      product_size: product.size,
      quantity,
      selling_price: product.price,
      cost_price: +(total_cost / quantity).toFixed(2),
      total_revenue: +total_revenue.toFixed(2),
      total_cost: +total_cost.toFixed(2),
      total_profit: +total_profit.toFixed(2),
    });
  }

  const total_items = cart.total_items;
  const total_revenue = orderProducts.reduce(
    (sum, p) => sum + p.total_revenue,
    0
  );
  const total_cost = orderProducts.reduce((sum, p) => sum + p.total_cost, 0);
  const total_profit = total_revenue - total_cost;
  const delivery_fee = 0; // قابل للتغيير لاحقاً
  const final_total = total_revenue + delivery_fee;

  const order = {
    products: orderProducts,
    total_items,
    total_revenue: +total_revenue.toFixed(2),
    total_cost: +total_cost.toFixed(2),
    total_profit: +total_profit.toFixed(2),
    payment_method: "Cash", // لاحقًا ممكن نأخذه من المستخدم
    delivery_fee,
    final_total: +final_total.toFixed(2),
    order_notes: "", // يمكن إضافتها من فورم لاحقًا
    status: "pending",
    created_by: "admin",
  };

  // Step 4: إرسال الطلب للباك إند
  try {
    const res = await fetch(`${baseURL}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(order),
    });

    if (!res.ok) throw new Error("فشل في إنشاء الطلب");

    const data = await res.json();
    alert("✅ تم إنشاء الطلب بنجاح!");
    console.log("🧾 Order created:", data);
  } catch (err) {
    console.error("❌ Error creating order:", err);
    alert("فشل في تنفيذ الطلب");
  }

  // === Internal helper functions ===

  async function validateStock(cart) {
    const products = cart.products;
    let allValid = true;

    for (let product of products) {
      const oil_percentage = product.oil_percentage;
      const alcohol_percentage = product.alcohol_percentage;
      const bottle_size = parseFloat(product.size);
      const quantity = parseInt(product.quantity);

      const oil_needed = (oil_percentage / 100) * bottle_size * quantity;
      const alcohol_needed =
        (alcohol_percentage / 100) * bottle_size * quantity;

      const enough_oil_stock = await checkOilStock(product.oil_id, oil_needed);
      const enough_alcohol_stock = await checkAlcoholStock(alcohol_needed);

      if (!enough_oil_stock || !enough_alcohol_stock) {
        allValid = false;
        alert(`🚫 لا يوجد كمية كافية للعطر: ${product.name}`);
      }
    }

    return allValid;
  }

  async function checkOilStock(oil_id, oil_needed) {
    try {
      const res = await fetch(`${baseURL}/oils/${oil_id}`);
      const data = await res.json();
      const stock = data.data.oil_quantity;
      return stock >= oil_needed + 3; // +3 احتياطي
    } catch (err) {
      console.error("Error checking oil stock:", err);
      return false;
    }
  }

  async function checkAlcoholStock(alcohol_needed) {
    try {
      const res = await fetch(`${baseURL}/alcohols`);
      const data = await res.json();
      const stock = data[0].quantity;
      return stock >= alcohol_needed + 3;
    } catch (err) {
      console.error("Error checking alcohol stock:", err);
      return false;
    }
  }
}

// للتنفيذ من خلال الزر
window.checkout = checkout;
