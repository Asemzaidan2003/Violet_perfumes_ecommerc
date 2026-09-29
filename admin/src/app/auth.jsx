import { createContext, useContext, useEffect, useMemo } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, setUnauthorizedHandler } from "@/lib/api";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: async () => (await api("/auth/me")).data,
    retry: false,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    setUnauthorizedHandler(() => {
      qc.setQueryData(["me"], null);
      navigate("/login", { replace: true });
    });
  }, [qc, navigate]);

  const value = useMemo(() => ({
    user: me.data ?? null,
    loading: me.isPending,
    async login(username, password) {
      const res = await api("/auth/login", { method: "POST", body: { username, password } });
      qc.setQueryData(["me"], res.data);
    },
    async logout() {
      try { await api("/auth/logout", { method: "POST" }); } finally {
        qc.clear();
        navigate("/login", { replace: true });
      }
    },
  }), [me.data, me.isPending, qc, navigate]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="grid min-h-dvh place-items-center text-muted-foreground" role="status">جارٍ التحميل…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}
