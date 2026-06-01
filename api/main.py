from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator
from typing import Optional
from sqlalchemy.orm import Session
import json, sys
import yfinance as yf

sys.path.append("D:/portfoliolens")

from data.fetcher import fetch_all
from engine.metrics import PortfolioMetrics
from api.database import create_tables, get_db, User, Portfolio
from api.auth import (
    hash_password, verify_password,
    create_access_token, get_current_user
)

app = FastAPI(title="PortfolioLens", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

create_tables()

# ── Helpers ─────────────────────────────────────────────────────────────────

def get_metrics_engine(period: str = "1y", tickers: list = None) -> tuple:
    data = fetch_all(period=period, extra_tickers=tickers)
    m = PortfolioMetrics(
        prices=data["prices"],
        benchmark=data["benchmark"],
        risk_free_rate=0.065
    )
    return m, data

# ── Schemas ──────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str

    @field_validator("password")
    @classmethod
    def password_length(cls, v):
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters.")
        return v

    @field_validator("email")
    @classmethod
    def email_lowercase(cls, v):
        return v.strip().lower()

class LoginRequest(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def email_lowercase(cls, v):
        return v.strip().lower()

class PortfolioRequest(BaseModel):
    weights: dict[str, float]
    period: Optional[str] = "1y"

    @field_validator("weights")
    @classmethod
    def weights_must_be_positive(cls, v):
        for ticker, w in v.items():
            if w <= 0:
                raise ValueError(f"Weight for {ticker} must be positive")
        return v

class SimulateRequest(BaseModel):
    weights: dict[str, float]
    strategies: Optional[list[str]] = ["monthly", "quarterly", "annual"]
    period: Optional[str] = "1y"

class SavePortfolioRequest(BaseModel):
    name: str
    weights: dict[str, float]
    period: Optional[str] = "1y"
    last_result: Optional[dict] = None

class GrowthRequest(BaseModel):
    weights: dict[str, float]
    period: Optional[str] = "1y"
    investment: Optional[float] = 10000.0

# ── Auth ─────────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"message": "PortfolioLens API v2.0", "status": "running"}

@app.post("/auth/register")
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == req.email).first()
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    user = User(name=req.name, email=req.email, hashed_password=hash_password(req.password))
    db.add(user); db.commit(); db.refresh(user)
    token = create_access_token({"sub": user.id, "email": user.email})
    return {"token": token, "user": {"id": user.id, "name": user.name, "email": user.email}}

@app.post("/auth/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password.")
    token = create_access_token({"sub": user.id, "email": user.email})
    return {"token": token, "user": {"id": user.id, "name": user.name, "email": user.email}}

@app.get("/auth/me")
def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id, "name": current_user.name,
        "email": current_user.email,
        "member_since": current_user.created_at.strftime("%b %Y")
    }

# ── Ticker search & validate ──────────────────────────────────────────────────

@app.get("/v1/ticker/validate")
def validate_ticker(
    symbol: str = Query(...),
    current_user: User = Depends(get_current_user)
):
    """
    Validates any ticker symbol against Yahoo Finance.
    Automatically appends .NS if no exchange suffix provided.
    Returns name, sector, current price if valid.
    """
    symbol = symbol.strip().upper()
    if "." not in symbol:
        symbol = symbol + ".NS"
    try:
        t = yf.Ticker(symbol)
        info = t.info
        # yfinance returns minimal info for invalid tickers
        name = info.get("longName") or info.get("shortName")
        if not name:
            raise HTTPException(status_code=404, detail=f"Ticker '{symbol}' not found on Yahoo Finance.")
        return {
            "status": "valid",
            "symbol": symbol,
            "name": name,
            "sector": info.get("sector", "Unknown"),
            "industry": info.get("industry", ""),
            "current_price": info.get("currentPrice") or info.get("regularMarketPrice"),
            "market_cap": info.get("marketCap"),
            "currency": info.get("currency", "INR"),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Could not fetch data for '{symbol}'.")

# ── Portfolio CRUD ────────────────────────────────────────────────────────────

@app.get("/v1/portfolios")
def get_portfolios(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    portfolios = db.query(Portfolio).filter(Portfolio.user_id == current_user.id).all()
    return {
        "status": "success",
        "data": [
            {
                "id": p.id, "name": p.name,
                "weights": p.weights_dict(), "period": p.period,
                "last_result": p.result_dict(),
                "created_at": p.created_at.strftime("%d %b %Y")
            }
            for p in portfolios
        ]
    }

@app.post("/v1/portfolios")
def save_portfolio(req: SavePortfolioRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    portfolio = Portfolio(
        user_id=current_user.id, name=req.name,
        weights=json.dumps(req.weights), period=req.period,
        last_result=json.dumps(req.last_result) if req.last_result else None
    )
    db.add(portfolio); db.commit(); db.refresh(portfolio)
    return {
        "status": "success",
        "data": {"id": portfolio.id, "name": portfolio.name, "created_at": portfolio.created_at.strftime("%d %b %Y")}
    }

@app.delete("/v1/portfolios/{portfolio_id}")
def delete_portfolio(portfolio_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    portfolio = db.query(Portfolio).filter(
        Portfolio.id == portfolio_id, Portfolio.user_id == current_user.id
    ).first()
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found.")
    db.delete(portfolio); db.commit()
    return {"status": "success", "message": "Portfolio deleted."}

# ── Analytics ─────────────────────────────────────────────────────────────────

@app.get("/v1/tickers")
def get_tickers(current_user: User = Depends(get_current_user)):
    from data.fetcher import TICKERS, SECTOR_MAP
    return {"tickers": TICKERS, "sector_map": SECTOR_MAP}

@app.post("/v1/portfolio/analyse")
def analyse_portfolio(req: PortfolioRequest, current_user: User = Depends(get_current_user)):
    try:
        extra = list(req.weights.keys())
        m, data = get_metrics_engine(req.period, extra)
        report = m.full_report(req.weights, data["sector_map"])
        return {"status": "success", "data": report}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/v1/portfolio/simulate")
def simulate_rebalancing(req: SimulateRequest, current_user: User = Depends(get_current_user)):
    try:
        extra = list(req.weights.keys())
        m, data = get_metrics_engine(req.period, extra)
        results = [m.rebalancing_simulation(req.weights, s) for s in req.strategies]
        return {"status": "success", "data": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/v1/metrics/correlation")
def get_correlation(req: PortfolioRequest, current_user: User = Depends(get_current_user)):
    try:
        extra = list(req.weights.keys())
        m, data = get_metrics_engine(req.period, extra)
        tickers = list(req.weights.keys())
        valid = [t for t in tickers if t in m.returns.columns]
        corr = m.correlation_matrix()[valid].loc[valid]
        return {"status": "success", "data": corr.round(4).to_dict()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/v1/portfolio/growth")
def portfolio_growth(req: GrowthRequest, current_user: User = Depends(get_current_user)):
    try:
        investment = req.investment or 10000.0
        extra = list(req.weights.keys())
        m, data = get_metrics_engine(req.period, extra)
        tickers = [t for t in req.weights if t in m.prices.columns]
        w = {t: req.weights[t] for t in tickers}
        total = sum(w.values())
        w = {t: v / total for t, v in w.items()}

        prices = m.prices[tickers].dropna()
        units = {t: investment * w[t] / prices.iloc[0][t] for t in tickers}

        portfolio_values = []
        for date, row in prices.iterrows():
            val = sum(units[t] * row[t] for t in tickers)
            portfolio_values.append(val)

        bench = data["benchmark"].reindex(prices.index).ffill()
        bench_values = (bench / bench.iloc[0] * investment).tolist()

        result = [
            {
                "date": str(prices.index[i].date()),
                "portfolio": round(portfolio_values[i], 2),
                "benchmark": round(bench_values[i], 2)
            }
            for i in range(len(prices))
        ]
        return {"status": "success", "data": result, "investment": investment}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))