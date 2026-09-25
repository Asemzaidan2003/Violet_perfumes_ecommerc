const baseURL = "/api";
export async function getOilStock(oil_id) {
  try {
    const res = await fetch(`${baseURL}/oils/${oil_id}`);
    const data = await res.json();
    return data.data.oil_quantity;
  } catch (err) {
    console.error("Error fetching oil stock:", err);
    return null;
  }
}

export async function getAlcoholStock() {
    try {
        const res = await fetch(`${baseURL}/alcohols`);
        const data = await res.json();
        return data[0].quantity;
    } catch (err) {
        console.error("Error fetching alcohol stock:", err);
        return null;
    }
}

export async function getBottleStock(bottle_id) {
    try {
        const res = await fetch(`${baseURL}/bottles/${bottle_id}`);
        const data = await res.json();
        return data.data.quantity;
    } catch (err) {
        console.error("Error fetching bottle stock:", err);
        return null;
    }
}
