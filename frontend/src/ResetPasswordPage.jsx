import { useEffect, useState } from "react";
import { CheckCircle2, Eye, EyeOff, LockKeyhole } from "lucide-react";

import { inspectPasswordReset, resetPassword } from "./auth";

export default function ResetPasswordPage() {
  const token = decodeURIComponent(window.location.pathname.split("/").filter(Boolean).at(-1) || "");
  const [state, setState] = useState({ loading: true, reset: null, error: "" });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    inspectPasswordReset(token).then(({ reset }) => setState({ loading: false, reset, error: "" }))
      .catch((error) => setState({ loading: false, reset: null, error: error.message }));
  }, [token]);

  async function submit(event) {
    event.preventDefault();
    if (password !== confirm) return setState((old) => ({ ...old, error: "Passwords do not match." }));
    setBusy(true); setState((old) => ({ ...old, error: "" }));
    try { await resetPassword(token, password); setComplete(true); }
    catch (error) { setState((old) => ({ ...old, error: error.message })); }
    finally { setBusy(false); }
  }

  return <div className="login-page"><section className="login-story"><a className="login-logo" href="/"><span><img src="/stockguard-logo.png" alt="" /></span><b>StockGuard <em>AI</em></b></a><div className="login-story-copy"><p className="kicker">Account recovery</p><h1>Restore access securely.</h1><p>Reset links are single use, expire after 30 minutes, and invalidate existing sessions when the password changes.</p></div><small>StockGuard AI · Secure workspace</small></section><section className="login-form-side"><form className="login-form" onSubmit={submit}><div className="login-lock"><LockKeyhole size={22}/></div><p className="kicker">Password reset</p>{state.loading ? <><h2>Checking link…</h2><p>Please wait while StockGuard verifies this reset request.</p></> : complete ? <><CheckCircle2 className="reset-success-icon"/><h2>Password updated</h2><p>Your previous sessions have been closed. You can now sign in with the new password.</p><a className="login-submit" href="/login">Continue to sign in</a></> : state.reset ? <><h2>Choose a new password</h2><p>Resetting {state.reset.email}. This link expires {new Date(state.reset.expiresAt).toLocaleString()}.</p><label>New password<div className="password-field"><input required minLength="8" maxLength="128" autoComplete="new-password" type={show ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)}/><button type="button" onClick={() => setShow(!show)} aria-label="Show password">{show ? <EyeOff/> : <Eye/>}</button></div></label><label>Confirm password<input required minLength="8" maxLength="128" autoComplete="new-password" type={show ? "text" : "password"} value={confirm} onChange={(event) => setConfirm(event.target.value)}/></label>{state.error && <div className="form-error" role="alert">{state.error}</div>}<button className="login-submit" type="submit" disabled={busy}>{busy ? "Updating…" : "Update password"}</button></> : <><h2>Reset link unavailable</h2><div className="form-error" role="alert">{state.error}</div><a className="login-submit" href="/login">Request a new link</a></>}</form></section></div>;
}
