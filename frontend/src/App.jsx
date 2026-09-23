import { useEffect, useState } from "react";
import LandingPage from "./LandingPage";
import AdminPanel from "./AdminPanel";
import LoginPage from "./LoginPage";
import InvitePage from "./InvitePage";
import ResetPasswordPage from "./ResetPasswordPage";
import { loadCurrentUser } from "./auth";

function ProtectedDashboard() {
  const [state, setState] = useState({ loading: true, user: null });
  useEffect(() => {
    loadCurrentUser().then((user) => setState({ loading: false, user })).catch(() => window.location.replace("/login"));
  }, []);
  if (state.loading) return <div className="auth-loading"><span />Checking your secure session…</div>;
  return <AdminPanel currentUser={state.user} />;
}

export default function App() {
  if (window.location.pathname.startsWith("/invite/")) return <InvitePage />;
  if (window.location.pathname.startsWith("/reset-password/")) return <ResetPasswordPage />;
  if (window.location.pathname.startsWith("/login")) return <LoginPage />;
  if (window.location.pathname.startsWith("/dashboard")) return <ProtectedDashboard />;
  return <LandingPage />;
}
