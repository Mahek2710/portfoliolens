import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll(".reveal");
    const io = new IntersectionObserver(
      entries =>
        entries.forEach(e => {
          if (e.isIntersecting) {
            e.target.classList.add("visible");
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.1 }
    );
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);
}

export default function Landing() {
  const nav = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  useReveal();

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <div className="page-enter">
      {/* Nav */}
      <nav className={`land-nav ${scrolled ? "scrolled" : ""}`}>
        <div className="land-logo" onClick={() => nav("/")} 
  style={{cursor:"pointer"}}>Portfolio<span>Lens</span></div>
        <div className="land-nav-links">
          <button className="land-nav-link" onClick={() => nav("/login")}>Sign in</button>
          <button className="land-nav-cta" onClick={() => nav("/signup")}>Get started</button>
        </div>
      </nav>

      {/* Hero */}
      <section className="land-hero">
        <div className="hero-noise" />
        <div className="hero-badge">
          <div className="hero-badge-dot" />
          Live NSE market data
        </div>
        <h1 className="hero-title">
          Institutional-grade<br />
          <em>portfolio analytics</em>
        </h1>
        <p className="hero-sub">
          Compute risk metrics, simulate rebalancing strategies, and track
          portfolio performance — the way professional fund managers do it.
        </p>
        <div className="hero-actions">
          <button className="btn-primary" onClick={() => nav("/signup")}>Start for free</button>
          <button className="btn-ghost"   onClick={() => nav("/login")}>Sign in</button>
        </div>

        {/* Stats */}
        <div className="hero-stats">
          {[
            { val: "20",   label: "NSE Stocks" },
            { val: "7",    label: "Risk Metrics" },
            { val: "3",    label: "Rebalancing Strategies" },
            { val: "Live", label: "Market Data" },
          ].map(s => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div className="hero-stat-val">{s.val}</div>
              <div className="hero-stat-label">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Preview mockup */}
        <div className="hero-preview reveal">
          <div className="preview-bar">
            <div className="preview-dot" style={{ background: "#f87171" }} />
            <div className="preview-dot" style={{ background: "#fbbf24" }} />
            <div className="preview-dot" style={{ background: "#34d399" }} />
          </div>
          <div className="preview-inner">
            {[
              { label: "Annualised Return", val: "-12.4%", color: "var(--red)"  },
              { label: "Sharpe Ratio",      val: "-1.44",  color: "var(--red)"  },
              { label: "Max Drawdown",      val: "-18.3%", color: "var(--red)"  },
              { label: "Beta vs Nifty",     val: "0.868",  color: "var(--text)" },
            ].map(c => (
              <div className="preview-card" key={c.label}>
                <div className="preview-card-label">{c.label}</div>
                <div className="preview-card-val" style={{ color: c.color }}>{c.val}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="land-features">
        <div className="section-eyebrow reveal">What it does</div>
        <h2 className="section-heading reveal reveal-delay-1">
          Everything you need<br />to analyse a portfolio
        </h2>
        <p className="section-sub reveal reveal-delay-2">
          Seven institutional metrics, three rebalancing simulations, and a
          correlation matrix — computed on live data.
        </p>
        <div className="features-grid">
          {[
            { icon: "◈", title: "Risk Metrics",           desc: "Sharpe ratio, beta, volatility, max drawdown and annualised return on real NSE data." },
            { icon: "⬡", title: "Rebalancing Simulation", desc: "Compare monthly, quarterly and annual rebalancing on the same portfolio and see which Sharpe ratio wins." },
            { icon: "◉", title: "Correlation Matrix",     desc: "See which stocks move together. High correlation means hidden concentration risk you can't see from weights alone." },
            { icon: "◫", title: "Growth Chart",           desc: "Track portfolio value over time vs the Nifty 50 benchmark, starting from a normalised ₹10,000 base." },
            { icon: "◑", title: "Sector Concentration",   desc: "Visualise how much of your portfolio is exposed to each sector. Get warned when any sector exceeds 40%." },
            { icon: "◎", title: "Health Score",           desc: "A composite score from 0–100 based on Sharpe, drawdown, diversification, and beta. Your portfolio at a glance." },
          ].map((f, i) => (
            <div
              className={`feature-card reveal reveal-delay-${(i % 3) + 1}`}
              key={f.title}
            >
              <div className="feature-icon">{f.icon}</div>
              <div className="feature-title">{f.title}</div>
              <div className="feature-desc">{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <div style={{ padding: "0 52px" }}>
        <div className="land-cta reveal">
          <div
            className="section-eyebrow"
            style={{ color: "rgba(255,255,255,0.5)", marginBottom: 12 }}
          >
            Get started
          </div>
          <h2 className="section-heading" style={{ marginBottom: 10 }}>
            Analyse your portfolio today
          </h2>
          <p style={{ fontSize: 15, marginBottom: 32, opacity: 0.55 }}>
            Free. No credit card. No setup.
          </p>
          <button
            className="btn-cta-white"
            onClick={() => nav("/signup")}
          >
            Create free account
          </button>
        </div>
      </div>

      {/* Footer */}
      <footer className="land-footer">
        <div>
          <strong>
            Portfolio<span style={{ color: "var(--accent)" }}>Lens</span>
          </strong>
        </div>
        <div>Analyse Risk · Measure Performance · Optimise Allocation</div>
        <div>v1.0 · FastAPI + React</div>
      </footer>
    </div>
  );
}