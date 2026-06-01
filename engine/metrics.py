import pandas as pd
import numpy as np


class PortfolioMetrics:

    def __init__(self, prices: pd.DataFrame, benchmark: pd.Series, risk_free_rate: float = 0.065):
        self.prices = prices.copy()
        self.benchmark = benchmark.copy()
        self.risk_free_rate = risk_free_rate
        self.rfr_daily = risk_free_rate / 252
        self.returns = prices.pct_change(fill_method=None).dropna()        
        self.benchmark_returns = benchmark.pct_change(fill_method=None).dropna()

    def portfolio_returns(self, weights: dict) -> pd.Series:
        w = pd.Series(weights)
        w = w / w.sum()
        common_tickers = [t for t in w.index if t in self.returns.columns]
        w = w[common_tickers]
        w = w / w.sum()
        return self.returns[common_tickers].dot(w)

    def annualised_return(self, port_returns: pd.Series) -> float:
        if len(port_returns) == 0:
            return 0.0
        return (1 + port_returns).prod() ** (252 / len(port_returns)) - 1

    def volatility(self, port_returns: pd.Series) -> float:
        if len(port_returns) == 0:
            return 0.0
        return float(port_returns.std() * np.sqrt(252))

    def sharpe_ratio(self, port_returns: pd.Series) -> float:
        excess = port_returns - self.rfr_daily
        if excess.std() == 0:
            return 0.0
        return float((excess.mean() / excess.std()) * np.sqrt(252))

    def max_drawdown(self, port_returns: pd.Series) -> float:
        cumulative = (1 + port_returns).cumprod()
        rolling_max = cumulative.cummax()
        drawdown = (cumulative - rolling_max) / rolling_max
        return float(drawdown.min())

    def beta(self, port_returns: pd.Series) -> float:
        aligned = pd.concat([port_returns, self.benchmark_returns], axis=1).dropna()
        if len(aligned) < 2:
            return 1.0
        aligned.columns = ["portfolio", "benchmark"]
        cov_matrix = np.cov(aligned["portfolio"], aligned["benchmark"])
        benchmark_var = cov_matrix[1][1]
        if benchmark_var == 0:
            return 1.0
        return float(cov_matrix[0][1] / benchmark_var)

    def correlation_matrix(self) -> pd.DataFrame:
        return self.returns.corr()

    def sector_concentration(self, weights: dict, sector_map: dict) -> dict:
        total = sum(weights.values())
        normalised = {t: w / total for t, w in weights.items()}
        concentration = {}
        for ticker, weight in normalised.items():
            sector = sector_map.get(ticker, "Unknown")
            concentration[sector] = round(concentration.get(sector, 0.0) + weight, 4)
        return concentration

    def rebalancing_simulation(self, weights: dict, strategy: str = "monthly") -> dict:
        freq_map = {"monthly": "ME", "quarterly": "QE", "annual": "YE"}
        if strategy not in freq_map:
            strategy = "monthly"

        common_tickers = [t for t in weights if t in self.prices.columns]
        prices = self.prices[common_tickers].dropna()

        w = pd.Series({t: weights[t] for t in common_tickers})
        w = w / w.sum()

        rebal_dates = set(prices.resample(freq_map[strategy]).last().index)
        initial = 10000.0
        units = (w * initial / prices.iloc[0]).to_dict()
        daily_values = []

        for date, row in prices.iterrows():
            total_value = sum(units[t] * row[t] for t in common_tickers)
            daily_values.append(total_value)
            if date in rebal_dates:
                units = {t: (total_value * w[t]) / row[t] for t in common_tickers}

        port_series = pd.Series(daily_values, index=prices.index)
        returns = port_series.pct_change().dropna()
        sharpe = float((returns.mean() / returns.std()) * np.sqrt(252)) if returns.std() != 0 else 0.0
        drawdown = float(((port_series / port_series.cummax()) - 1).min())

        return {
            "strategy": strategy,
            "initial_value": initial,
            "final_value": round(float(port_series.iloc[-1]), 2),
            "total_return_pct": round((float(port_series.iloc[-1]) / initial - 1) * 100, 2),
            "sharpe_ratio": round(sharpe, 3),
            "max_drawdown": round(drawdown, 4)
        }

    def full_report(self, weights: dict, sector_map: dict) -> dict:
        pr = self.portfolio_returns(weights)
        return {
            "annualised_return":  round(self.annualised_return(pr), 4),
            "volatility":         round(self.volatility(pr), 4),
            "sharpe_ratio":       round(self.sharpe_ratio(pr), 4),
            "max_drawdown":       round(self.max_drawdown(pr), 4),
            "beta":               round(self.beta(pr), 4),
            "sector_concentration": self.sector_concentration(weights, sector_map)
        }