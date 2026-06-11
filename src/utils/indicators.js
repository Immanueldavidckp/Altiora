// ============================================================================
// indicators.js — Pure-JS technical analysis for Indian (NSE/BSE) market data.
//
// All functions operate on plain JS arrays so they run inside React Native with
// no native modules. Input candles are normalized from Shoonya's TPSeries
// response via parseTPSeries(). The signal engine combines indicators into a
// single Buy / Sell / Hold call for both Intraday and Swing trading styles.
//
// Nothing here places orders or gives financial advice — it is a decision-aid
// that summarizes well-known indicators. Always confirm before trading.
// ============================================================================

// ---------------------------------------------------------------------------
// Parsing: Shoonya TPSeries -> normalized candles (oldest -> newest)
// ---------------------------------------------------------------------------
// Shoonya returns candles newest-first with string fields:
//   into=open, inth=high, intl=low, intc=close, intv=interval volume,
//   intvwap=vwap, time="dd-mm-yyyy HH:MM:SS", ssboe=epoch seconds
export const parseTPSeries = (raw) => {
    if (!Array.isArray(raw)) return [];
    const candles = raw
        .filter((r) => r && (r.intc !== undefined || r.into !== undefined))
        .map((r) => ({
            time: r.time || '',
            epoch: r.ssboe ? parseInt(r.ssboe, 10) : 0,
            open: parseFloat(r.into),
            high: parseFloat(r.inth),
            low: parseFloat(r.intl),
            close: parseFloat(r.intc),
            volume: parseFloat(r.intv || r.v || 0),
            vwap: r.intvwap !== undefined ? parseFloat(r.intvwap) : null,
        }))
        .filter((c) => Number.isFinite(c.close));
    // Shoonya is newest-first; sort ascending by epoch (fallback: reverse).
    if (candles.length && candles[0].epoch) {
        candles.sort((a, b) => a.epoch - b.epoch);
    } else {
        candles.reverse();
    }
    return candles;
};

const closesOf = (candles) => candles.map((c) => c.close);
const round = (v, d = 2) => (Number.isFinite(v) ? Number(v.toFixed(d)) : null);

// ---------------------------------------------------------------------------
// Moving averages
// ---------------------------------------------------------------------------
export const sma = (values, period) => {
    if (!values || values.length < period) return null;
    let sum = 0;
    for (let i = values.length - period; i < values.length; i++) sum += values[i];
    return sum / period;
};

// Full EMA series (same length as input; leading values are seeded with SMA).
export const emaSeries = (values, period) => {
    if (!values || values.length < period) return [];
    const k = 2 / (period + 1);
    const out = [];
    let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
    out[period - 1] = prev;
    for (let i = period; i < values.length; i++) {
        prev = values[i] * k + prev * (1 - k);
        out[i] = prev;
    }
    return out;
};

export const ema = (values, period) => {
    const series = emaSeries(values, period);
    return series.length ? series[series.length - 1] : null;
};

// ---------------------------------------------------------------------------
// RSI (Wilder's smoothing)
// ---------------------------------------------------------------------------
export const rsi = (closes, period = 14) => {
    if (!closes || closes.length < period + 1) return null;
    let gain = 0;
    let loss = 0;
    for (let i = 1; i <= period; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff >= 0) gain += diff;
        else loss -= diff;
    }
    let avgGain = gain / period;
    let avgLoss = loss / period;
    for (let i = period + 1; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
        avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
    }
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
};

// ---------------------------------------------------------------------------
// MACD (12, 26, 9)
// ---------------------------------------------------------------------------
export const macd = (closes, fast = 12, slow = 26, signal = 9) => {
    if (!closes || closes.length < slow + signal) return null;
    const fastE = emaSeries(closes, fast);
    const slowE = emaSeries(closes, slow);
    const macdLine = [];
    for (let i = 0; i < closes.length; i++) {
        if (fastE[i] !== undefined && slowE[i] !== undefined) {
            macdLine.push(fastE[i] - slowE[i]);
        }
    }
    const signalSeries = emaSeries(macdLine, signal);
    const macdVal = macdLine[macdLine.length - 1];
    const signalVal = signalSeries[signalSeries.length - 1];
    const prevMacd = macdLine[macdLine.length - 2];
    const prevSignal = signalSeries[signalSeries.length - 2];
    return {
        macd: macdVal,
        signal: signalVal,
        histogram: macdVal - signalVal,
        // crossover detection on the most recent bar
        bullishCross: prevMacd <= prevSignal && macdVal > signalVal,
        bearishCross: prevMacd >= prevSignal && macdVal < signalVal,
    };
};

// ---------------------------------------------------------------------------
// Bollinger Bands (20, 2)
// ---------------------------------------------------------------------------
export const bollingerBands = (closes, period = 20, mult = 2) => {
    if (!closes || closes.length < period) return null;
    const slice = closes.slice(-period);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    const upper = mean + mult * sd;
    const lower = mean - mult * sd;
    const last = closes[closes.length - 1];
    return {
        upper,
        middle: mean,
        lower,
        // %B: 0 = at lower band, 1 = at upper band
        percentB: upper === lower ? 0.5 : (last - lower) / (upper - lower),
        bandwidth: mean === 0 ? 0 : (upper - lower) / mean,
    };
};

// ---------------------------------------------------------------------------
// VWAP — session volume-weighted average price (intraday focus)
// ---------------------------------------------------------------------------
export const vwap = (candles) => {
    if (!candles || !candles.length) return null;
    let pv = 0;
    let vol = 0;
    for (const c of candles) {
        const typical = (c.high + c.low + c.close) / 3;
        const v = c.volume || 0;
        pv += typical * v;
        vol += v;
    }
    if (vol === 0) {
        // No volume (e.g. index) -> fall back to broker-provided vwap or close
        const last = candles[candles.length - 1];
        return last.vwap || last.close;
    }
    return pv / vol;
};

// ---------------------------------------------------------------------------
// ATR (14) — volatility, used for stop-loss suggestions
// ---------------------------------------------------------------------------
export const atr = (candles, period = 14) => {
    if (!candles || candles.length < period + 1) return null;
    const trs = [];
    for (let i = 1; i < candles.length; i++) {
        const c = candles[i];
        const prevClose = candles[i - 1].close;
        trs.push(
            Math.max(
                c.high - c.low,
                Math.abs(c.high - prevClose),
                Math.abs(c.low - prevClose)
            )
        );
    }
    let a = trs.slice(0, period).reduce((x, y) => x + y, 0) / period;
    for (let i = period; i < trs.length; i++) {
        a = (a * (period - 1) + trs[i]) / period;
    }
    return a;
};

// ---------------------------------------------------------------------------
// Support / Resistance — recent swing low / high over a lookback window
// ---------------------------------------------------------------------------
export const supportResistance = (candles, lookback = 30) => {
    if (!candles || !candles.length) return null;
    const slice = candles.slice(-lookback);
    let support = Infinity;
    let resistance = -Infinity;
    for (const c of slice) {
        if (c.low < support) support = c.low;
        if (c.high > resistance) resistance = c.high;
    }
    return { support, resistance };
};

// ---------------------------------------------------------------------------
// Volume analysis — is the latest bar's volume unusually high?
// ---------------------------------------------------------------------------
export const volumeAnalysis = (candles, period = 20) => {
    if (!candles || candles.length < period + 1) return null;
    const vols = candles.map((c) => c.volume || 0);
    const recent = vols.slice(-period - 1, -1);
    const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const last = vols[vols.length - 1];
    return { avgVolume: avg, lastVolume: last, ratio: avg === 0 ? 0 : last / avg };
};

// ---------------------------------------------------------------------------
// computeIndicators — run the full suite on a set of candles
// ---------------------------------------------------------------------------
export const computeIndicators = (candles) => {
    if (!candles || candles.length < 2) return null;
    const closes = closesOf(candles);
    const last = closes[closes.length - 1];

    return {
        price: last,
        sma20: sma(closes, 20),
        sma50: sma(closes, 50),
        ema9: ema(closes, 9),
        ema21: ema(closes, 21),
        ema50: ema(closes, 50),
        ema200: ema(closes, 200),
        rsi14: rsi(closes, 14),
        macd: macd(closes),
        bollinger: bollingerBands(closes),
        vwap: vwap(candles),
        atr14: atr(candles, 14),
        levels: supportResistance(candles, 30),
        volume: volumeAnalysis(candles),
        candleCount: candles.length,
    };
};

// ---------------------------------------------------------------------------
// Signal engine — weighted vote across indicators -> Buy / Sell / Hold
//   mode: 'intraday' (weights VWAP + fast EMAs) or 'swing' (weights 50/200 EMA)
//   Returns { action, label, color, score(-100..100), confidence, reasons[] }
// ---------------------------------------------------------------------------
export const generateSignal = (ind, mode = 'intraday') => {
    if (!ind) {
        return { action: 'HOLD', label: 'No Data', color: '#8B95B0', score: 0, confidence: 0, reasons: [] };
    }

    const reasons = [];
    let score = 0;
    let weightTotal = 0;

    const vote = (name, points, weight, msg) => {
        score += points * weight;
        weightTotal += weight;
        if (msg) reasons.push({ name, bullish: points > 0, neutral: points === 0, text: msg });
    };

    const { price, rsi14, macd: m, bollinger: bb, vwap: vw, ema9, ema21, ema50, ema200, sma50, volume } = ind;
    const intraday = mode === 'intraday';

    // --- RSI ---------------------------------------------------------------
    if (rsi14 != null) {
        if (rsi14 < 30) vote('RSI', 1, 1.2, `RSI ${rsi14.toFixed(0)} — oversold, bounce likely`);
        else if (rsi14 > 70) vote('RSI', -1, 1.2, `RSI ${rsi14.toFixed(0)} — overbought, pullback risk`);
        else if (rsi14 < 45) vote('RSI', 0.4, 0.8, `RSI ${rsi14.toFixed(0)} — leaning weak`);
        else if (rsi14 > 55) vote('RSI', -0.2, 0.8, `RSI ${rsi14.toFixed(0)} — leaning strong`);
        else vote('RSI', 0, 0.5, `RSI ${rsi14.toFixed(0)} — neutral`);
    }

    // --- MACD --------------------------------------------------------------
    if (m) {
        if (m.bullishCross) vote('MACD', 1, 1.3, 'MACD bullish crossover');
        else if (m.bearishCross) vote('MACD', -1, 1.3, 'MACD bearish crossover');
        else if (m.histogram > 0) vote('MACD', 0.5, 0.9, 'MACD above signal (momentum up)');
        else vote('MACD', -0.5, 0.9, 'MACD below signal (momentum down)');
    }

    // --- VWAP (intraday-heavy) --------------------------------------------
    if (vw != null && price != null) {
        const w = intraday ? 1.4 : 0.6;
        if (price > vw) vote('VWAP', 0.8, w, 'Price above VWAP — intraday bullish');
        else vote('VWAP', -0.8, w, 'Price below VWAP — intraday bearish');
    }

    // --- EMA trend structure ----------------------------------------------
    if (intraday) {
        if (ema9 != null && ema21 != null) {
            if (ema9 > ema21) vote('EMA 9/21', 0.8, 1.1, 'EMA 9 > EMA 21 — short-term uptrend');
            else vote('EMA 9/21', -0.8, 1.1, 'EMA 9 < EMA 21 — short-term downtrend');
        }
    } else {
        if (ema50 != null && ema200 != null) {
            if (ema50 > ema200) vote('EMA 50/200', 1, 1.5, 'EMA 50 > EMA 200 — golden-cross trend (bullish)');
            else vote('EMA 50/200', -1, 1.5, 'EMA 50 < EMA 200 — death-cross trend (bearish)');
        }
        if (price != null && sma50 != null) {
            if (price > sma50) vote('SMA 50', 0.5, 0.8, 'Price above 50-day SMA');
            else vote('SMA 50', -0.5, 0.8, 'Price below 50-day SMA');
        }
    }

    // --- Bollinger Bands ---------------------------------------------------
    if (bb) {
        if (bb.percentB < 0.05) vote('Bollinger', 0.7, 0.9, 'At/below lower band — stretched down');
        else if (bb.percentB > 0.95) vote('Bollinger', -0.7, 0.9, 'At/above upper band — stretched up');
    }

    // --- Volume confirmation (amplifier, not directional on its own) -------
    if (volume && volume.ratio > 1.8) {
        reasons.push({
            name: 'Volume',
            bullish: score > 0,
            neutral: false,
            text: `Volume ${volume.ratio.toFixed(1)}× average — strong conviction`,
        });
        score *= 1.15; // high volume strengthens the prevailing signal
    }

    // --- Normalize & classify ---------------------------------------------
    const norm = weightTotal === 0 ? 0 : Math.max(-100, Math.min(100, (score / weightTotal) * 100));
    const confidence = Math.min(100, Math.abs(norm) + (volume && volume.ratio > 1.8 ? 10 : 0));

    let action = 'HOLD';
    let label = 'Hold / Neutral';
    let color = '#FFD600';
    if (norm >= 50) { action = 'STRONG_BUY'; label = 'Strong Buy'; color = '#00E676'; }
    else if (norm >= 20) { action = 'BUY'; label = 'Buy'; color = '#00E676'; }
    else if (norm <= -50) { action = 'STRONG_SELL'; label = 'Strong Sell'; color = '#FF5252'; }
    else if (norm <= -20) { action = 'SELL'; label = 'Sell'; color = '#FF5252'; }

    return { action, label, color, score: round(norm, 0), confidence: round(confidence, 0), reasons, mode };
};

// Convenience: candles -> { indicators, signal }
export const analyze = (candles, mode = 'intraday') => {
    const indicators = computeIndicators(candles);
    const signal = generateSignal(indicators, mode);
    return { indicators, signal };
};
