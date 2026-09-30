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
import ProductsPage from "@/pages/products/ProductsPage";
import ProductFormPage from "@/pages/products/ProductFormPage";
import OilsPage from "@/pages/oils/OilsPage";
import OilFormPage from "@/pages/oils/OilFormPage";
import BottlesPage from "@/pages/bottles/BottlesPage";
import BottleFormPage from "@/pages/bottles/BottleFormPage";
import AlcoholPage from "@/pages/alcohol/AlcoholPage";
import BrandsPage from "@/pages/brands/BrandsPage";
import CategoriesPage from "@/pages/categories/CategoriesPage";
import CatalogPage from "@/pages/catalog/CatalogPage";
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
                <Route path="/products" element={<ProductsPage />} />
                <Route path="/products/new" element={<ProductFormPage />} />
                <Route path="/products/:id/edit" element={<ProductFormPage />} />
                <Route path="/oils" element={<OilsPage />} />
                <Route path="/oils/new" element={<OilFormPage />} />
                <Route path="/oils/:id/edit" element={<OilFormPage />} />
                <Route path="/bottles" element={<BottlesPage />} />
                <Route path="/bottles/new" element={<BottleFormPage />} />
                <Route path="/bottles/:id/edit" element={<BottleFormPage />} />
                <Route path="/alcohol" element={<AlcoholPage />} />
                <Route path="/brands" element={<BrandsPage />} />
                <Route path="/categories" element={<CategoriesPage />} />
                <Route path="/catalog" element={<CatalogPage />} />
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
