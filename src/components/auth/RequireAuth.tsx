import { authPath } from "@/lib/authReturn";
import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";

export default function RequireAuth() {
  const location = useLocation();
  const session = useAuthStore((s) => s.session);
  const user = useAuthStore((s) => s.user);
  const isBootstrapping = useAuthStore((s) => s.isBootstrapping);
  const bootstrap = useAuthStore((s) => s.bootstrap);

  const isAuthenticated = !!session && session.expiresAt > Date.now();

  useEffect(() => {
    if (isAuthenticated && !user) void bootstrap();
  }, [isAuthenticated, user, bootstrap]);

  if (!isAuthenticated) {
    return <Navigate to={authPath("/signin", location.pathname + location.search + location.hash)} replace />;
  }

  if (!user || isBootstrapping) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center bg-[hsl(var(--warm-bg))]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <Outlet />;
}
