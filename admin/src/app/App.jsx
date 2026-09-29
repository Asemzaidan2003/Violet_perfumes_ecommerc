import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, RequireAuth } from "@/app/auth";
import LoginPage from "@/pages/Login";
import NotFound from "@/pages/NotFound";

const Shell = () => <Outlet />; // replaced in Task 5
const PosPage = () => <div className="p-6">نقطة البيع</div>; // replaced in Task 8

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } } });

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename="/admin">
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<RequireAuth />}>
              <Route element={<Shell />}>
                <Route index element={<Navigate to="/pos" replace />} />
                <Route path="/pos" element={<PosPage />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Route>
          </Routes>
        </AuthProvider>
        <Toaster position="top-center" dir="rtl" richColors closeButton />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
