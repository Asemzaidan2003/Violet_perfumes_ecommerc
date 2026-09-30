import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { waitForGuardClear } from "@/lib/backGuard";

// Body fields for a stock edit: an absolute quantity (only when it changed) or an increment, never both —
// the server discards an absolute quantity sent with add_quantity, so an increment wins.
export function quantityUpdate(field, loaded, qty, add) {
  if (typeof add === "number" && add > 0) return { add_quantity: add };
  if (typeof qty === "number" && qty !== loaded) return { [field]: qty };
  return {};
}

// Runs a save, toasts, waits for the back-guard sentinel to clear, then leaves the form (saving stays true so the
// unsaved-change guard does not prompt). onError(e) may return true when it handled the failure inline.
export function useFormSave(backTo) {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  async function run(action, message, onError) {
    setSaving(true);
    try {
      await action();
      toast.success(message);
      await waitForGuardClear(window);
      navigate(backTo, { replace: true });
    } catch (e) {
      setSaving(false);
      if (!onError?.(e)) toast.error(e instanceof ApiError ? e.message : "تعذّر الاتصال بالخادم");
    }
  }
  return { saving, run };
}

export const money = (n) => (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
