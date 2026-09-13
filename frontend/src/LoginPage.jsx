import { useState } from "react";
import { ArrowRight, BrainCircuit, Eye, EyeOff, LockKeyhole, ShieldCheck, TrendingUp } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("demo@stockguard.ai");
  const [password, setPassword] = useState("StockGuard2026!");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  function submit(event) {
    event.preventDefault();
    if (!email.includes("@") || password.length < 6) {
      setError("Enter a valid email and a password with at least 6 characters.");
      return;
    }
    localStorage.setItem("stockguard_session", JSON.stringify({ email, name: "Ahsan Qasim", role: "Admin" }));
    window.location.assign("/dashboard");
  }

  return <div className="login-page">
    <section className="login-story">
      <a className="login-logo" href="/"><span><img src="/stockguard-logo.png" alt="" /></span><b>StockGuard <em>AI</em></b></a>
      <div className="login-story-copy">
        <p className="kicker">AI demand intelligence</p>
        <h1>Welcome back to smarter inventory planning.</h1>
        <p>Sign in to inspect forecasts, monitor stock risk and turn model output into practical actions.</p>
        <div className="login-proof"><BrainCircuit /><span><b>Production model ready</b><small>XGBoost v1.0.0 · 11,626 series</small></span></div>
        <div className="login-proof"><TrendingUp /><span><b>Validated performance</b><small>12.72% MAE improvement over baseline</small></span></div>
        <div className="login-proof"><ShieldCheck /><span><b>Protected workspace</b><small>Role-based access foundation enabled</small></span></div>
      </div>
      <small>StockGuard AI · Lahore Garrison University</small>
    </section>
    <section className="login-form-side">
      <form className="login-form" onSubmit={submit}>
        <div className="login-lock"><LockKeyhole size={22} /></div>
        <p className="kicker">Secure workspace</p><h2>Sign in</h2><p>Access the StockGuard administration panel.</p>
        <label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>Password<div className="password-field"><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label="Show password">{showPassword ? <EyeOff /> : <Eye />}</button></div></label>
        <div className="remember-row"><label><input type="checkbox" defaultChecked /> Remember me</label><button type="button">Forgot password?</button></div>
        {error && <div className="form-error">{error}</div>}
        <button className="login-submit" type="submit">Sign in <ArrowRight size={17} /></button>
        <div className="demo-box"><b>Demo access</b><span>demo@stockguard.ai</span><span>StockGuard2026!</span></div>
        <p className="oauth-note">Google and Microsoft sign-in will be added after the core authentication API.</p>
      </form>
    </section>
  </div>;
}
