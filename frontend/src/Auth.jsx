import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "./api";

const FEATURES = [
  {
    icon: "◈",
    title: "See if your allocation makes sense",
    desc: "Before putting real money in, check if your chosen stocks are actually diversified or just correlated bets.",
  },
  {
    icon: "⬡",
    title: "Backtest on real NSE history",
    desc: "See exactly how your portfolio would have performed over the last 6 months, 1 year, or 2 years.",
  },
  {
    icon: "◉",
    title: "Save and compare portfolios",
    desc: "Save multiple allocations and come back to them. Your analysis is stored and tied to your account.",
  },
];

export default function Auth({ mode, onAuth }) {
  const [isLogin, setIsLogin] = useState(mode === "login");
  const [name, setName]       = useState("");
  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  const submit = async () => {
    setError("");
    if (!email || !password) { setError("Please fill in all fields."); return; }
    if (!isLogin && !name)   { setError("Please enter your name."); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }

    setLoading(true);
    try {
      const endpoint = isLogin ? "/auth/login" : "/auth/register";
      const payload  = isLogin
        ? { email, password }
        : { name, email, password };

      const res = await api.post(endpoint, payload);
      const { token, user } = res.data;

      // Persist to localStorage so refresh keeps session alive
      localStorage.setItem("pl_token", token);
      localStorage.setItem("pl_user", JSON.stringify(user));

      onAuth(user);
      nav("/dashboard");
    } catch (e) {
      setError(e.response?.data?.detail || "Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  return (
    <div className="auth-page page-enter">
      {/* Left panel */}
      <div className="auth-left">
        <div className="auth-left-stripe" />
        <div className="auth-feature-list">
          <div style={{ marginBottom: 36 }}>
            <div className="auth-logo">
              Portfolio<span>Lens</span>
            </div>
            <div style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.6 }}>
              Plan your NSE investments with real data — before you put money in.
            </div>
          </div>
          {FEATURES.map(f => (
            <div className="auth-feature-item" key={f.title}>
              <div className="auth-feature-icon">{f.icon}</div>
              <div>
                <div className="auth-feature-title">{f.title}</div>
                <div className="auth-feature-desc">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className="auth-right">
        <div className="auth-box">
          <div className="auth-logo">Portfolio<span>Lens</span></div>

          <div className="auth-title">
            {isLogin ? "Welcome back" : "Create your account"}
          </div>
          <div className="auth-sub">
            {isLogin
              ? "Sign in to access your saved portfolios"
              : "Free forever. No credit card needed."}
          </div>

          {error && <div className="auth-error">{error}</div>}

          {!isLogin && (
            <div className="auth-field">
              <label className="auth-label">Full name</label>
              <input
                className="auth-input"
                placeholder="Arjun Sharma"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>
          )}

          <div className="auth-field">
            <label className="auth-label">Email</label>
            <input
              className="auth-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>

          <div className="auth-field">
            <label className="auth-label">Password</label>
            <input
              className="auth-input"
              type="password"
              placeholder="Min. 6 characters"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && submit()}
            />
          </div>

          <button
            className="auth-btn"
            onClick={submit}
            disabled={loading}
            style={{ opacity: loading ? 0.6 : 1 }}
          >
            {loading
              ? (isLogin ? "Signing in..." : "Creating account...")
              : (isLogin ? "Sign in" : "Create account")}
          </button>

          <div className="auth-divider">or</div>

          <div className="auth-switch">
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button onClick={() => { setIsLogin(!isLogin); setError(""); }}>
              {isLogin ? "Sign up free" : "Sign in"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}