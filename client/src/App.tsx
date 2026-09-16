import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import ErrorBoundary from "./components/ErrorBoundary";
import { useSiteBranding } from "./lib/useSiteBranding";
import { AdminHomeRedirect, RequireModule } from "./lib/adminAuth";

import Landing from "./pages/Landing";
import TableLogin from "./pages/customer/TableLogin";
import CustomerDetails from "./pages/customer/CustomerDetails";
import Menu from "./pages/customer/Menu";
import CustomerInvoice from "./pages/customer/CustomerInvoice";

import AdminLogin from "./pages/admin/AdminLogin";
import ForgotPassword from "./pages/admin/ForgotPassword";
import AdminLayout from "./pages/admin/AdminLayout";
import Dashboard from "./pages/admin/Dashboard";
import Categories from "./pages/admin/Categories";
import Subcategories from "./pages/admin/Subcategories";
import FoodItems from "./pages/admin/FoodItems";
import Tables from "./pages/admin/Tables";
import QrCodes from "./pages/admin/QrCodes";
import AdminKot from "./pages/admin/AdminKot";
import Chefs from "./pages/admin/Chefs";
import Orders from "./pages/admin/Orders";
import OrderDetail from "./pages/admin/OrderDetail";
import NewDeliveryOrder from "./pages/admin/NewDeliveryOrder";
import RestaurantSettings from "./pages/admin/RestaurantSettings";
import ChangePassword from "./pages/admin/ChangePassword";
import Team from "./pages/admin/Team";
import Awards from "./pages/admin/Awards";
import Coupons from "./pages/admin/Coupons";
import Reviews from "./pages/admin/Reviews";
import Messages from "./pages/admin/Messages";
import Backup from "./pages/admin/Backup";
import Admins from "./pages/admin/Admins";
import LandingPageEditor from "./pages/admin/LandingPage";
import NoAccess from "./pages/admin/NoAccess";

import ChefLogin from "./pages/chef/ChefLogin";
import ChefDashboard from "./pages/chef/ChefDashboard";

export default function App() {
  useSiteBranding();

  return (
    <ErrorBoundary>
      <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/order" element={<TableLogin />} />
        <Route
          path="/order/details"
          element={
            <ProtectedRoute role="table" redirectTo="/order">
              <CustomerDetails />
            </ProtectedRoute>
          }
        />
        <Route
          path="/order/menu"
          element={
            <ProtectedRoute role="table" redirectTo="/order">
              <Menu />
            </ProtectedRoute>
          }
        />
        <Route
          path="/order/invoice"
          element={
            <ProtectedRoute role="table" redirectTo="/order">
              <CustomerInvoice />
            </ProtectedRoute>
          }
        />

        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/forgot-password" element={<ForgotPassword />} />
        <Route
          path="/admin"
          element={
            <ProtectedRoute role="admin" redirectTo="/admin/login">
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<AdminHomeRedirect />} />
          <Route path="dashboard" element={<RequireModule module="dashboard"><Dashboard /></RequireModule>} />
          <Route path="categories" element={<RequireModule module="categories"><Categories /></RequireModule>} />
          <Route path="subcategories" element={<RequireModule module="subcategories"><Subcategories /></RequireModule>} />
          <Route path="food-items" element={<RequireModule module="foodItems"><FoodItems /></RequireModule>} />
          <Route path="tables" element={<RequireModule module="tables"><Tables /></RequireModule>} />
          <Route path="qr-codes" element={<RequireModule module="tables"><QrCodes /></RequireModule>} />
          <Route path="kot" element={<RequireModule module="kot"><AdminKot /></RequireModule>} />
          <Route path="messages" element={<RequireModule module="messages"><Messages /></RequireModule>} />
          <Route path="chefs" element={<RequireModule module="chefs"><Chefs /></RequireModule>} />
          <Route path="orders" element={<RequireModule module="orders"><Orders /></RequireModule>} />
          <Route path="orders/:orderId" element={<RequireModule module="orders"><OrderDetail /></RequireModule>} />
          <Route path="delivery/new" element={<RequireModule module="orders"><NewDeliveryOrder /></RequireModule>} />
          <Route path="team" element={<RequireModule module="team"><Team /></RequireModule>} />
          <Route path="awards" element={<RequireModule module="awards"><Awards /></RequireModule>} />
          <Route path="coupons" element={<RequireModule module="coupons"><Coupons /></RequireModule>} />
          <Route path="reviews" element={<RequireModule module="reviews"><Reviews /></RequireModule>} />
          <Route path="settings" element={<RequireModule module="settings"><RestaurantSettings /></RequireModule>} />
          <Route path="backup" element={<RequireModule module="backup"><Backup /></RequireModule>} />
          <Route path="landing" element={<RequireModule module="landing"><LandingPageEditor /></RequireModule>} />
          <Route path="admins" element={<RequireModule module="admins"><Admins /></RequireModule>} />
          <Route path="change-password" element={<ChangePassword />} />
          <Route path="no-access" element={<NoAccess />} />
        </Route>

        <Route path="/chef/login" element={<ChefLogin />} />
        <Route
          path="/chef/dashboard"
          element={
            <ProtectedRoute role="chef" redirectTo="/chef/login">
              <ChefDashboard />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
