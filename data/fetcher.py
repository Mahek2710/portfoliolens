import yfinance as yf
import pandas as pd

TICKERS = [
    "RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "ICICIBANK.NS",
    "HINDUNILVR.NS", "SBIN.NS", "BHARTIARTL.NS", "ITC.NS", "KOTAKBANK.NS",
    "LT.NS", "AXISBANK.NS", "ASIANPAINT.NS", "MARUTI.NS", "TITAN.NS",
    "WIPRO.NS", "ULTRACEMCO.NS", "SUNPHARMA.NS", "BAJFINANCE.NS", "NESTLEIND.NS"
]

BENCHMARK = "^NSEI"

SECTOR_MAP = {
    "RELIANCE.NS":   "Energy",
    "TCS.NS":        "Technology",
    "HDFCBANK.NS":   "Finance",
    "INFY.NS":       "Technology",
    "ICICIBANK.NS":  "Finance",
    "HINDUNILVR.NS": "FMCG",
    "SBIN.NS":       "Finance",
    "BHARTIARTL.NS": "Telecom",
    "ITC.NS":        "FMCG",
    "KOTAKBANK.NS":  "Finance",
    "LT.NS":         "Infrastructure",
    "AXISBANK.NS":   "Finance",
    "ASIANPAINT.NS": "Materials",
    "MARUTI.NS":     "Automobile",
    "TITAN.NS":      "Consumer",
    "WIPRO.NS":      "Technology",
    "ULTRACEMCO.NS": "Materials",
    "SUNPHARMA.NS":  "Healthcare",
    "BAJFINANCE.NS": "Finance",
    "NESTLEIND.NS":  "FMCG"
}


def fetch_prices(tickers: list, period: str = "1y") -> pd.DataFrame:
    print(f"Fetching price data for {len(tickers)} tickers...")
    raw = yf.download(tickers, period=period, auto_adjust=True, progress=False)
    if isinstance(raw.columns, pd.MultiIndex):
        prices = raw["Close"]
    else:
        prices = raw[["Close"]] if "Close" in raw.columns else raw
    prices = prices.dropna(how="all")
    print(f"Got {len(prices)} trading days of data.")
    return prices


def fetch_benchmark(period: str = "1y") -> pd.Series:
    print("Fetching Nifty 50 benchmark...")
    raw = yf.download(BENCHMARK, period=period, auto_adjust=True, progress=False)
    benchmark = raw["Close"].squeeze()
    benchmark.name = "Nifty50"
    return benchmark


def fetch_all(period: str = "1y", extra_tickers: list = None) -> dict:
    # Merge default tickers with any custom ones from the portfolio
    all_tickers = list(TICKERS)
    if extra_tickers:
        for t in extra_tickers:
            if t not in all_tickers:
                all_tickers.append(t)

    # Build sector map — custom tickers get sector from yfinance info
    sector_map = dict(SECTOR_MAP)
    if extra_tickers:
        for t in extra_tickers:
            if t not in sector_map:
                try:
                    info = yf.Ticker(t).info
                    sector_map[t] = info.get("sector", "Unknown")
                except Exception:
                    sector_map[t] = "Unknown"

    prices = fetch_prices(all_tickers, period)
    benchmark = fetch_benchmark(period)
    return {
        "prices": prices,
        "benchmark": benchmark,
        "sector_map": sector_map,
        "tickers": all_tickers
    }