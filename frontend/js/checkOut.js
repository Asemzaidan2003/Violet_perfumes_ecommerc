// POS checkout: the server prices, costs and deducts stock in one transaction.
// Sales are never blocked for stock; the server reports what ran short.
export async function checkout(cart) {
  const body = {
    products: cart.products.map((item) => ({
      product_id: item.id,
      size: item.size,
      quantity: item.quantity,
      price: item.price,
      bottle_id: item.bottle?.bottle_id,
    })),
    customer_id: cart.customer_id,
    payment_method: "Cash",
  };

  try {
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.message || "فشل في تنفيذ الطلب");
      return false;
    }
    let msg = "✅ تم إنشاء الطلب بنجاح!";
    if (data.shortages?.length) {
      msg += "\n\n⚠️ المخزون غير كافٍ لهذه المواد (تم تصفيرها):\n" +
        data.shortages.map((s) => `${s.item}: المطلوب ${s.needed}، المتوفر ${s.available}`).join("\n");
    }
    alert(msg);
    window.location.reload();
    return true;
  } catch (err) {
    console.error("❌ Error creating order:", err);
    alert("فشل في تنفيذ الطلب");
    return false;
  }
}

// للتنفيذ من خلال الزر
window.checkout = checkout;
