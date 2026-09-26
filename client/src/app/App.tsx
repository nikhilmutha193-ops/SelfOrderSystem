import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AdminHomeRedirect, RequireModule } from "../lib/adminAuth";
import { useSiteBranding } from "../lib/useSiteBranding";
import ErrorBoundary from "../shared/ui/ErrorBoundary";
import PageLoader from "../shared/ui/PageLoader";
import RouteProgress from "../shared/ui/RouteProgress";
import ProtectedRoute from "./ProtectedRoute";
import AppProviders from "./providers";

const Landing = lazy(() => import("../pages/Landing"));
const TableLogin = lazy(() => import("../pages/customer/TableLogin"));
const CustomerDetails = lazy(() => import("../pages/customer/CustomerDetails"));
const Menu = lazy(() => import("../pages/customer/Menu"));
const CustomerInvoice = lazy(() => import("../pages/customer/CustomerInvoice"));

const AdminLogin = lazy(() => import("../pages/admin/AdminLogin"));
const ForgotPassword = lazy(() => import("../pages/admin/ForgotPassword"));
const AdminLayout = lazy(() => import("../pages/admin/AdminLayout"));
const Dashboard = lazy(() => import("../features/dashboard/pages/Dashboard"));
const Categories = lazy(() => import("../pages/admin/Categories"));
const Subcategories = lazy(() => import("../pages/admin/Subcategories"));
const FoodItems = lazy(() => import("../pages/admin/FoodItems"));
const Tables = lazy(() => import("../pages/admin/Tables"));
const QrCodes = lazy(() => import("../pages/admin/QrCodes"));
const AdminKot = lazy(() => import("../features/kitchen/pages/AdminKot"));
const Chefs = lazy(() => import("../pages/admin/Chefs"));
const Orders = lazy(() => import("../features/orders/pages/Orders"));
const OrderDetail = lazy(() => import("../features/orders/pages/OrderDetail"));
const Invoices = lazy(() => import("../features/orders/pages/Invoices"));
const NewOrder = lazy(() => import("../features/orders/pages/NewOrder"));
const RestaurantSettings = lazy(() => import("../pages/admin/RestaurantSettings"));
const ChangePassword = lazy(() => import("../pages/admin/ChangePassword"));
const Team = lazy(() => import("../pages/admin/Team"));
const Awards = lazy(() => import("../pages/admin/Awards"));
const Coupons = lazy(() => import("../pages/admin/Coupons"));
const Reviews = lazy(() => import("../pages/admin/Reviews"));
const Messages = lazy(() => import("../features/chat/pages/Messages"));
const Backup = lazy(() => import("../pages/admin/Backup"));
const Admins = lazy(() => import("../pages/admin/Admins"));
const Analytics = lazy(() => import("../pages/admin/Analytics"));
const AuditLog = lazy(() => import("../pages/admin/AuditLog"));
const LandingPageEditor = lazy(() => import("../pages/admin/LandingPage"));
const NoAccess = lazy(() => import("../pages/admin/NoAccess"));

const ChefLogin = lazy(() => import("../pages/chef/ChefLogin"));
const ChefDashboard = lazy(() => import("../features/kitchen/pages/ChefDashboard"));

export default function App() {
  useSiteBranding();

  return (
    <AppProviders>
      <ErrorBoundary>
        <BrowserRouter>
          <RouteProgress />
          <Suspense fallback={<PageLoader />}>
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
                <Route
                  path="dashboard"
                  element={
                    <RequireModule module="dashboard">
                      <Dashboard />
                    </RequireModule>
                  }
                />
                <Route
                  path="categories"
                  element={
                    <RequireModule module="categories">
                      <Categories />
                    </RequireModule>
                  }
                />
                <Route
                  path="subcategories"
                  element={
                    <RequireModule module="subcategories">
                      <Subcategories />
                    </RequireModule>
                  }
                />
                <Route
                  path="food-items"
                  element={
                    <RequireModule module="foodItems">
                      <FoodItems />
                    </RequireModule>
                  }
                />
                <Route
                  path="tables"
                  element={
                    <RequireModule module="tables">
                      <Tables />
                    </RequireModule>
                  }
                />
                <Route
                  path="qr-codes"
                  element={
                    <RequireModule module="tables">
                      <QrCodes />
                    </RequireModule>
                  }
                />
                <Route
                  path="kot"
                  element={
                    <RequireModule module="kot">
                      <AdminKot />
                    </RequireModule>
                  }
                />
                <Route
                  path="messages"
                  element={
                    <RequireModule module="messages">
                      <Messages />
                    </RequireModule>
                  }
                />
                <Route
                  path="chefs"
                  element={
                    <RequireModule module="chefs">
                      <Chefs />
                    </RequireModule>
                  }
                />
                <Route
                  path="orders"
                  element={
                    <RequireModule module="orders">
                      <Orders />
                    </RequireModule>
                  }
                />
                <Route
                  path="invoices"
                  element={
                    <RequireModule module="orders">
                      <Invoices />
                    </RequireModule>
                  }
                />
                <Route
                  path="orders/:orderId"
                  element={
                    <RequireModule module="orders">
                      <OrderDetail />
                    </RequireModule>
                  }
                />
                <Route
                  path="delivery/new"
                  element={
                    <RequireModule module="orders">
                      <NewOrder />
                    </RequireModule>
                  }
                />
                <Route
                  path="team"
                  element={
                    <RequireModule module="team">
                      <Team />
                    </RequireModule>
                  }
                />
                <Route
                  path="awards"
                  element={
                    <RequireModule module="awards">
                      <Awards />
                    </RequireModule>
                  }
                />
                <Route
                  path="coupons"
                  element={
                    <RequireModule module="coupons">
                      <Coupons />
                    </RequireModule>
                  }
                />
                <Route
                  path="reviews"
                  element={
                    <RequireModule module="reviews">
                      <Reviews />
                    </RequireModule>
                  }
                />
                <Route
                  path="settings"
                  element={
                    <RequireModule module="settings">
                      <RestaurantSettings />
                    </RequireModule>
                  }
                />
                <Route
                  path="backup"
                  element={
                    <RequireModule module="backup">
                      <Backup />
                    </RequireModule>
                  }
                />
                <Route
                  path="landing"
                  element={
                    <RequireModule module="landing">
                      <LandingPageEditor />
                    </RequireModule>
                  }
                />
                <Route
                  path="admins"
                  element={
                    <RequireModule module="admins">
                      <Admins />
                    </RequireModule>
                  }
                />
                <Route
                  path="analytics"
                  element={
                    <RequireModule module="analytics">
                      <Analytics />
                    </RequireModule>
                  }
                />
                <Route
                  path="audit"
                  element={
                    <RequireModule module="audit">
                      <AuditLog />
                    </RequireModule>
                  }
                />
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
          </Suspense>
        </BrowserRouter>
      </ErrorBoundary>
    </AppProviders>
  );
}
