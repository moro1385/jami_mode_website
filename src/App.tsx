import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Layout from "@/components/Layout";
import Index from "./pages/Index";
import Shop from "./pages/Shop";
import About from "./pages/About";
import Contact from "./pages/Contact";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsAndConditions from "./pages/TermsAndConditions";
import SizeGuide from "./pages/SizeGuide";
import ReturnPolicy from "./pages/ReturnPolicy";
import Wholesale from "./pages/Wholesale";
import StoreAddress from "./pages/StoreAddress";
import FAQ from "./pages/FAQ";
import OrderTracking from "./pages/OrderTracking";

import Cart from "./pages/Cart";
import ProductDetail from "./pages/ProductDetail";
import CoreCollection from "./pages/CoreCollection";
import SetsAndPairs from "./pages/SetsAndPairs";
import RequireAuth from "./components/auth/RequireAuth";
import RedirectIfAuthenticated from "./components/auth/RedirectIfAuthenticated";
import RequireAdmin from "./components/auth/RequireAdmin";
import NotFound from "./pages/NotFound";
import CartSync from "./components/CartSync";
import { CatalogCacheBridge } from "@/features/catalog/presentation/CatalogCacheBridge";

const SignIn = lazy(() => import("./pages/SignIn"));
const SignUp = lazy(() => import("./pages/SignUp"));
const OtpRequest = lazy(() => import("./pages/OtpRequest"));
const OtpVerify = lazy(() => import("./pages/OtpVerify"));
const PersonalInformation = lazy(() => import("./pages/account/PersonalInformation"));
const Addresses = lazy(() => import("./pages/account/Addresses"));
const Wallet = lazy(() => import("./pages/account/Wallet"));
const Orders = lazy(() => import("./pages/account/Orders"));
const Messages = lazy(() => import("./pages/account/Messages"));
const ReturnRequest = lazy(() => import("./pages/account/ReturnRequest"));
const WalletVerify = lazy(() => import("./pages/account/WalletVerify"));
const CheckoutAddress = lazy(() => import("./pages/checkout/CheckoutAddress"));
const CheckoutPayment = lazy(() => import("./pages/checkout/CheckoutPayment"));
const CheckoutVerify = lazy(() => import("./pages/checkout/CheckoutVerify"));
const CheckoutSuccess = lazy(() => import("./pages/checkout/CheckoutSuccess"));
const CheckoutFailed = lazy(() => import("./pages/checkout/CheckoutFailed"));
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminProducts = lazy(() => import("./pages/admin/AdminProducts"));
const AdminOrders = lazy(() => import("./pages/admin/AdminOrders"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminTickets = lazy(() => import("./pages/admin/AdminTickets"));
const AdminMessages = lazy(() => import("./pages/admin/AdminMessages"));
const AdminReturnRequests = lazy(() => import("./pages/admin/AdminReturnRequests"));

const queryClient = new QueryClient();

const App = () => {
  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <CatalogCacheBridge />
        <CartSync />
        <TooltipProvider>
        <Toaster />
        <Sonner position="top-center" />
        <BrowserRouter>
          <Suspense fallback={<div className="flex justify-center items-center h-screen"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>}>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Index />} />
              <Route path="/shop" element={<Shop />} />
              <Route path="/about" element={<About />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<TermsAndConditions />} />
              <Route path="/size-guide" element={<SizeGuide />} />
              <Route path="/return-policy" element={<ReturnPolicy />} />
              <Route path="/wholesale" element={<Wholesale />} />
              <Route path="/address" element={<StoreAddress />} />
              <Route path="/faq" element={<FAQ />} />
              <Route path="/order-tracking" element={<OrderTracking />} />

              <Route path="/cart" element={<Cart />} />
              <Route path="/product/:slug" element={<ProductDetail />} />
              <Route path="/collections/core" element={<CoreCollection />} />
              <Route path="/collections/sets-and-pairs" element={<SetsAndPairs />} />

              <Route element={<RedirectIfAuthenticated />}>
                <Route path="/signin" element={<SignIn />} />
                <Route path="/signin/otp" element={<OtpRequest />} />
                <Route path="/signin/otp/verify" element={<OtpVerify />} />
                <Route path="/signup" element={<SignUp />} />
              </Route>

              <Route element={<RequireAuth />}>
                <Route path="/account" element={<PersonalInformation />} />
                <Route path="/account/addresses" element={<Addresses />} />
                <Route path="/account/wallet" element={<Wallet />} />
                <Route path="/account/wallet/verify" element={<WalletVerify />} />
                <Route path="/account/orders" element={<Orders />} />
                <Route path="/account/messages" element={<Messages />} />
                <Route path="/account/returns/new" element={<ReturnRequest />} />
                <Route path="/checkout" element={<CheckoutAddress />} />
                <Route path="/checkout/payment" element={<CheckoutPayment />} />
                <Route path="/checkout/verify" element={<CheckoutVerify />} />
                <Route path="/checkout/success" element={<CheckoutSuccess />} />
                <Route path="/checkout/failed" element={<CheckoutFailed />} />
              </Route>
            </Route>

            <Route element={<RequireAdmin />}>
              <Route element={<AdminLayout />}>
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/admin/products" element={<AdminProducts />} />
                <Route path="/admin/orders" element={<AdminOrders />} />
                <Route path="/admin/users" element={<AdminUsers />} />
                <Route path="/admin/tickets" element={<AdminTickets />} />
                <Route path="/admin/messages" element={<AdminMessages />} />
                <Route path="/admin/return-requests" element={<AdminReturnRequests />} />
              </Route>
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
    </HelmetProvider>
  );
};

export default App;
