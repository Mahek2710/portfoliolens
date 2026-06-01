import sys
sys.path.append("D:/portfoliolens")

import streamlit as st
import plotly.express as px
import plotly.graph_objects as go
import pandas as pd

from data.fetcher import fetch_all, TICKERS, SECTOR_MAP
from engine.metrics import PortfolioMetrics

st.set_page_config(page_title="PortfolioLens", layout="wide", page_icon="📈")

st.title("📈 PortfolioLens")
st.caption("Institutional-grade portfolio analytics for NSE stocks")

# ── Sidebar ──────────────────────────────────────────────────────────────────
st.sidebar.header("Build Your Portfolio")

selected = st.sidebar.multiselect(
    "Select stocks",
    options=TICKERS,
    default=["RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "ICICIBANK.NS"]
)

period = st.sidebar.selectbox("Period", ["6mo", "1y", "2y"], index=1)

weights_input = {}
if selected:
    st.sidebar.markdown("**Set weights (they'll be normalised to 100%)**")
    for ticker in selected:
        short = ticker.replace(".NS", "")
        weights_input[ticker] = st.sidebar.slider(short, 0, 100, 20)

if not selected or sum(weights_input.values()) == 0:
    st.warning("Select at least one stock and set weights in the sidebar.")
    st.stop()

# normalise
total = sum(weights_input.values())
weights = {t: w / total for t, w in weights_input.items()}

# ── Load data ─────────────────────────────────────────────────────────────────
@st.cache_data(ttl=3600)
def load(period):
    return fetch_all(period=period)

with st.spinner("Fetching market data..."):
    data = load(period)

m = PortfolioMetrics(data["prices"], data["benchmark"], risk_free_rate=0.065)
report = m.full_report(weights, SECTOR_MAP)
pr = m.portfolio_returns(weights)

# ── Metric cards ──────────────────────────────────────────────────────────────
st.subheader("Portfolio Metrics")
c1, c2, c3, c4, c5 = st.columns(5)
c1.metric("Annualised Return", f"{report['annualised_return']*100:.2f}%")
c2.metric("Volatility",        f"{report['volatility']*100:.2f}%")
c3.metric("Sharpe Ratio",      f"{report['sharpe_ratio']:.3f}")
c4.metric("Max Drawdown",      f"{report['max_drawdown']*100:.2f}%")
c5.metric("Beta vs Nifty50",   f"{report['beta']:.3f}")

st.divider()

# ── Cumulative returns chart ──────────────────────────────────────────────────
col1, col2 = st.columns(2)

with col1:
    st.subheader("Cumulative Portfolio Return")
    cum = (1 + pr).cumprod()
    fig = go.Figure()
    fig.add_trace(go.Scatter(x=cum.index, y=cum.values, name="Portfolio", line=dict(color="#00C896", width=2)))
    bench_r = m.benchmark_returns
    bench_cum = (1 + bench_r).cumprod()
    fig.add_trace(go.Scatter(x=bench_cum.index, y=bench_cum.values, name="Nifty 50", line=dict(color="#888", width=1.5, dash="dash")))
    fig.update_layout(margin=dict(t=10, b=10), height=300, legend=dict(orientation="h"))
    st.plotly_chart(fig, use_container_width=True)

with col2:
    st.subheader("Sector Concentration")
    conc = report["sector_concentration"]
    fig2 = px.pie(
        names=list(conc.keys()),
        values=list(conc.values()),
        hole=0.4,
        color_discrete_sequence=px.colors.qualitative.Set2
    )
    fig2.update_layout(margin=dict(t=10, b=10), height=300)
    st.plotly_chart(fig2, use_container_width=True)

st.divider()

# ── Correlation heatmap ───────────────────────────────────────────────────────
col3, col4 = st.columns(2)

with col3:
    st.subheader("Correlation Matrix")
    valid = [t for t in weights if t in m.returns.columns]
    corr = m.correlation_matrix()[valid].loc[valid]
    labels = [t.replace(".NS", "") for t in valid]
    fig3 = go.Figure(go.Heatmap(
        z=corr.values,
        x=labels, y=labels,
        colorscale="RdBu_r",
        zmin=-1, zmax=1,
        text=corr.round(2).values,
        texttemplate="%{text}"
    ))
    fig3.update_layout(margin=dict(t=10, b=10), height=350)
    st.plotly_chart(fig3, use_container_width=True)

with col4:
    st.subheader("Rebalancing Simulation")
    rebal_results = []
    for strategy in ["monthly", "quarterly", "annual"]:
        r = m.rebalancing_simulation(weights, strategy)
        rebal_results.append(r)

    df_rebal = pd.DataFrame(rebal_results)
    fig4 = go.Figure()
    colors = {"monthly": "#00C896", "quarterly": "#4C9BE8", "annual": "#F4A261"}
    for _, row in df_rebal.iterrows():
        fig4.add_trace(go.Bar(
            name=row["strategy"].capitalize(),
            x=["Final Value (₹)", "Sharpe Ratio", "Max Drawdown (%)"],
            y=[row["final_value"], row["sharpe_ratio"], row["max_drawdown"] * 100],
            marker_color=colors[row["strategy"]]
        ))
    fig4.update_layout(barmode="group", margin=dict(t=10, b=10), height=350, legend=dict(orientation="h"))
    st.plotly_chart(fig4, use_container_width=True)

st.divider()

# ── Raw rebalancing table ─────────────────────────────────────────────────────
st.subheader("Rebalancing Comparison Table")
df_display = df_rebal[["strategy", "final_value", "total_return_pct", "sharpe_ratio", "max_drawdown"]].copy()
df_display.columns = ["Strategy", "Final Value (₹)", "Total Return (%)", "Sharpe Ratio", "Max Drawdown"]
st.dataframe(df_display.set_index("Strategy"), use_container_width=True)