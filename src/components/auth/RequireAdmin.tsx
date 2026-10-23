import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { authService } from "@/features/auth/auth";

export default function RequireAdmin() {
  const location = useLocation();
  const session = useAuthStore((s) => s.session);
  const user = useAuthStore((s) => s.user);
  const isBootstrapping = useAuthStore((s) => s.isBootstrapping);
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const [role, setRole] = useState<{ userId: string; token: string; allowed: boolean } | null>(null);
  const isAuthenticated = !!session && session.expiresAt > Date.now();
  const userId = user?.id;
  const sessionUserId = session?.userId;
  const token = session?.token;
  const accountMatches = !!userId && userId === sessionUserId;

  useEffect(() => {
    if (isAuthenticated && !accountMatches) void bootstrap();
  }, [isAuthenticated, accountMatches, bootstrap]);

  useEffect(() => {
    let current = true;
    setRole(null);
    if (isAuthenticated && accountMatches && !isBootstrapping && userId && token) {
      void (async () => {
        let allowed = false;
        try {
          allowed = await authService.isAdmin(userId);
        } catch {
          // A failed role check stays closed; never reuse another account's result.
        }
        if (current) setRole({ userId, token, allowed });
      })();
    }
    return () => { current = false; };
  }, [isAuthenticated, accountMatches, isBootstrapping, userId, token]);

  if (!isAuthenticated && !isBootstrapping) {
    return <Navigate to="/signin" state={{ from: location.pathname }} replace />;
  }
  if (!accountMatches || isBootstrapping || !role || role.userId !== userId || role.token !== token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--warm-bg))]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!role.allowed) return <Navigate to="/" replace />;
  return <Outlet />;
}
