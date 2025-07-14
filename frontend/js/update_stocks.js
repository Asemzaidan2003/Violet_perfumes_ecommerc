import { getOilStock , getBottleStock , getAlcoholStock } from "./getStocks.js";
const baseURL = "http://localhost:5000/api";
export async function updateOilStock(oil_id , add_quantity) {
  try {
    const currentStock = await getOilStock(oil_id);
    const res = await fetch(`${baseURL}/oils/${oil_id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ oil_quantity: currentStock+add_quantity }),
    });
    const data = await res.json();
    return data;
  } catch (err) {
    console.error("Error updating oil stock:", err);
  }
}

export async function updateAlcoholStock(add_quantity) {
    const currentStock = await getAlcoholStock();
    try {
        const res = await fetch(`${baseURL}/alcohols`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ quantity: currentStock + add_quantity }),
        });
        const data = await res.json();
        return data;
    } catch (err) {
        console.error("Error updating alcohol stock:", err);
    }
}

export async function updateBottleStock(bottle_id , add_quantity) {
    const currentStock = await getBottleStock(bottle_id);
    try {
        const res = await fetch(`${baseURL}/bottles/${bottle_id}`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ quantity: currentStock + add_quantity }),
        });
        const data = await res.json();
        return data;
    } catch (err) {
        console.error("Error updating bottle stock:", err);
    }
}
