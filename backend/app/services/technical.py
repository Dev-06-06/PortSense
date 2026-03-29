import logging

import pandas as pd
import pandas_ta as ta
import yfinance as yf

logger = logging.getLogger(__name__)


def _default_technical_indicators() -> dict:
    return {
        "rsi": "N/A",
        "rsi_signal": "Unavailable",
        "macd_signal": "Unavailable",
        "ma_signal": "Unavailable",
        "sma20": None,
        "sma50": None,
        "pattern": "No clear pattern",
        "pattern_explanation": "Insufficient data to compute technical indicators.",
    }


def _is_doji(candle: pd.Series) -> bool:
    open_price = float(candle["Open"])
    close_price = float(candle["Close"])
    high_price = float(candle["High"])
    low_price = float(candle["Low"])

    price_range = high_price - low_price
    if price_range <= 0:
        return False

    body = abs(open_price - close_price)
    return body < 0.1 * price_range


def _is_hammer(candle: pd.Series) -> bool:
    open_price = float(candle["Open"])
    close_price = float(candle["Close"])
    high_price = float(candle["High"])
    low_price = float(candle["Low"])

    body = abs(close_price - open_price)
    lower_shadow = min(open_price, close_price) - low_price
    upper_shadow = high_price - max(open_price, close_price)

    return lower_shadow > 2 * body and upper_shadow < body


def _is_shooting_star(candle: pd.Series) -> bool:
    open_price = float(candle["Open"])
    close_price = float(candle["Close"])
    high_price = float(candle["High"])
    low_price = float(candle["Low"])

    body = abs(close_price - open_price)
    lower_shadow = min(open_price, close_price) - low_price
    upper_shadow = high_price - max(open_price, close_price)

    return upper_shadow > 2 * body and lower_shadow < body


def _is_bullish_engulfing(today: pd.Series, yesterday: pd.Series) -> bool:
    return (
        float(today["Close"]) > float(yesterday["Open"])
        and float(today["Open"]) < float(yesterday["Close"])
        and float(yesterday["Close"]) < float(yesterday["Open"])
    )


def _detect_candlestick_pattern(df: pd.DataFrame) -> tuple[str, str]:
    explanations = {
        "Doji": "Market indecision; buyers and sellers are balanced and trend reversal is possible.",
        "Hammer": "Potential bullish reversal after selling pressure, showing buyers stepped in near lows.",
        "Hanging Man": "Possible bearish reversal in an uptrend as intraday selling pressure appears.",
        "Shooting Star": "Potential bearish reversal after a rise, with rejection from higher prices.",
        "Bullish Engulfing": "A bullish reversal signal where today's candle fully overpowers yesterday's bearish candle.",
        "No clear pattern": "No high-conviction candlestick setup was detected in the last three candles.",
    }

    recent = df.tail(3)
    if recent.empty:
        return "No clear pattern", explanations["No clear pattern"]

    # Prioritize the most recent candle-based patterns first.
    for _, candle in recent.iloc[::-1].iterrows():
        if _is_doji(candle):
            return "Doji", explanations["Doji"]

        if _is_hammer(candle):
            sma20_value = candle.get("SMA_20")
            if pd.notna(sma20_value) and float(candle["Close"]) > float(sma20_value):
                return "Hanging Man", explanations["Hanging Man"]
            return "Hammer", explanations["Hammer"]

        if _is_shooting_star(candle):
            return "Shooting Star", explanations["Shooting Star"]

    # Check engulfing across adjacent candles inside the 3-candle window, most recent pair first.
    for idx in range(len(recent) - 1, 0, -1):
        today = recent.iloc[idx]
        yesterday = recent.iloc[idx - 1]
        if _is_bullish_engulfing(today, yesterday):
            return "Bullish Engulfing", explanations["Bullish Engulfing"]

    return "No clear pattern", explanations["No clear pattern"]


def _to_float(value: object, round_to: int | None = None) -> float | None:
    if value is None or pd.isna(value):
        return None

    number = float(value)
    if round_to is not None:
        return round(number, round_to)
    return number


def get_technical_indicators(ticker: str) -> dict:
    fallback = _default_technical_indicators()

    try:
        df = yf.download(
            ticker,
            period="60d",
            interval="1d",
            auto_adjust=True,
            progress=False,
        )

        if df.empty:
            return fallback

        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)

        df.ta.rsi(length=14, append=True)
        df.ta.macd(append=True)
        df.ta.sma(length=20, append=True)
        df.ta.sma(length=50, append=True)

        latest = df.iloc[-1]

        rsi = _to_float(latest.get("RSI_14"), round_to=1)
        macd_line = _to_float(latest.get("MACD_12_26_9"))
        signal_line = _to_float(latest.get("MACDs_12_26_9"))
        sma20 = _to_float(latest.get("SMA_20"))
        sma50 = _to_float(latest.get("SMA_50"))
        current_price = _to_float(latest.get("Close"))

        if None in (rsi, macd_line, signal_line, sma20, sma50, current_price):
            return fallback

        if rsi > 70:
            rsi_signal = "Overbought"
        elif rsi < 30:
            rsi_signal = "Oversold"
        else:
            rsi_signal = "Neutral"

        macd_signal = (
            "Bullish Crossover" if macd_line > signal_line else "Bearish Crossover"
        )

        if current_price > sma20 and current_price > sma50:
            ma_signal = "Above 20 & 50 DMA"
        elif current_price < sma20 and current_price < sma50:
            ma_signal = "Below 20 & 50 DMA"
        else:
            ma_signal = "Mixed"

        pattern, pattern_explanation = _detect_candlestick_pattern(df)

        return {
            "rsi": rsi,
            "rsi_signal": rsi_signal,
            "macd_signal": macd_signal,
            "ma_signal": ma_signal,
            "sma20": sma20,
            "sma50": sma50,
            "pattern": pattern,
            "pattern_explanation": pattern_explanation,
        }
    except Exception as exc:
        logger.exception("Failed to compute technical indicators for %s: %s", ticker, exc)
        return fallback
