import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export const SETTINGS_KEY = ["settings"];
const inFlight = new WeakSet();

// PUT a partial patch; on success the returned full object replaces the cached one. A second call while one is
// running is ignored (returns null); a failure throws the ApiError and leaves the cache untouched.
export async function putSettings(qc, patch, request = api) {
  if (inFlight.has(qc)) return null;
  inFlight.add(qc);
  try {
    const body = await request("/settings", { method: "PUT", body: patch });
    qc.setQueryData(SETTINGS_KEY, body.data);
    return body.data;
  } finally {
    inFlight.delete(qc);
  }
}

// One shared query for the settings and storefront pages. `save` stays unusable until the first load succeeded, so a
// failed load can never be saved over with client defaults.
export function useSettings() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: SETTINGS_KEY, queryFn: async () => (await api("/settings")).data, staleTime: 0, refetchOnMount: "always", retry: false });
  const save = useCallback((patch) => putSettings(qc, patch), [qc]);
  return { settings: q.data, loading: q.isPending, error: q.error, refetch: q.refetch, save, ready: q.isSuccess };
}
