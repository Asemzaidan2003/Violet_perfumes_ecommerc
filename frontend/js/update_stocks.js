import { getOilStock , getBottleStock } from "./getStocks.js";
const baseURL = "/api";
// ponytail: client-side read-then-write clamps at 0; replaced by the server-side atomic inventory engine (docs/superpowers/specs/2026-09-22-inventory-stock-engine-design.md)
export async function updateOilStock(oil_id , add_quantity) {
  try {
    const currentStock = await getOilStock(oil_id);
    const res = await fetch(`${baseURL}/oils/${oil_id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ oil_quantity: Math.max(0, currentStock + add_quantity) }),
    });
    const data = await res.json();
    return data;
  } catch (err) {
    console.error("Error updating oil stock:", err);
  }
}

export async function updateAlcoholStock(add_quantity) {
    try {
        const listRes = await fetch(`${baseURL}/alcohols`);
        const list = await listRes.json();
        const alcohol = list[0];
        const res = await fetch(`${baseURL}/alcohols/${alcohol._id}`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ quantity: Math.max(0, alcohol.quantity + add_quantity) }),
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
        body: JSON.stringify({ quantity: Math.max(0, currentStock + add_quantity) }),
        });
        const data = await res.json();
        return data;
    } catch (err) {
        console.error("Error updating bottle stock:", err);
    }
}
