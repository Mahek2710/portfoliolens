import sys
sys.path.append("D:/portfoliolens")

import pytest
import numpy as np
import pandas as pd
from engine.metrics import PortfolioMetrics


def make_engine(prices_dict, benchmark_list, rfr=0.065):
    prices = pd.DataFrame(prices_dict)
    prices.index = pd.date_range("2024-01-01", periods=len(list(prices_dict.values())[0]), freq="B")
    benchmark = pd.Series(benchmark_list, index=pd.date_range("2024-01-01", periods=len(benchmark_list), freq="B"))
    return PortfolioMetrics(prices, benchmark, rfr)


def test_annualised_return_positive_trend():
    prices = {"A": [100 + i for i in range(252)]}
    bench = [100 + i for i in range(252)]
    m = make_engine(prices, bench)
    pr = m.portfolio_returns({"A": 1.0})
    result = m.annualised_return(pr)
    assert result > 0


def test_volatility_flat_prices_is_zero():
    prices = {"A": [100.0] * 252}
    bench = [100.0] * 252
    m = make_engine(prices, bench)
    pr = m.portfolio_returns({"A": 1.0})
    assert m.volatility(pr) == 0.0


def test_max_drawdown_known_crash():
    prices = {"A": [100, 120, 150, 75, 80, 90, 95, 100]}
    bench  = [100, 120, 150, 75, 80, 90, 95, 100]
    m = make_engine(prices, bench)
    pr = m.portfolio_returns({"A": 1.0})
    dd = m.max_drawdown(pr)
    assert dd < -0.45


def test_beta_same_as_benchmark_is_one():
    series = [100, 102, 101, 104, 103, 106, 105, 108]
    prices = {"A": series}
    bench  = series
    m = make_engine(prices, bench)
    pr = m.portfolio_returns({"A": 1.0})
    assert abs(m.beta(pr) - 1.0) < 0.01


def test_weights_normalise():
    prices = {"A": [100, 101, 102, 103], "B": [50, 51, 52, 53]}
    bench  = [100, 101, 102, 103]
    m = make_engine(prices, bench)
    r1 = m.portfolio_returns({"A": 1, "B": 1})
    r2 = m.portfolio_returns({"A": 0.5, "B": 0.5})
    pd.testing.assert_series_equal(r1.round(8), r2.round(8))


def test_sector_concentration_sums_to_one():
    prices = {"A": [100, 101], "B": [50, 51]}
    bench  = [100, 101]
    m = make_engine(prices, bench)
    sector_map = {"A": "Tech", "B": "Finance"}
    result = m.sector_concentration({"A": 0.6, "B": 0.4}, sector_map)
    assert abs(sum(result.values()) - 1.0) < 0.001


def test_sharpe_negative_when_returns_below_rfr():
    prices = {"A": [100 - i * 0.1 for i in range(252)]}
    bench  = [100.0] * 252
    m = make_engine(prices, bench)
    pr = m.portfolio_returns({"A": 1.0})
    assert m.sharpe_ratio(pr) < 0


def test_rebalancing_returns_all_strategies():
    prices = {"A": [100 + i * 0.5 for i in range(252)],
              "B": [50  + i * 0.2 for i in range(252)]}
    bench  = [100 + i * 0.3 for i in range(252)]
    m = make_engine(prices, bench)
    weights = {"A": 0.6, "B": 0.4}
    for strategy in ["monthly", "quarterly", "annual"]:
        result = m.rebalancing_simulation(weights, strategy)
        assert "final_value" in result
        assert "sharpe_ratio" in result
        assert result["final_value"] > 0