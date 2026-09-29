import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, RequireAuth } from "@/app/auth";
import LoginPage from "@/pages/Login";
import NotFound from "@/pages/NotFound";
import Shell from "@/app/Shell";
import PosPage from "@/pages/pos/PosPage";
import OrdersPage from "@/pages/orders/OrdersPage";
import OrderDetailsPage from "@/pages/orders/OrderDetailsPage";
import InterestsPage from "@/pages/interests/InterestsPage";
import ReportsPage from "@/pages/reports/ReportsPage";
import DashboardPage from "@/pages/dashboard/DashboardPage";

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
                <Route path="/orders" element={<OrdersPage />} />
                <Route path="/orders/:id" element={<OrderDetailsPage />} />
                <Route path="/interests" element={<InterestsPage />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/reports" element={<ReportsPage />} />
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
