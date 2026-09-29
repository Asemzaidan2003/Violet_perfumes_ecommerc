import { useQuery } from "@tanstack/react-query";
import { listOf } from "@/lib/api";

export function useCatalog() {
  const products = useQuery({ queryKey: ["pos", "products"], queryFn: listOf("/products"), staleTime: 60_000 });
  const bottles = useQuery({ queryKey: ["pos", "bottles"], queryFn: listOf("/bottles"), staleTime: 0 });
  const customers = useQuery({ queryKey: ["pos", "customers"], queryFn: listOf("/customers"), staleTime: 60_000 });
  return {
    products: products.data ?? [],
    bottles: bottles.data ?? [],
    customers: customers.data ?? [],
    loading: products.isPending || bottles.isPending,
    error: (!products.data && products.error) || (!bottles.data && bottles.error) || null,
    refetch: () => { products.refetch(); bottles.refetch(); },
    refetchBottles: bottles.refetch,
    refetchCustomers: customers.refetch,
  };
}
