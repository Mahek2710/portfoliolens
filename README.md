```md
# PortfolioLens

A full-stack portfolio analytics engine for NSE-listed stocks. Built to answer one question: **before you put real money in, is this allocation actually any good?**

PortfolioLens fetches live market data, computes institutional-grade risk metrics, simulates rebalancing strategies, and tells you in plain English what the numbers mean — the way a fund manager would analyse a portfolio.

---

## What it does

**Pick any NSE stocks → set your allocation → see exactly how that portfolio would have performed.**

- Computes 7 risk metrics on real historical data
- Compares your portfolio against the Nifty 50 benchmark
- Simulates monthly, quarterly, and annual rebalancing side by side
- Generates plain-English insights — flags high correlation, sector concentration, drawdown risk
- Scales everything to your actual investment amount (₹10,000 or ₹10,00,000 — your choice)
- Saves portfolios to your account so you can re-run analysis with fresh data anytime
- Compare two saved portfolios head-to-head on every metric

---

## Risk metrics computed

| Metric | What it tells you |
|---|---|
| Annualised Return | How much the portfolio grew (or shrank) per year |
| Volatility | How wildly the portfolio swings day to day |
| Sharpe Ratio | Return per unit of risk — higher is better |
| Max Drawdown | Worst peak-to-trough loss in the period |
| Beta vs Nifty 50 | How much this portfolio amplifies market moves |
| Sector Concentration | Which sectors dominate your exposure |
| Health Score | Composite 0–100 score from all the above |

---

## Tech stack

**Backend**
- Python 3.13, FastAPI, SQLAlchemy, SQLite
- yfinance for live NSE market data
- pandas + numpy for all financial calculations
- JWT authentication with python-jose, bcrypt password hashing

**Frontend**
- React 18, React Router, Recharts
- Axios with JWT interceptor for automatic auth headers
- CSS variables for light/dark theming

**Testing**
- pytest with mathematically verified unit tests
- Known-value tests (e.g. portfolio holding only the benchmark must have beta = 1.0)
- Edge case coverage: single stock, zero returns, invalid weights, empty portfolio

---

## Project structure

```
portfoliolens/
├── api/
│   ├── main.py          # FastAPI app — all endpoints
│   ├── auth.py          # JWT logic, bcrypt hashing
│   ├── database.py      # SQLAlchemy models, SQLite setup
├── engine/
│   ├── metrics.py       # Core financial calculations
├── data/
│   ├── fetcher.py       # yfinance data ingestion
├── tests/
│   ├── test_metrics.py  # pytest unit + integration tests
├── frontend/
│   ├── src/
│   │   ├── Dashboard.jsx
│   │   ├── Landing.jsx
│   │   ├── Auth.jsx
│   │   ├── api.js       # Axios instance with JWT interceptor
```

---

## Running locally

**1. Clone the repo**
```bash
git clone https://github.com/Mahek2710/portfoliolens.git
cd portfoliolens
```

**2. Set up Python environment**
```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

**3. Start the backend**
```bash
uvicorn api.main:app --reload
```
API runs at `http://127.0.0.1:8000`  
Auto-generated docs at `http://127.0.0.1:8000/docs`

**4. Start the frontend**
```bash
cd frontend
npm install
npm run dev
```
App runs at `http://localhost:5173`

---

## API endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/register` | Create account, returns JWT |
| POST | `/auth/login` | Login, returns JWT |
| GET | `/auth/me` | Get current user from token |
| GET | `/v1/ticker/validate?symbol=` | Validate any NSE ticker live |
| POST | `/v1/portfolio/analyse` | Compute all risk metrics |
| POST | `/v1/portfolio/simulate` | Run rebalancing simulations |
| POST | `/v1/portfolio/growth` | Portfolio value over time vs benchmark |
| POST | `/v1/metrics/correlation` | Correlation matrix |
| GET | `/v1/portfolios` | Load saved portfolios |
| POST | `/v1/portfolios` | Save a portfolio |
| DELETE | `/v1/portfolios/{id}` | Delete a portfolio |

All analytics endpoints require a valid JWT Bearer token.

---

## Running tests

```bash
pytest tests/test_metrics.py -v
```

Tests use mathematically constructed inputs with known expected outputs — not just "does the endpoint return 200" but "does beta equal 1.0 when the portfolio holds only the benchmark."

---

## Key engineering decisions

**Why SQLite instead of PostgreSQL?** Zero-config for local development. SQLAlchemy ORM means switching to PostgreSQL in production is a one-line change in `database.py`.

**Why JWT over sessions?** Stateless — the backend doesn't need to store session state. Token is verified cryptographically on every request. 72-hour expiry keeps users logged in across sessions.

**Why yfinance?** Free, no API key, covers all NSE/BSE tickers plus international markets. The `/v1/ticker/validate` endpoint validates any symbol live before adding it to a portfolio.

**Why pandas for financial math?** Industry standard for time-series financial data. The metrics engine uses vectorised operations — no loops over price history except where unavoidable.

---

Built by [Mahek Hingorani](https://github.com/Mahek2710)
```
