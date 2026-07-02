import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AuthScreen from "./components/Auth/AuthScreen";
import LandingPage from "./pages/LandingPage";
import ChatApp from "./pages/ChatApp";
import RequireAuth from "./routes/RequireAuth";
import RedirectIfAuthenticated from "./routes/RedirectIfAuthenticated";
import { useAuthStore } from "./store/authStore";

export default function App() {
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <RedirectIfAuthenticated>
              <LandingPage />
            </RedirectIfAuthenticated>
          }
        />
        <Route
          path="/login"
          element={
            <RedirectIfAuthenticated>
              <AuthScreen />
            </RedirectIfAuthenticated>
          }
        />
        <Route
          path="/app"
          element={
            <RequireAuth>
              <ChatApp />
            </RequireAuth>
          }
        />
        {/* Anything else bounces to "/", which itself redirects on to
            /app for anyone already signed in via RedirectIfAuthenticated. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}