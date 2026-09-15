import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";

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

import ChefLogin from "./pages/chef/ChefLogin";
import ChefDashboard from "./pages/chef/ChefDashboard";

export default function App() {
  return (
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
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="categories" element={<Categories />} />
          <Route path="subcategories" element={<Subcategories />} />
          <Route path="food-items" element={<FoodItems />} />
          <Route path="tables" element={<Tables />} />
          <Route path="qr-codes" element={<QrCodes />} />
          <Route path="kot" element={<AdminKot />} />
          <Route path="messages" element={<Messages />} />
          <Route path="chefs" element={<Chefs />} />
          <Route path="orders" element={<Orders />} />
          <Route path="orders/:orderId" element={<OrderDetail />} />
          <Route path="delivery/new" element={<NewDeliveryOrder />} />
          <Route path="team" element={<Team />} />
          <Route path="awards" element={<Awards />} />
          <Route path="coupons" element={<Coupons />} />
          <Route path="reviews" element={<Reviews />} />
          <Route path="settings" element={<RestaurantSettings />} />
          <Route path="backup" element={<Backup />} />
          <Route path="change-password" element={<ChangePassword />} />
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
  );
}
