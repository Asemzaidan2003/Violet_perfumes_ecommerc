import { useQuery } from "@tanstack/react-query";
import { listOf } from "@/lib/api";

const opts = (key, path) => ({ queryKey: [key], queryFn: listOf(path), refetchOnMount: "always", retry: false });

// The product form renders only after all three lists have settled (legacy edit raced the brand list and wiped the brand).
export function useProductLookups() {
  const cats = useQuery(opts("categories", "/categories"));
  const brands = useQuery(opts("brands", "/brands"));
  const oils = useQuery(opts("oils", "/oils"));
  const all = [cats, brands, oils];
  return {
    categories: cats.data ?? [],
    brands: brands.data ?? [],
    oils: oils.data ?? [],
    loading: all.some((q) => q.isFetching || q.isPending), // the page latches this after the first settle
    error: all.some((q) => q.isError),
    refetch: () => all.forEach((q) => q.isError && q.refetch()),
  };
}
