import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { api, listOf } from "@/lib/api";

export const ORDERS_KEY = ["orders"];

export function useOrders() {
  const qc = useQueryClient();
  const orders = useQuery({ queryKey: ORDERS_KEY, queryFn: listOf("/orders"), staleTime: 0 });
  const customers = useQuery({ queryKey: ["orders", "customers"], queryFn: listOf("/customers"), staleTime: 60_000 });
  const customersById = useMemo(() => Object.fromEntries((customers.data ?? []).map((c) => [c._id, c])), [customers.data]);
  return {
    orders: orders.data ?? [],
    customersById,
    loading: orders.isPending || customers.isPending,
    error: (!orders.data && orders.error) || (!customers.data && customers.error) || null,
    refetch: () => { orders.refetch(); customers.refetch(); },
    // PUT /orders/:id {status}; resolves with the saved order and patches the cached list. Rejects with the server's ApiError.
    async updateStatus(id, status) {
      const saved = (await api(`/orders/${id}`, { method: "PUT", body: { status } })).data;
      qc.setQueryData(ORDERS_KEY, (old) => (old ?? []).map((o) => (o._id === id ? { ...o, ...saved } : o)));
      qc.invalidateQueries({ queryKey: ["pending-count"] });
      return saved;
    },
  };
}
