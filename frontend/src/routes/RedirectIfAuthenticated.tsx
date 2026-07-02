import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

/**
 * Wraps public-only routes ("/", "/login"). Renders its children
 * immediately regardless of "loading" — a visitor reading the landing
 * page or filling in the login form should never be blocked behind an
 * auth-check spinner, that's app-loading state and irrelevant to them.
 * Only acts once status actually resolves to "authenticated", at which
 * point it redirects to /app instead of letting them see the landing
 * page or login form again.
 */
export default function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);

  if (status === "authenticated") {
    return <Navigate to="/app" replace />;
  }

  return <>{children}</>;
}
