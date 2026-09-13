import LandingPage from "./LandingPage";
import AdminPanel from "./AdminPanel";
import LoginPage from "./LoginPage";

export default function App() {
  if (window.location.pathname.startsWith("/login")) return <LoginPage />;
  if (window.location.pathname.startsWith("/dashboard")) return <AdminPanel />;
  return <LandingPage />;
}
