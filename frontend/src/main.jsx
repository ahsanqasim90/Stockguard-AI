import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) { return { error }; }

  componentDidCatch(error, details) {
    console.error("StockGuard interface error", error, details);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <main className="auth-recovery" role="alert">
      <img src="/stockguard-logo.png" alt="StockGuard AI" />
      <h1>StockGuard could not open this screen</h1>
      <p>Your data is safe. Reload the latest interface or start a fresh sign-in session.</p>
      <div>
        <button type="button" onClick={() => window.location.reload()}>Reload app</button>
        <button type="button" className="secondary" onClick={() => {
          localStorage.removeItem("stockguard_session");
          window.location.assign("/login");
        }}>Sign in again</button>
      </div>
    </main>;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppErrorBoundary><App /></AppErrorBoundary>
  </React.StrictMode>,
);
