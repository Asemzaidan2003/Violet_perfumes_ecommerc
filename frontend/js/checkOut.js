import {
  updateOilStock,
  updateAlcoholStock,
  updateBottleStock,
} from "./update_stocks.js";

export async function checkout(cart) {
  const baseURL = "http://localhost:5000/api";
  const customerId = cart.customer_id;
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
    const bottle = {
      bottle_id: product.bottle.bottle_id,
      name: bottleData.data.name,
      cost: bottleData.data.cost,
    };

    // Fetch كحول
    const alcoholRes = await fetch(`${baseURL}/alcohols`);
    const alcoholData = await alcoholRes.json();
    const alcohol_cost_per_ml = alcoholData[0].cost;

    // حساب التكاليف
    const total_oil_ml = (product.oil_percentage / 100) * size * quantity;
    const total_alcohol_ml =
      (product.alcohol_percentage / 100) * size * quantity;
    
    const total_cost =
      total_oil_ml * oil_cost_per_ml +
      total_alcohol_ml * alcohol_cost_per_ml +
      bottle_cost * quantity;
    console.log("Total Cost Calculation for: ",product.name," ", total_cost);
    console.log("  Oil Cost for: ",product.name," ", total_oil_ml * oil_cost_per_ml);
    console.log("  Alcohol Cost for: ",product.name," ", total_alcohol_ml * alcohol_cost_per_ml);
    console.log("  Alcohol Needed (ML) for: ",product.name," ", total_alcohol_ml);
    console.log(" Alcohol Cost per ML for: ",product.name," ", alcohol_cost_per_ml);
    console.log("  Bottle Cost for: ",product.name," ", bottle_cost * quantity);
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
      bottle: bottle,
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
    customer_id:customerId,
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
    window.location.reload();
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

      // Get current stocks
      let oil_stock = 0,
        alcohol_stock = 0;
      try {
        const oilRes = await fetch(`${baseURL}/oils/${product.oil_id}`);
        const oilData = await oilRes.json();
        oil_stock = oilData.data.oil_quantity;
      } catch (err) {
        console.error("Error checking oil stock:", err);
      }
      try {
        const alcoholRes = await fetch(`${baseURL}/alcohols`);
        const alcoholData = await alcoholRes.json();
        alcohol_stock = alcoholData[0].quantity;
      } catch (err) {
        console.error("Error checking alcohol stock:", err);
      }

      const enough_oil_stock = oil_stock >= oil_needed - 3;
      const enough_alcohol_stock = alcohol_stock >= alcohol_needed - 3;

      if (!enough_oil_stock || !enough_alcohol_stock) {
        allValid = false;
        let msg = `🚫 لا يوجد كمية كافية للعطر: ${product.name}\n`;
        if (!enough_oil_stock) {
          msg += `الزيت المطلوب: ${oil_needed.toFixed(
            2
          )} ML | المتوفر: ${oil_stock} ML\n`;
        }
        if (!enough_alcohol_stock) {
          msg += `الكحول المطلوب: ${alcohol_needed.toFixed(
            2
          )} ML | المتوفر: ${alcohol_stock} ML\n`;
        }
        alert(msg);
      }
    }

    return allValid;
  }
}

// للتنفيذ من خلال الزر
window.checkout = checkout;
