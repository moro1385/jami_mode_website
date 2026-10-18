import { authReturn } from "@/lib/authReturn";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";

export default function RedirectIfAuthenticated() {
  const location = useLocation();
  const session = useAuthStore((s) => s.session);
  const isAuthenticated = !!session && session.expiresAt > Date.now();
  return isAuthenticated ? <Navigate to={authReturn(location.search)} replace /> : <Outlet />;
}
