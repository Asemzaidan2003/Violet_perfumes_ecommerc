import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { normalizePhone } from "@store-shared/phone.js";
import { api, ApiError } from "@/lib/api";
import { buildOrderBody, cartProblems } from "@/lib/cart";

export function useCheckout({ cart, bottles, customer, payment, onCustomerCreated, onDone }) {
  const qc = useQueryClient();
  const [attempted, setAttempted] = useState(false);
  // A ref, not mutation.isPending: a fast double tap fires before React re-renders with the pending state.
  const inFlight = useRef(false);

  const mutation = useMutation({
    // "always": offline must fail at once with a message, not pause and then fire the order by itself on reconnect.
    networkMode: "always",
    // The snapshot is passed as variables (taken from the render that ran submit), so the request never depends on when the mutation options are refreshed.
    mutationFn: async ({ cart, customer, payment }) => {
      let customerId;
      if (customer.mode === "existing") {
        customerId = customer.customer._id;
      } else {
        const phone = normalizePhone(customer.phone);
        if (phone) {
          const found = await api(`/customers/phone/${encodeURIComponent(phone)}`);
          if (found.customer?._id) {
            customerId = found.customer._id;
            // The typed name is not used: show who the sale went to instead of attaching silently.
            onCustomerCreated(found.customer);
            toast.info(`الرقم مسجّل باسم ${found.customer.name}`);
          }
        }
        if (!customerId) {
          const created = await api("/customers", { method: "POST", body: { name: customer.name.trim(), ...(phone ? { phone } : {}) } });
          customerId = created._id;
          // From here the customer exists: show it as existing so a failed order can be retried without creating a duplicate.
          onCustomerCreated(created);
          qc.invalidateQueries({ queryKey: ["pos", "customers"] });
        }
      }
      const res = await api("/orders", { method: "POST", body: buildOrderBody(cart, customerId, payment) });
      return { order: res.data, shortages: res.shortages ?? [] };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["pos", "bottles"] });
      qc.invalidateQueries({ queryKey: ["pos", "customers"] });
      qc.invalidateQueries({ queryKey: ["pending-count"] });
      onDone(result);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "تعذّر الاتصال بالخادم — تحقّق من قائمة الطلبات قبل إعادة المحاولة"),
    onSettled: () => { inFlight.current = false; },
  });

  function submit() {
    if (inFlight.current) return;
    setAttempted(true);
    if (cart.length === 0) return toast.error("السلة فارغة");
    const problems = cartProblems(cart, bottles);
    if (problems.length) return toast.error(problems[0].message);
    if (customer.mode === "none") return toast.error("اختر زبونًا أو أضف زبونًا جديدًا");
    if (customer.mode === "new" && !customer.name.trim()) return toast.error("أدخل اسم الزبون الجديد");
    inFlight.current = true;
    mutation.mutate({ cart, customer, payment });
  }

  return { submit, pending: mutation.isPending, attempted, reset: () => setAttempted(false) };
}
