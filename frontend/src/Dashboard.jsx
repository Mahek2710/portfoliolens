import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "./api";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, CartesianGrid, ReferenceLine, Legend
} from "recharts";

const DEFAULT_TICKERS = [
  { id:"RELIANCE.NS",   name:"Reliance",      sector:"Energy",         color:"#e07b39" },
  { id:"TCS.NS",        name:"TCS",            sector:"Technology",     color:"#4f7fe8" },
  { id:"HDFCBANK.NS",   name:"HDFC Bank",      sector:"Finance",        color:"#7c5cbf" },
  { id:"INFY.NS",       name:"Infosys",        sector:"Technology",     color:"#5a9cf5" },
  { id:"ICICIBANK.NS",  name:"ICICI Bank",     sector:"Finance",        color:"#9b7dd4" },
  { id:"SBIN.NS",       name:"SBI",            sector:"Finance",        color:"#6b4fad" },
  { id:"BHARTIARTL.NS", name:"Airtel",         sector:"Telecom",        color:"#2aa8c4" },
  { id:"ITC.NS",        name:"ITC",            sector:"FMCG",           color:"#2d9e6b" },
  { id:"KOTAKBANK.NS",  name:"Kotak",          sector:"Finance",        color:"#8b82e8" },
  { id:"LT.NS",         name:"L&T",            sector:"Infrastructure", color:"#c49a2a" },
  { id:"AXISBANK.NS",   name:"Axis Bank",      sector:"Finance",        color:"#5a62d4" },
  { id:"ASIANPAINT.NS", name:"Asian Paints",   sector:"Materials",      color:"#c4507a" },
  { id:"MARUTI.NS",     name:"Maruti",         sector:"Automobile",     color:"#2aab9a" },
  { id:"TITAN.NS",      name:"Titan",          sector:"Consumer",       color:"#a86cc1" },
  { id:"WIPRO.NS",      name:"Wipro",          sector:"Technology",     color:"#3aabda" },
  { id:"SUNPHARMA.NS",  name:"Sun Pharma",     sector:"Healthcare",     color:"#3ab88a" },
  { id:"BAJFINANCE.NS", name:"Bajaj Finance",  sector:"Finance",        color:"#8a8fd4" },
  { id:"NESTLEIND.NS",  name:"Nestle",         sector:"FMCG",           color:"#5ab89a" },
  { id:"HINDUNILVR.NS", name:"HUL",            sector:"FMCG",           color:"#4aaa6a" },
  { id:"ULTRACEMCO.NS", name:"UltraCem",       sector:"Materials",      color:"#c464a8" },
];

const SECTOR_COLORS = {
  Energy:"#e07b39",Technology:"#4f7fe8",Finance:"#7c5cbf",
  Telecom:"#2aa8c4",FMCG:"#2d9e6b",Infrastructure:"#c49a2a",
  Materials:"#c4507a",Automobile:"#2aab9a",Consumer:"#a86cc1",
  Healthcare:"#3ab88a",Unknown:"#8a8a8a"
};

const LOAD_STEPS = [
  "Fetching live NSE market data...",
  "Computing risk metrics...",
  "Running rebalancing simulations...",
  "Generating correlation matrix...",
  "Finalising analysis...",
];

const COLORS = ["#e07b39","#4f7fe8","#7c5cbf","#2aa8c4","#2d9e6b",
  "#c49a2a","#c4507a","#2aab9a","#a86cc1","#3ab88a","#8a8fd4","#5ab89a"];

function healthScore(r) {
  let s = 0;
  const sh = r.sharpe_ratio;
  if (sh > 1) s += 30; else if (sh > 0) s += 20; else if (sh > -1) s += 10;
  const dd = Math.abs(r.max_drawdown);
  if (dd < 0.1) s += 25; else if (dd < 0.2) s += 15; else if (dd < 0.3) s += 8;
  const conc = r.sector_concentration || {};
  const maxC = Math.max(...Object.values(conc));
  const cnt = Object.keys(conc).length;
  if (cnt >= 4 && maxC < 0.35) s += 25; else if (cnt >= 3 && maxC < 0.5) s += 15; else s += 5;
  const b = r.beta;
  if (b >= 0.7 && b <= 1.1) s += 20; else if (b >= 0.5 && b <= 1.3) s += 12; else s += 5;
  return Math.min(100, Math.max(0, s));
}

function healthLabel(s) {
  if (s >= 75) return { label:"Strong",   color:"var(--green)"  };
  if (s >= 55) return { label:"Moderate", color:"var(--yellow)" };
  if (s >= 35) return { label:"Weak",     color:"#c4813a"       };
  return              { label:"Poor",     color:"var(--red)"    };
}

// ── Auto insights engine ────────────────────────────────────────────────────
function generateInsights(report, corr, sim, portReturn, benchReturn, tickers) {
  const insights = [];
  const sName = id => {
    const t = tickers.find(x => x.id === id);
    return t ? t.name : id.replace(".NS","");
  };

  // 1. Benchmark comparison
  if (portReturn !== null && benchReturn !== null) {
    const diff = ((portReturn - benchReturn) * 100).toFixed(1);
    if (portReturn < benchReturn) {
      insights.push({
        type: "warning",
        icon: "↓",
        title: "Underperforming the market",
        text: `This portfolio returned ${(portReturn*100).toFixed(1)}% vs Nifty 50's ${(benchReturn*100).toFixed(1)}%. You would have done ${Math.abs(diff)}% better just buying the index.`
      });
    } else {
      insights.push({
        type: "positive",
        icon: "↑",
        title: "Outperforming the market",
        text: `This portfolio beat the Nifty 50 by ${diff}%. Strong alpha generation relative to the benchmark.`
      });
    }
  }

  // 2. Sharpe ratio interpretation
  const sh = report.sharpe_ratio;
  if (sh < -1) {
    insights.push({
      type: "warning",
      icon: "⚠",
      title: "Very poor risk-adjusted returns",
      text: `Sharpe ratio of ${sh.toFixed(2)} means you're taking significant risk but getting negative returns. Below -1 is considered poor by institutional standards.`
    });
  } else if (sh > 1) {
    insights.push({
      type: "positive",
      icon: "◉",
      title: "Excellent risk-adjusted returns",
      text: `Sharpe ratio of ${sh.toFixed(2)} is above 1.0 — considered strong. You're being well compensated for the risk you're taking.`
    });
  }

  // 3. High correlation pairs
  if (corr) {
    const keys = Object.keys(corr);
    const highPairs = [];
    for (let i = 0; i < keys.length; i++) {
      for (let j = i+1; j < keys.length; j++) {
        const val = corr[keys[i]]?.[keys[j]];
        if (val && val > 0.7) {
          highPairs.push({ a: keys[i], b: keys[j], val });
        }
      }
    }
    if (highPairs.length > 0) {
      const pair = highPairs[0];
      insights.push({
        type: "warning",
        icon: "≈",
        title: "Hidden concentration from correlated stocks",
        text: `${sName(pair.a)} and ${sName(pair.b)} have a ${(pair.val*100).toFixed(0)}% correlation — they move almost together. Holding both doesn't diversify your risk as much as it appears.`
      });
    }
  }

  // 4. Sector concentration
  const conc = report.sector_concentration || {};
  const highSectors = Object.entries(conc).filter(([,v]) => v > 0.4);
  if (highSectors.length > 0) {
    const [sec, val] = highSectors[0];
    insights.push({
      type: "warning",
      icon: "◑",
      title: `Heavy ${sec} exposure`,
      text: `${(val*100).toFixed(0)}% of this portfolio is in ${sec} stocks. If the ${sec} sector has a bad quarter, your portfolio takes a disproportionate hit.`
    });
  }

  // 5. Beta interpretation
  const beta = report.beta;
  if (beta < 0.5) {
    insights.push({
      type: "neutral",
      icon: "◈",
      title: "Low market sensitivity",
      text: `Beta of ${beta.toFixed(2)} means this portfolio moves much less than the market. Defensive, but you'll also miss out when markets rally strongly.`
    });
  } else if (beta > 1.3) {
    insights.push({
      type: "neutral",
      icon: "◈",
      title: "High market sensitivity",
      text: `Beta of ${beta.toFixed(2)} means this portfolio amplifies market moves. It will rise more in bull runs but fall harder in corrections.`
    });
  }

  // 6. Rebalancing insight
  if (sim && sim.length === 3) {
    const best = sim.reduce((a, b) => a.sharpe_ratio > b.sharpe_ratio ? a : b);
    insights.push({
      type: "neutral",
      icon: "⬡",
      title: `${best.strategy.charAt(0).toUpperCase()+best.strategy.slice(1)} rebalancing wins`,
      text: `Among the three strategies tested, ${best.strategy} rebalancing gave the best Sharpe ratio (${best.sharpe_ratio.toFixed(3)}). This means it offered the best return per unit of risk taken.`
    });
  }

  // 7. Max drawdown
  const dd = Math.abs(report.max_drawdown);
  if (dd > 0.25) {
    insights.push({
      type: "warning",
      icon: "↘",
      title: "Significant drawdown risk",
      text: `Maximum drawdown of ${(dd*100).toFixed(1)}% means at its worst point, this portfolio lost over a quarter of its value. Consider whether you could stomach that loss emotionally.`
    });
  }

  return insights;
}

function KpiCard({ label, value, type, delay, neutral }) {
  const fmtVal = () => {
    if (value === null || value === undefined) return "—";
    if (type === "pct")  return (value >= 0 ? "+" : "") + (value * 100).toFixed(2) + "%";
    if (type === "pct0") return (value * 100).toFixed(2) + "%";
    if (type === "f3")   return (value >= 0 ? "+" : "") + value.toFixed(3);
    return value;
  };
  const cls = neutral ? "neu"
    : typeof value === "number" && value < 0 ? "neg"
    : typeof value === "number" && value > 0 ? "pos" : "neu";
  const arrow = !neutral && typeof value === "number"
    ? (value >= 0 ? <span className="kpi-arrow">↑</span> : <span className="kpi-arrow">↓</span>)
    : null;
  return (
    <div className="kpi-card reveal" style={{ animationDelay:`${delay}ms` }}>
      <div className="kpi-label">{label}</div>
      <div className={`kpi-val ${cls}`}>{arrow}{fmtVal()}</div>
    </div>
  );
}

function HeatCell({ value, label }) {
  const v = Math.max(-1, Math.min(1, value));
  let bg, fg;
  if      (v >= 0.8)  { bg="#6b1a1a"; fg="#fde8e8"; }
  else if (v >= 0.6)  { bg="#9b2020"; fg="#fde8e8"; }
  else if (v >= 0.4)  { bg="#c94040"; fg="#fff";    }
  else if (v >= 0.2)  { bg="#dfa0a0"; fg="#4a1a1a"; }
  else if (v >= 0)    { bg="#f5e8e8"; fg="#6b3a3a"; }
  else if (v >= -0.2) { bg="#e8eef8"; fg="#2a3a6b"; }
  else if (v >= -0.4) { bg="#a0b8df"; fg="#1a2a4a"; }
  else                { bg="#2040a0"; fg="#ddeeff"; }
  return (
    <div className="heatmap-cell" style={{ background:bg, color:fg }}
      title={`${label}: ${value.toFixed(3)}`}>
      {value.toFixed(2)}
    </div>
  );
}

function SaveModal({ onSave, onClose }) {
  const [name, setName]     = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",
      display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}}>
      <div style={{background:"var(--surface)",border:"1px solid var(--border)",
        borderRadius:"var(--radius-lg)",padding:"28px 32px",width:360,
        boxShadow:"var(--shadow-lg)"}}>
        <div style={{fontSize:16,fontWeight:700,marginBottom:6}}>Save Portfolio</div>
        <div style={{fontSize:13,color:"var(--text2)",marginBottom:20}}>
          Give this allocation a name so you can load it later.
        </div>
        <input className="auth-input" placeholder="e.g. My Tech Bet, Conservative Mix..."
          value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key==="Enter" && name.trim() && onSave(name.trim(), setSaving)}
          autoFocus/>
        <div style={{display:"flex",gap:10,marginTop:16}}>
          <button className="auth-btn" style={{flex:1}}
            disabled={!name.trim()||saving}
            onClick={() => onSave(name.trim(), setSaving)}>
            {saving ? "Saving..." : "Save"}
          </button>
          <button onClick={onClose} style={{flex:1,padding:"11px",
            borderRadius:"var(--radius-sm)",border:"1px solid var(--border)",
            background:"transparent",color:"var(--text2)",cursor:"pointer",
            fontSize:14,fontFamily:"inherit",fontWeight:600}}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function ComparePanel({ portfolios, onClose, allTickers }) {
  const [a, setA]           = useState(null);
  const [b, setB]           = useState(null);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState(null);

  const compare = async () => {
    if (!a || !b) return;
    setLoading(true); setErr(null);
    try {
      const pa = portfolios.find(p => p.id === a);
      const pb = portfolios.find(p => p.id === b);
      const [r1, r2] = await Promise.all([
        api.post("/v1/portfolio/analyse", { weights: pa.weights, period: pa.period }),
        api.post("/v1/portfolio/analyse", { weights: pb.weights, period: pb.period }),
      ]);
      setResults({ a:{ ...r1.data.data, name:pa.name }, b:{ ...r2.data.data, name:pb.name } });
    } catch(e) { setErr("Failed to fetch comparison data."); }
    setLoading(false);
  };

  const metrics = [
    { key:"annualised_return", label:"Annualised Return", fmt:v=>(v*100).toFixed(2)+"%", better:"higher" },
    { key:"volatility",        label:"Volatility",        fmt:v=>(v*100).toFixed(2)+"%", better:"lower"  },
    { key:"sharpe_ratio",      label:"Sharpe Ratio",      fmt:v=>v.toFixed(3),           better:"higher" },
    { key:"max_drawdown",      label:"Max Drawdown",      fmt:v=>(v*100).toFixed(2)+"%", better:"higher" },
    { key:"beta",              label:"Beta vs Nifty",     fmt:v=>v.toFixed(3),           better:"lower"  },
  ];

  const winner = (key, better, va, vb) => {
    if (better === "higher") return va > vb ? "a" : vb > va ? "b" : "tie";
    return va < vb ? "a" : vb < va ? "b" : "tie";
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",
      display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:20}}>
      <div style={{background:"var(--surface)",border:"1px solid var(--border)",
        borderRadius:"var(--radius-lg)",padding:"28px",width:"100%",maxWidth:700,
        maxHeight:"90vh",overflowY:"auto",boxShadow:"var(--shadow-lg)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
          <div style={{fontSize:16,fontWeight:700}}>Compare Portfolios</div>
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",
            color:"var(--text2)",fontSize:18,padding:"4px 8px"}}>✕</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
          {[{val:a,set:setA,label:"Portfolio A"},{val:b,set:setB,label:"Portfolio B"}].map(({val,set,label}) => (
            <div key={label}>
              <div style={{fontSize:11,fontWeight:600,color:"var(--text3)",textTransform:"uppercase",
                letterSpacing:"0.08em",marginBottom:6}}>{label}</div>
              <select value={val||""} onChange={e => set(+e.target.value)} style={{
                width:"100%",padding:"9px 12px",background:"var(--bg2)",
                border:"1px solid var(--border)",borderRadius:"var(--radius-sm)",
                color:"var(--text)",fontSize:13,fontFamily:"inherit",outline:"none"}}>
                <option value="">Select portfolio...</option>
                {portfolios.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          ))}
        </div>
        <button className="analyse-btn" onClick={compare}
          disabled={!a||!b||loading||a===b}>
          {loading ? "Comparing..." : "Compare"}
        </button>
        {err && <div style={{color:"var(--red)",fontSize:12,marginTop:12}}>{err}</div>}
        {results && (
          <div style={{marginTop:24}}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th style={{color:"var(--accent)"}}>{results.a.name}</th>
                  <th style={{color:"#7c5cbf"}}>{results.b.name}</th>
                  <th>Better</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map(m => {
                  const va = results.a[m.key], vb = results.b[m.key];
                  const w = winner(m.key, m.better, va, vb);
                  return (
                    <tr key={m.key}>
                      <td style={{fontWeight:500}}>{m.label}</td>
                      <td className="mono" style={{fontWeight:w==="a"?700:400,
                        color:w==="a"?"var(--accent)":"var(--text)"}}>{m.fmt(va)}</td>
                      <td className="mono" style={{fontWeight:w==="b"?700:400,
                        color:w==="b"?"#7c5cbf":"var(--text)"}}>{m.fmt(vb)}</td>
                      <td>
                        {w==="tie"
                          ? <span style={{fontSize:11,color:"var(--text3)"}}>Tie</span>
                          : <span className="badge" style={{
                              background:w==="a"?"rgba(26,107,71,0.08)":"rgba(124,92,191,0.1)",
                              color:w==="a"?"var(--accent)":"#7c5cbf",
                              borderColor:w==="a"?"rgba(26,107,71,0.15)":"rgba(124,92,191,0.2)"
                            }}>{w==="a"?results.a.name:results.b.name}</span>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginTop:16}}>
              {[results.a, results.b].map((r,i) => {
                const sc = healthScore(r), hl = healthLabel(sc);
                return (
                  <div key={i} className="card" style={{padding:"16px 20px"}}>
                    <div style={{fontSize:11,fontWeight:600,color:"var(--text3)",
                      textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>
                      {r.name} — Health</div>
                    <div style={{fontSize:28,fontWeight:700,color:hl.color,
                      fontFamily:"DM Mono, monospace"}}>{sc}</div>
                    <div style={{fontSize:11,color:hl.color,fontWeight:600,marginBottom:6}}>{hl.label}</div>
                    <div className="health-bar-bg">
                      <div className="health-bar-fill" style={{width:`${sc}%`,background:hl.color}}/>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Ticker Search ────────────────────────────────────────────────────────────
function TickerSearch({ allTickers, onAdd }) {
  const [query, setQuery]     = useState("");
  const [searching, setSearching] = useState(false);
  const [found, setFound]     = useState(null);
  const [error, setError]     = useState(null);
  const debounceRef           = useRef(null);

  const search = async (q) => {
    if (!q.trim() || q.length < 2) { setFound(null); setError(null); return; }
    setSearching(true); setError(null); setFound(null);
    try {
      const res = await api.get(`/v1/ticker/validate?symbol=${encodeURIComponent(q.trim())}`);
      setFound(res.data);
    } catch(e) {
      setError(e.response?.data?.detail || "Ticker not found.");
    }
    setSearching(false);
  };

  const handleChange = (e) => {
    setQuery(e.target.value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(e.target.value), 600);
  };

  const handleAdd = () => {
    if (!found) return;
    const already = allTickers.find(t => t.id === found.symbol);
    if (already) { setError("Already in list."); return; }
    onAdd({
      id: found.symbol,
      name: found.name.length > 18 ? found.name.slice(0,18)+"…" : found.name,
      sector: found.sector || "Unknown",
      color: COLORS[Math.floor(Math.random() * COLORS.length)]
    });
    setQuery(""); setFound(null);
  };

  return (
    <div style={{marginTop:14,paddingTop:14,borderTop:"1px solid var(--border)"}}>
      <div style={{fontSize:11,fontWeight:600,color:"var(--text3)",textTransform:"uppercase",
        letterSpacing:"0.08em",marginBottom:8}}>Add any NSE stock</div>
      <div style={{display:"flex",gap:8}}>
        <input className="auth-input" style={{flex:1,padding:"8px 11px",fontSize:13}}
          placeholder="e.g. TATAMOTORS, ZOMATO, ADANIENT"
          value={query} onChange={handleChange}
        />
        <button onClick={handleAdd} disabled={!found} style={{
          padding:"8px 14px",borderRadius:"var(--radius-sm)",
          background:found?"var(--accent)":"var(--border)",
          color:found?"#fff":"var(--text3)",border:"none",cursor:found?"pointer":"not-allowed",
          fontSize:13,fontWeight:600,fontFamily:"inherit",whiteSpace:"nowrap",
          transition:"background 0.15s"
        }}>Add</button>
      </div>
      {searching && (
        <div style={{fontSize:12,color:"var(--text3)",marginTop:6}}>Checking Yahoo Finance...</div>
      )}
      {found && (
        <div style={{marginTop:8,padding:"10px 12px",background:"var(--green-bg)",
          border:"1px solid rgba(26,107,71,0.15)",borderRadius:"var(--radius-sm)"}}>
          <div style={{fontSize:13,fontWeight:600,color:"var(--green)"}}>{found.name}</div>
          <div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>
            {found.symbol} · {found.sector}
            {found.current_price && ` · ₹${Number(found.current_price).toLocaleString("en-IN")}`}
          </div>
        </div>
      )}
      {error && (
        <div style={{fontSize:12,color:"var(--red)",marginTop:6}}>{error}</div>
      )}
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function Dashboard({ user, onLogout }) {
  const nav = useNavigate();
  const [theme, setTheme]         = useState("light");
  const [tab, setTab]             = useState("analyser");
  const [period, setPeriod]       = useState("1y");
  const [investment, setInvestment] = useState(10000);
  const [allTickers, setAllTickers] = useState(DEFAULT_TICKERS);
  const [selected, setSelected]   = useState([
    "RELIANCE.NS","TCS.NS","HDFCBANK.NS","INFY.NS","ICICIBANK.NS"
  ]);
  const [weights, setWeights]     = useState({
    "RELIANCE.NS":20,"TCS.NS":20,"HDFCBANK.NS":20,"INFY.NS":20,"ICICIBANK.NS":20
  });
  const [result, setResult]       = useState(null);
  const [loading, setLoading]     = useState(false);
  const [step, setStep]           = useState(0);
  const [err, setErr]             = useState(null);
  const [savedPortfolios, setSavedPortfolios] = useState([]);
  const [showSaveModal, setShowSaveModal]     = useState(false);
  const [showCompare, setShowCompare]         = useState(false);
  const [saveSuccess, setSaveSuccess]         = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    const els = document.querySelectorAll(".reveal:not(.visible)");
    const io = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add("visible"); io.unobserve(e.target); }
      }),
      { threshold: 0.08 }
    );
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  });

  useEffect(() => {
    if (!loading) return;
    setStep(0);
    const timers = LOAD_STEPS.map((_,i) => setTimeout(() => setStep(i), i*550));
    return () => timers.forEach(clearTimeout);
  }, [loading]);

  useEffect(() => {
    api.get("/v1/portfolios").then(res => setSavedPortfolios(res.data.data)).catch(()=>{});
  }, []);

  const total = Object.values(weights).reduce((a,b) => a+b, 0);
  const norm  = Object.fromEntries(
    Object.entries(weights).map(([k,v]) => [k, total > 0 ? v/total : 0])
  );

  const toggle = id => {
    if (selected.includes(id)) {
      if (selected.length === 1) return;
      setSelected(s => s.filter(x => x !== id));
      setWeights(w => { const n={...w}; delete n[id]; return n; });
    } else {
      setSelected(s => [...s, id]);
      setWeights(w => ({...w, [id]: 20}));
    }
  };

  const addCustomTicker = (ticker) => {
    setAllTickers(t => [...t, ticker]);
    setSelected(s => [...s, ticker.id]);
    setWeights(w => ({...w, [ticker.id]: 20}));
  };

  const analyse = useCallback(async () => {
    setLoading(true); setErr(null); setResult(null);
    try {
      const inv = Number(investment) || 10000;
      const [r1, r2, r3, r4] = await Promise.all([
        api.post("/v1/portfolio/analyse",   { weights: norm, period }),
        api.post("/v1/portfolio/simulate",  { weights: norm, period }),
        api.post("/v1/metrics/correlation", { weights: norm, period }),
        api.post("/v1/portfolio/growth",    { weights: norm, period, investment: inv }),
      ]);
      setResult({
        report: r1.data.data,
        sim:    r2.data.data,
        corr:   r3.data.data,
        growth: r4.data.data,
        investment: inv,
      });
    } catch(e) {
      setErr("API not reachable. Make sure uvicorn is running on port 8000.");
    }
    setLoading(false);
  }, [norm, period, investment]);

  const handleSave = async (name, setSaving) => {
    setSaving(true);
    try {
      await api.post("/v1/portfolios", { name, weights: norm, period, last_result: result?.report||null });
      const res = await api.get("/v1/portfolios");
      setSavedPortfolios(res.data.data);
      setShowSaveModal(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch(e) { alert("Failed to save. Try again."); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/v1/portfolios/${id}`);
      setSavedPortfolios(s => s.filter(p => p.id !== id));
    } catch(e) {}
  };

  const loadPortfolio = (p) => {
    const tickers = Object.keys(p.weights);
    // Add any custom tickers that aren't in DEFAULT_TICKERS
    tickers.forEach(id => {
      if (!allTickers.find(t => t.id === id)) {
        setAllTickers(prev => [...prev, { id, name: id.replace(".NS",""), sector:"Unknown", color:"#8a8a8a" }]);
      }
    });
    setSelected(tickers);
    setWeights(Object.fromEntries(tickers.map(t => [t, p.weights[t]*100])));
    setPeriod(p.period||"1y");
    setTab("analyser");
    setResult(null);
  };

  const sName = id => {
    const t = allTickers.find(x => x.id === id);
    return t ? t.name : id.replace(".NS","");
  };

  const score = result ? healthScore(result.report) : null;
  const hl    = score  ? healthLabel(score) : null;
  const growth      = result?.growth || [];
  const portReturn  = growth.length ? growth[growth.length-1].portfolio/result.investment - 1 : null;
  const benchReturn = growth.length ? growth[growth.length-1].benchmark/result.investment - 1 : null;
  const highConc    = result ? Object.entries(result.report.sector_concentration).filter(([,v])=>v>0.4) : [];
  const sectorData  = result ? Object.entries(result.report.sector_concentration).map(([name,value])=>({
    name, value:+(value*100).toFixed(1)
  })) : [];
  const corrKeys = result ? Object.keys(result.corr) : [];
  const insights = result ? generateInsights(
    result.report, result.corr, result.sim,
    portReturn, benchReturn, allTickers
  ) : [];

  const handleLogout = () => { onLogout(); nav("/"); };

  const NAV = [
    { id:"analyser", label:"Portfolio Analyser", icon:"◈" },
    { id:"saved",    label:"Saved Portfolios",   icon:"◫" },
    { id:"overview", label:"Overview",           icon:"◎" },
  ];

  const fmtInr = (v) => "₹" + Number(v).toLocaleString("en-IN", { maximumFractionDigits:0 });

  return (
    <div className="dash-shell page-enter">
      {showSaveModal && <SaveModal onSave={handleSave} onClose={() => setShowSaveModal(false)}/>}
      {showCompare && savedPortfolios.length >= 2 && (
        <ComparePanel portfolios={savedPortfolios} onClose={() => setShowCompare(false)} allTickers={allTickers}/>
      )}

      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo" onClick={() => nav("/")} style={{cursor:"pointer"}}>
          Portfolio<span>Lens</span>
        </div>
        <nav className="sidebar-nav">
          <div className="sidebar-section">Analytics</div>
          {NAV.map(n => (
            <button key={n.id} className={`sidebar-item ${tab===n.id?"active":""}`}
              onClick={() => setTab(n.id)}>
              <span className="sidebar-icon">{n.icon}</span>{n.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="sidebar-item"
            onClick={() => setTheme(t => t==="dark"?"light":"dark")}>
            <span className="sidebar-icon">{theme==="dark"?"○":"●"}</span>
            {theme==="dark"?"Light mode":"Dark mode"}
          </button>
          <button className="sidebar-item" onClick={handleLogout}>
            <span className="sidebar-icon">→</span>Sign out
          </button>
          <div className="sidebar-user">
            <div className="sidebar-avatar">{(user?.name||"U")[0].toUpperCase()}</div>
            <div>
              <div className="sidebar-username">{user?.name||"User"}</div>
              <div className="sidebar-plan">Free plan</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="dash-main">
        <header className="dash-topbar">
          <div className="dash-topbar-title">
            {tab==="analyser"?"Portfolio Analyser":tab==="saved"?"Saved Portfolios":"Overview"}
          </div>
          <div className="topbar-actions">
            {tab==="analyser" && <>
              {/* Investment amount input */}
              <div style={{display:"flex",alignItems:"center",gap:6,
                background:"var(--surface)",border:"1px solid var(--border)",
                borderRadius:"var(--radius-sm)",padding:"0 10px",height:32}}>
                <span style={{fontSize:12,color:"var(--text3)",fontWeight:500}}>₹</span>
                <input
                  type="number" min={1000} step={1000}
                  value={investment}
                  onChange={e => setInvestment(+e.target.value)}
                  style={{width:80,background:"transparent",border:"none",outline:"none",
                    fontSize:13,color:"var(--text)",fontFamily:"DM Mono, monospace",fontWeight:500}}
                />
              </div>
              <select value={period} onChange={e => setPeriod(e.target.value)} style={{
                background:"var(--surface)",border:"1px solid var(--border)",
                color:"var(--text)",borderRadius:6,padding:"6px 10px",
                fontSize:12,cursor:"pointer",outline:"none",fontFamily:"inherit"}}>
                <option value="6mo">6 months</option>
                <option value="1y">1 year</option>
                <option value="2y">2 years</option>
              </select>
              {result && (
                <button className="topbar-btn" onClick={() => setShowSaveModal(true)}>
                  Save Portfolio
                </button>
              )}
              <button className="topbar-btn accent" onClick={analyse} disabled={loading}>
                {loading?"Running...":"Run Analysis"}
              </button>
            </>}
            {tab==="saved" && savedPortfolios.length >= 2 && (
              <button className="topbar-btn accent" onClick={() => setShowCompare(true)}>
                Compare Two
              </button>
            )}
          </div>
        </header>

        <div className="dash-content">
          {saveSuccess && (
            <div style={{background:"var(--green-bg)",border:"1px solid rgba(26,107,71,0.2)",
              borderRadius:"var(--radius-sm)",padding:"10px 16px",
              fontSize:13,color:"var(--green)",marginBottom:14,fontWeight:500}}>
              ✓ Portfolio saved successfully
            </div>
          )}

          {/* ══ ANALYSER ══ */}
          {tab==="analyser" && <>
            <div className="builder-grid reveal">
              <div className="card">
                <div className="card-title">Select Stocks</div>
                <div className="stock-list">
                  {allTickers.map(t => (
                    <div key={t.id}
                      className={`stock-row ${selected.includes(t.id)?"sel":""}`}
                      onClick={() => toggle(t.id)}>
                      <div className="stock-dot" style={{background:t.color}}/>
                      <div>
                        <div className="stock-name">{t.name}</div>
                        <div className="stock-sector">{t.sector}</div>
                      </div>
                      {selected.includes(t.id) && (
                        <div className="stock-pct">{(norm[t.id]*100).toFixed(0)}%</div>
                      )}
                    </div>
                  ))}
                </div>
                <TickerSearch allTickers={allTickers} onAdd={addCustomTicker}/>
              </div>

              <div className="card">
                <div className="card-title">Allocation Weights</div>
                <div style={{fontSize:12,color:"var(--text3)",marginBottom:12}}>
                  Investing <span style={{fontWeight:600,color:"var(--text)",
                    fontFamily:"DM Mono, monospace"}}>{fmtInr(investment)}</span>
                </div>
                <div className="weight-rows">
                  {selected.map(id => {
                    const t = allTickers.find(x => x.id===id);
                    const amt = (norm[id]||0) * investment;
                    return (
                      <div key={id} className="weight-row-item">
                        <div style={{display:"flex",alignItems:"center",gap:7,width:100,flexShrink:0}}>
                          <div className="stock-dot" style={{background:t?.color}}/>
                          <span className="weight-name">{t?.name||id.replace(".NS","")}</span>
                        </div>
                        <input type="range" min={1} max={100}
                          value={weights[id]||20}
                          onChange={e => setWeights(w => ({...w,[id]:+e.target.value}))}
                          className="weight-slider"/>
                        <div style={{textAlign:"right",minWidth:58,flexShrink:0}}>
                          <div style={{fontSize:11,fontWeight:600,color:"var(--accent)",
                            fontFamily:"DM Mono, monospace"}}>
                            {(norm[id]*100).toFixed(0)}%
                          </div>
                          <div style={{fontSize:10,color:"var(--text3)",fontFamily:"DM Mono, monospace"}}>
                            {fmtInr(amt)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button className="analyse-btn" onClick={analyse}
                  disabled={loading||selected.length===0}>
                  {loading?"Analysing...":"Analyse Portfolio"}
                </button>
                {err && <div style={{color:"var(--red)",fontSize:12,marginTop:12}}>{err}</div>}
              </div>
            </div>

            {loading && (
              <div className="loading-wrap">
                <div className="load-bar-bg"><div className="load-bar-fill"/></div>
                <div className="load-steps">
                  {LOAD_STEPS.map((s,i) => (
                    <div key={i} className={`load-step ${i===step?"active":""} ${i<step?"done":""}`}>
                      <div className="load-dot"/><span>{s}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {loading && (
              <div className="kpi-grid">
                {[...Array(6)].map((_,i) => (
                  <div key={i} className="kpi-card">
                    <div className="skel" style={{height:10,width:"55%",marginBottom:14}}/>
                    <div className="skel" style={{height:22,width:"70%"}}/>
                  </div>
                ))}
              </div>
            )}

            {result && <>
              {/* ── Insights Panel ── */}
              {insights.length > 0 && (
                <div className="reveal" style={{marginBottom:16}}>
                  <div style={{fontSize:10,fontWeight:600,letterSpacing:"0.09em",
                    textTransform:"uppercase",color:"var(--text3)",marginBottom:10}}>
                    Analysis Insights
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {insights.map((ins,i) => (
                      <div key={i} style={{
                        display:"flex",alignItems:"flex-start",gap:12,
                        padding:"12px 16px",borderRadius:"var(--radius-sm)",
                        background: ins.type==="positive" ? "var(--green-bg)"
                          : ins.type==="warning" ? "rgba(192,57,43,0.06)"
                          : "var(--surface)",
                        border: `1px solid ${
                          ins.type==="positive" ? "rgba(26,107,71,0.15)"
                          : ins.type==="warning" ? "rgba(192,57,43,0.15)"
                          : "var(--border)"}`,
                      }}>
                        <div style={{
                          width:28,height:28,borderRadius:7,flexShrink:0,
                          display:"flex",alignItems:"center",justifyContent:"center",
                          fontSize:13,fontWeight:700,
                          background: ins.type==="positive" ? "rgba(26,107,71,0.12)"
                            : ins.type==="warning" ? "rgba(192,57,43,0.1)"
                            : "var(--bg2)",
                          color: ins.type==="positive" ? "var(--green)"
                            : ins.type==="warning" ? "var(--red)"
                            : "var(--text2)",
                        }}>{ins.icon}</div>
                        <div>
                          <div style={{fontSize:13,fontWeight:600,
                            color: ins.type==="positive" ? "var(--green)"
                              : ins.type==="warning" ? "var(--red)"
                              : "var(--text)",
                            marginBottom:3}}>{ins.title}</div>
                          <div style={{fontSize:12,color:"var(--text2)",lineHeight:1.6}}>
                            {ins.text}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {highConc.length > 0 && (
                <div className="warnings reveal">
                  {highConc.map(([sec,val]) => (
                    <div key={sec} className="warn-pill">
                      ⚠ High concentration in <strong style={{marginLeft:3}}>{sec}</strong>
                      &nbsp;— {(val*100).toFixed(0)}%
                    </div>
                  ))}
                </div>
              )}

              <div style={{fontSize:10,fontWeight:600,letterSpacing:"0.09em",
                textTransform:"uppercase",color:"var(--text3)",marginBottom:10}}>
                Portfolio Risk &amp; Performance Overview
              </div>

              <div className="kpi-grid" style={{marginBottom:16}}>
                <KpiCard label="Annualised Return" value={result.report.annualised_return} type="pct"  delay={0}/>
                <KpiCard label="Volatility"        value={result.report.volatility}        type="pct0" delay={60} neutral/>
                <KpiCard label="Sharpe Ratio"      value={result.report.sharpe_ratio}      type="f3"   delay={120}/>
                <KpiCard label="Max Drawdown"      value={result.report.max_drawdown}      type="pct"  delay={180}/>
                <KpiCard label="Beta vs Nifty 50"  value={result.report.beta}              type="f3"   delay={240} neutral/>
                <div className="kpi-card reveal" style={{animationDelay:"300ms"}}>
                  <div className="kpi-label">Health Score</div>
                  <div style={{display:"flex",alignItems:"baseline",gap:4}}>
                    <span className="health-score-num" style={{color:hl.color}}>{score}</span>
                    <span style={{fontSize:12,color:"var(--text3)"}}>/100</span>
                  </div>
                  <div style={{fontSize:11,fontWeight:600,color:hl.color,marginTop:3}}>{hl.label}</div>
                  <div className="health-bar-bg">
                    <div className="health-bar-fill" style={{width:`${score}%`,background:hl.color}}/>
                  </div>
                </div>
              </div>

              {portReturn !== null && (
                <div className="bench-row reveal">
                  <div className="bench-cell">
                    <div className="bench-label">Portfolio Value</div>
                    <div className="bench-val" style={{color:portReturn>=0?"var(--green)":"var(--red)"}}>
                      {fmtInr(growth[growth.length-1].portfolio)}
                    </div>
                    <div style={{fontSize:11,color:portReturn>=0?"var(--green)":"var(--red)",marginTop:3}}>
                      {portReturn>=0?"+":""}{(portReturn*100).toFixed(2)}%
                    </div>
                  </div>
                  <div className="bench-cell">
                    <div className="bench-label">Nifty 50 Value</div>
                    <div className="bench-val" style={{color:benchReturn>=0?"var(--green)":"var(--red)"}}>
                      {fmtInr(growth[growth.length-1].benchmark)}
                    </div>
                    <div style={{fontSize:11,color:benchReturn>=0?"var(--green)":"var(--red)",marginTop:3}}>
                      {benchReturn>=0?"+":""}{(benchReturn*100).toFixed(2)}%
                    </div>
                  </div>
                  <div className="bench-cell">
                    <div className="bench-label">
                      {portReturn>=benchReturn?"Outperformed by":"Underperformed by"}
                    </div>
                    <div className="bench-val" style={{color:portReturn>=benchReturn?"var(--green)":"var(--red)"}}>
                      {fmtInr(Math.abs(growth[growth.length-1].portfolio - growth[growth.length-1].benchmark))}
                    </div>
                    <div style={{fontSize:11,color:"var(--text3)",marginTop:3}}>
                      vs benchmark
                    </div>
                  </div>
                </div>
              )}

              {growth.length > 0 && (
                <div className="card reveal" style={{marginBottom:14}}>
                  <div className="card-title">Portfolio Value Over Time
                    <span className="card-sub">
                      {fmtInr(result.investment)} invested · vs Nifty 50
                    </span>
                  </div>
                  <ResponsiveContainer width="100%" height={270}>
                    <LineChart data={growth} margin={{top:4,right:16,bottom:0,left:8}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                      <XAxis dataKey="date" tick={{fontSize:10,fill:"var(--text3)"}}
                        tickFormatter={d => {
                          const dt = new Date(d);
                          return `${dt.toLocaleString("default",{month:"short"})} '${String(dt.getFullYear()).slice(2)}`;
                        }}
                        interval={Math.floor(growth.length/7)}/>
                      <YAxis tick={{fontSize:10,fill:"var(--text3)"}}
                        tickFormatter={v => fmtInr(v)}/>
                      <ReferenceLine y={result.investment} stroke="var(--border2)" strokeDasharray="4 4"/>
                      <Tooltip
                        contentStyle={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:8,fontSize:12}}
                        formatter={(v,n) => [fmtInr(v), n]}
                        labelFormatter={d => new Date(d).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})}
                      />
                      <Line type="monotone" dataKey="portfolio" name="Portfolio"
                        stroke="var(--accent)" strokeWidth={2} dot={false}/>
                      <Line type="monotone" dataKey="benchmark" name="Nifty 50"
                        stroke="var(--text3)" strokeWidth={1.5} dot={false} strokeDasharray="5 3"/>
                      <Legend wrapperStyle={{fontSize:12,paddingTop:8}}/>
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="charts-grid reveal">
                <div className="card">
                  <div className="card-title">Sector Concentration</div>
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie data={sectorData} dataKey="value" nameKey="name"
                        cx="50%" cy="50%" outerRadius={85} innerRadius={48} paddingAngle={3}
                        label={({name,value}) => `${name} ${value}%`} labelLine={false}>
                        {sectorData.map((e,i) => (
                          <Cell key={i} fill={SECTOR_COLORS[e.name]||"#8a8a8a"}/>
                        ))}
                      </Pie>
                      <Tooltip formatter={v=>v+"%"}
                        contentStyle={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:8,fontSize:12}}/>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="card">
                  <div className="card-title">Rebalancing Comparison</div>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={result.sim.map(s=>({
                      name:s.strategy[0].toUpperCase()+s.strategy.slice(1),
                      Sharpe:+s.sharpe_ratio.toFixed(3),
                      "Return%":+s.total_return_pct.toFixed(2),
                      "Drawdown%":+(s.max_drawdown*100).toFixed(2),
                    }))} margin={{top:4,right:8,bottom:0,left:0}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                      <XAxis dataKey="name" tick={{fontSize:11,fill:"var(--text3)"}}/>
                      <YAxis tick={{fontSize:10,fill:"var(--text3)"}}/>
                      <ReferenceLine y={0} stroke="var(--border2)"/>
                      <Tooltip contentStyle={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:8,fontSize:12}}/>
                      <Legend wrapperStyle={{fontSize:11}}/>
                      <Bar dataKey="Sharpe"    fill="var(--accent)" radius={[3,3,0,0]}/>
                      <Bar dataKey="Return%"   fill="var(--green)"  radius={[3,3,0,0]}/>
                      <Bar dataKey="Drawdown%" fill="var(--red)"    radius={[3,3,0,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card reveal" style={{marginBottom:14}}>
                <div className="card-title">Correlation Matrix
                  <span className="card-sub">Dark red = high positive · Blue = negative</span>
                </div>
                <div style={{overflowX:"auto"}}>
                  <div style={{display:"grid",
                    gridTemplateColumns:`80px repeat(${corrKeys.length},1fr)`,
                    gap:3,minWidth:corrKeys.length*58+80}}>
                    <div/>
                    {corrKeys.map(t => (
                      <div key={t} style={{fontSize:9,fontWeight:600,color:"var(--text3)",
                        textAlign:"center",padding:"3px 1px"}}>{sName(t)}</div>
                    ))}
                    {corrKeys.map(row => (
                      <>
                        <div key={row} style={{fontSize:9,fontWeight:600,color:"var(--text3)",
                          display:"flex",alignItems:"center"}}>{sName(row)}</div>
                        {corrKeys.map(col => (
                          <HeatCell key={col} value={result.corr[row]?.[col]??0}
                            label={`${sName(row)}/${sName(col)}`}/>
                        ))}
                      </>
                    ))}
                  </div>
                </div>
              </div>

              <div className="card reveal" style={{marginBottom:8}}>
                <div className="card-title">Rebalancing Detail</div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Strategy</th><th>Final Value</th>
                      <th>Total Return</th><th>Sharpe Ratio</th><th>Max Drawdown</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.sim.map(s => (
                      <tr key={s.strategy}>
                        <td><span className="badge">
                          {s.strategy[0].toUpperCase()+s.strategy.slice(1)}
                        </span></td>
                        <td className="mono">{fmtInr(s.final_value * result.investment / 10000)}</td>
                        <td className="mono" style={{
                          color:s.total_return_pct>=0?"var(--green)":"var(--red)",fontWeight:600
                        }}>{s.total_return_pct>=0?"+":""}{s.total_return_pct.toFixed(2)}%</td>
                        <td className="mono">{s.sharpe_ratio.toFixed(3)}</td>
                        <td className="mono" style={{color:"var(--red)"}}>
                          {(s.max_drawdown*100).toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>}
          </>}

          {/* ══ SAVED ══ */}
          {tab==="saved" && (
            <div>
              {savedPortfolios.length === 0 ? (
                <div style={{textAlign:"center",padding:"60px 20px",
                  color:"var(--text3)",fontSize:14}}>
                  <div style={{fontSize:32,marginBottom:12}}>◫</div>
                  <div style={{fontWeight:600,marginBottom:6}}>No saved portfolios yet</div>
                  <div style={{fontSize:13}}>
                    Run an analysis and click "Save Portfolio" to store it here.
                  </div>
                </div>
              ) : (
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:14}}>
                  {savedPortfolios.map((p,i) => {
                    const tickers = Object.keys(p.weights);
                    const r = p.last_result;
                    return (
                      <div key={p.id} className={`card reveal reveal-delay-${(i%3)+1}`}
                        style={{padding:"20px 22px"}}>
                        <div style={{display:"flex",alignItems:"flex-start",
                          justifyContent:"space-between",marginBottom:14}}>
                          <div>
                            <div style={{fontSize:14,fontWeight:700,marginBottom:3}}>{p.name}</div>
                            <div style={{fontSize:11,color:"var(--text3)"}}>
                              Saved {p.created_at} · {p.period}
                            </div>
                          </div>
                          <button onClick={() => handleDelete(p.id)} style={{
                            background:"none",border:"none",cursor:"pointer",
                            color:"var(--text3)",fontSize:14,padding:"2px 6px",
                            borderRadius:4}}>✕</button>
                        </div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:14}}>
                          {tickers.map(t => {
                            const tk = allTickers.find(x => x.id===t);
                            return (
                              <span key={t} style={{display:"inline-flex",alignItems:"center",gap:4,
                                padding:"3px 8px",borderRadius:10,
                                background:"var(--bg2)",border:"1px solid var(--border)",
                                fontSize:11,fontWeight:500,color:"var(--text2)"}}>
                                <span style={{width:6,height:6,borderRadius:"50%",
                                  background:tk?.color||"#888",display:"inline-block"}}/>
                                {tk?.name||t.replace(".NS","")}
                                <span style={{color:"var(--text3)"}}>
                                  {(p.weights[t]*100).toFixed(0)}%
                                </span>
                              </span>
                            );
                          })}
                        </div>
                        {r && (
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",
                            gap:1,background:"var(--border)",borderRadius:"var(--radius-sm)",
                            overflow:"hidden",marginBottom:14}}>
                            {[
                              {label:"Return",val:(r.annualised_return*100).toFixed(1)+"%",pos:r.annualised_return>=0},
                              {label:"Sharpe",val:r.sharpe_ratio.toFixed(2),pos:r.sharpe_ratio>=0},
                              {label:"Drawdown",val:(r.max_drawdown*100).toFixed(1)+"%",pos:false},
                            ].map(m => (
                              <div key={m.label} style={{background:"var(--surface)",
                                padding:"10px 12px",textAlign:"center"}}>
                                <div style={{fontSize:9,color:"var(--text3)",
                                  textTransform:"uppercase",letterSpacing:"0.07em",
                                  marginBottom:4,fontWeight:500}}>{m.label}</div>
                                <div style={{fontSize:14,fontWeight:700,
                                  fontFamily:"DM Mono, monospace",
                                  color:m.pos?"var(--green)":"var(--red)"}}>{m.val}</div>
                              </div>
                            ))}
                          </div>
                        )}
                        <button className="analyse-btn" style={{marginTop:0}}
                          onClick={() => loadPortfolio(p)}>
                          Load &amp; Re-analyse
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ══ OVERVIEW ══ */}
          {tab==="overview" && (
            <div style={{padding:"20px 0"}}>
              <div className="reveal" style={{marginBottom:32}}>
                <div style={{fontSize:22,fontWeight:700,letterSpacing:"-0.4px",marginBottom:7}}>
                  Welcome back, {user?.name?.split(" ")[0]||"there"}
                </div>
                <div style={{fontSize:14,color:"var(--text2)",lineHeight:1.6}}>
                  Build and analyse any portfolio of NSE-listed stocks.
                  Head to the Portfolio Analyser to get started.
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14}}>
                {[
                  {icon:"◈",title:"7 Risk Metrics",
                    desc:"Sharpe ratio, beta, volatility, max drawdown, annualised return, health score and sector concentration."},
                  {icon:"⬡",title:"Rebalancing Simulation",
                    desc:"Compare monthly, quarterly and annual rebalancing strategies on identical portfolios."},
                  {icon:"◉",title:"Any NSE Stock",
                    desc:"Search and add any NSE-listed stock by ticker symbol. Validated live against Yahoo Finance."},
                ].map((f,i) => (
                  <div key={f.title} className={`card reveal reveal-delay-${i+1}`} style={{padding:26}}>
                    <div style={{fontSize:20,marginBottom:12,color:"var(--accent)"}}>{f.icon}</div>
                    <div style={{fontSize:13,fontWeight:600,marginBottom:7}}>{f.title}</div>
                    <div style={{fontSize:13,color:"var(--text2)",lineHeight:1.6}}>{f.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <footer className="dash-footer">
          <div style={{cursor:"pointer"}} onClick={() => nav("/")}>PortfolioLens v1.0</div>
          <div>Analyse Risk · Measure Performance · Optimise Allocation</div>
          <div>Live NSE data via yfinance</div>
        </footer>
      </div>
    </div>
  );
}