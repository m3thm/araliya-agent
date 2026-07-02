import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

/**
 * Wraps the protected app route ("/app"). Unlike RedirectIfAuthenticated,
 * this one DOES wait out "loading" — there's no safe content to show for
 * an unauthenticated visitor here, so a brief loading state while the
 * session check resolves is correct, not a flash to avoid.
 */
export default function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <p className="text-sm text-ink/50">Loading…</p>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
