import { useState } from "react";
import { ArrowRight, BrainCircuit, Eye, EyeOff, LockKeyhole, ShieldCheck, TrendingUp } from "lucide-react";

import { login, register } from "./auth";

export default function LoginPage() {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", businessName: "", email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const field = (name) => ({ value: form[name], onChange: (event) => setForm({ ...form, [name]: event.target.value }) });

  async function submit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "register") await register(form);
      else await login({ email: form.email, password: form.password });
      window.location.assign("/dashboard");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  function changeMode(nextMode) {
    setMode(nextMode);
    setError("");
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
        <div className="login-proof"><ShieldCheck /><span><b>Protected workspace</b><small>JWT authentication and role-based access</small></span></div>
      </div>
      <small>StockGuard AI · Lahore Garrison University</small>
    </section>
    <section className="login-form-side">
      <form className="login-form" onSubmit={submit}>
        <div className="login-lock"><LockKeyhole size={22} /></div>
        <div className="auth-mode" aria-label="Account action">
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => changeMode("login")}>Sign in</button>
          <button type="button" className={mode === "register" ? "active" : ""} onClick={() => changeMode("register")}>Create account</button>
        </div>
        <p className="kicker">Secure workspace</p>
        <h2>{mode === "register" ? "Create your workspace" : "Sign in"}</h2>
        <p>{mode === "register" ? "Register the business owner and create an isolated StockGuard workspace." : "Access the StockGuard administration panel."}</p>
        {mode === "register" && <>
          <label>Full name<input required minLength="2" autoComplete="name" {...field("name")} /></label>
          <label>Business name<input required minLength="2" autoComplete="organization" {...field("businessName")} /></label>
        </>}
        <label>Email address<input required type="email" autoComplete="email" {...field("email")} /></label>
        <label>Password<div className="password-field"><input required minLength="8" autoComplete={mode === "register" ? "new-password" : "current-password"} type={showPassword ? "text" : "password"} {...field("password")} /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label="Show password">{showPassword ? <EyeOff /> : <Eye />}</button></div></label>
        {mode === "login" && <div className="remember-row"><label><input type="checkbox" defaultChecked /> Remember me</label><button type="button">Forgot password?</button></div>}
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="login-submit" type="submit" disabled={loading}>{loading ? "Please wait…" : mode === "register" ? "Create account" : "Sign in"} {!loading && <ArrowRight size={17} />}</button>
        <div className="demo-box"><b>MongoDB-backed access</b><span>{mode === "register" ? "Create the first owner account after Atlas is connected." : "Use the account you registered for this business."}</span></div>
        <p className="oauth-note">Google and Microsoft sign-in will be added after the core application workflow.</p>
      </form>
    </section>
  </div>;
}
