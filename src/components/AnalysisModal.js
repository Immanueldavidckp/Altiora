import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ActivityIndicator, ScrollView, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LineChart } from 'react-native-chart-kit';
import { COLORS, BORDER_RADIUS, SPACING } from '../theme/colors';
import ShoonyaApi from '../api/ShoonyaApi';
import { parseTPSeries, analyze } from '../utils/indicators';

const { width } = Dimensions.get('window');

// Trading style presets: how far back to look and at what candle interval.
const MODES = {
    intraday: { label: 'Intraday', interval: '5', days: 5, chartLabel: '5-min candles · 5 days' },
    swing: { label: 'Swing', interval: 'DAY', days: 400, chartLabel: 'Daily candles · ~1 year' },
};

const AnalysisModal = ({ visible, onClose, isConnected }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);

    const [selectedStock, setSelectedStock] = useState(null);
    const [quoteData, setQuoteData] = useState(null);
    const [chartData, setChartData] = useState(null);
    const [result, setResult] = useState(null); // { indicators, signal }
    const [mode, setMode] = useState('intraday');
    const [loadingData, setLoadingData] = useState(false);

    const handleSearch = async () => {
        if (!isConnected) { alert('Connect to Shoonya first!'); return; }
        if (!searchQuery.trim()) return;
        setSearching(true);
        try {
            const res = await ShoonyaApi.searchScrip(searchQuery.toUpperCase(), 'NSE');
            if (res && res.stat === 'Ok' && res.values) {
                setSearchResults(res.values.slice(0, 10));
            } else {
                setSearchResults([]);
                alert(res.emsg || 'No results found');
            }
        } catch (e) {
            console.error('Search error', e);
        } finally {
            setSearching(false);
        }
    };

    const fetchAnalysisData = async (stock, analysisMode = mode) => {
        setSelectedStock(stock);
        setSearchResults([]);
        setLoadingData(true);
        setResult(null);
        try {
            const quoteRes = await ShoonyaApi.getQuotes(stock.exch, stock.token);
            if (quoteRes && quoteRes.stat === 'Ok') setQuoteData(quoteRes);

            const cfg = MODES[analysisMode];
            const endTime = Math.floor(Date.now() / 1000);
            const startTime = endTime - cfg.days * 24 * 60 * 60;

            const chartRes = await ShoonyaApi.getChartData(
                stock.exch, stock.token, startTime.toString(), endTime.toString(), cfg.interval
            );

            const candles = parseTPSeries(chartRes);
            if (candles.length > 1) {
                // Run the full indicator suite + Buy/Sell/Hold signal engine.
                setResult(analyze(candles, analysisMode));

                // Build the price line from the same candle set.
                const points = candles.slice(-40);
                const step = Math.max(1, Math.floor(points.length / 6));
                const labels = points.map((p, i) => {
                    if (i % step !== 0) return '';
                    const parts = (p.time || '').split(' ');
                    return analysisMode === 'intraday' ? (parts[1]?.slice(0, 5) || '') : (parts[0]?.slice(0, 5) || '');
                });
                setChartData({ labels, datasets: [{ data: points.map((p) => p.close) }] });
            } else {
                setResult(null);
                setChartData(null);
            }
        } catch (e) {
            console.error('Fetch analysis error', e);
        } finally {
            setLoadingData(false);
        }
    };

    const switchMode = (newMode) => {
        if (newMode === mode) return;
        setMode(newMode);
        if (selectedStock) fetchAnalysisData(selectedStock, newMode);
    };

    const reset = () => {
        setSearchQuery('');
        setSearchResults([]);
        setSelectedStock(null);
        setQuoteData(null);
        setChartData(null);
        setResult(null);
        onClose();
    };

    const ind = result?.indicators;
    const sig = result?.signal;

    const fmt = (v, d = 2) => (v == null || !Number.isFinite(v) ? '--' : Number(v).toFixed(d));

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View style={s.modalOverlay}>
                <View style={s.modalContent}>
                    <View style={s.modalHeader}>
                        <Text style={s.modalTitle}>Stock Analysis</Text>
                        <TouchableOpacity onPress={reset}><Ionicons name="close" size={24} color={COLORS.textSecondary} /></TouchableOpacity>
                    </View>

                    {/* Search Bar */}
                    <View style={s.searchBar}>
                        <TextInput
                            style={s.input}
                            placeholder="Search NSE Scrip (e.g. RELIANCE)"
                            placeholderTextColor={COLORS.textMuted}
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            onSubmitEditing={handleSearch}
                        />
                        <TouchableOpacity style={s.searchBtn} onPress={handleSearch}>
                            {searching ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="search" size={20} color="#FFF" />}
                        </TouchableOpacity>
                    </View>

                    {/* Search Results */}
                    {searchResults.length > 0 && !selectedStock && (
                        <ScrollView style={s.resultsList}>
                            {searchResults.map((item, index) => (
                                <TouchableOpacity key={index} style={s.resultItem} onPress={() => fetchAnalysisData(item)}>
                                    <View>
                                        <Text style={s.resultSym}>{item.tsym}</Text>
                                        <Text style={s.resultName}>{item.cname || item.instname}</Text>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    )}

                    {loadingData && (
                        <View style={s.loadingBox}>
                            <ActivityIndicator size="large" color={COLORS.primary} />
                            <Text style={s.loadingText}>Analysing Market Data...</Text>
                        </View>
                    )}

                    {!loadingData && selectedStock && quoteData && (
                        <ScrollView style={s.analysisBody} showsVerticalScrollIndicator={false}>
                            <View style={s.quoteHeader}>
                                <Text style={s.tickerText}>{selectedStock.tsym}</Text>
                                <Text style={s.exchText}>{selectedStock.exch}</Text>
                            </View>

                            <Text style={s.ltpText}>₹{quoteData.lp || quoteData.ltp || '--'}</Text>

                            {/* Mode toggle: Intraday vs Swing */}
                            <View style={s.modeToggle}>
                                {Object.keys(MODES).map((k) => (
                                    <TouchableOpacity
                                        key={k}
                                        style={[s.modeBtn, mode === k && s.modeBtnActive]}
                                        onPress={() => switchMode(k)}
                                    >
                                        <Text style={[s.modeBtnText, mode === k && s.modeBtnTextActive]}>{MODES[k].label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {/* ===== SIGNAL CARD ===== */}
                            {sig && (
                                <View style={[s.signalCard, { borderColor: sig.color }]}>
                                    <View style={s.signalTop}>
                                        <View>
                                            <Text style={s.signalLabelSmall}>SIGNAL · {MODES[mode].label}</Text>
                                            <Text style={[s.signalAction, { color: sig.color }]}>{sig.label}</Text>
                                        </View>
                                        <View style={s.confBox}>
                                            <Text style={s.confValue}>{sig.confidence}%</Text>
                                            <Text style={s.confLabel}>confidence</Text>
                                        </View>
                                    </View>
                                    {/* score bar: -100 (sell) .. +100 (buy) */}
                                    <View style={s.scoreTrack}>
                                        <View style={s.scoreCenter} />
                                        <View style={[
                                            s.scoreFill,
                                            {
                                                backgroundColor: sig.color,
                                                width: `${Math.abs(sig.score) / 2}%`,
                                                left: sig.score >= 0 ? '50%' : undefined,
                                                right: sig.score < 0 ? '50%' : undefined,
                                            },
                                        ]} />
                                    </View>
                                </View>
                            )}

                            {/* ===== INDICATOR GRID ===== */}
                            {ind && (
                                <View style={s.indicatorGrid}>
                                    <Indicator label="RSI (14)" value={fmt(ind.rsi14, 0)}
                                        tone={ind.rsi14 == null ? 'neutral' : ind.rsi14 < 30 ? 'bull' : ind.rsi14 > 70 ? 'bear' : 'neutral'} />
                                    <Indicator label="MACD" value={ind.macd ? fmt(ind.macd.histogram, 2) : '--'}
                                        tone={ind.macd ? (ind.macd.histogram > 0 ? 'bull' : 'bear') : 'neutral'} />
                                    <Indicator label="VWAP" value={fmt(ind.vwap)}
                                        tone={ind.price > ind.vwap ? 'bull' : 'bear'} />
                                    <Indicator label="EMA 9" value={fmt(ind.ema9)}
                                        tone={ind.price > ind.ema9 ? 'bull' : 'bear'} />
                                    <Indicator label="EMA 50" value={fmt(ind.ema50)}
                                        tone={ind.ema50 && ind.price > ind.ema50 ? 'bull' : 'bear'} />
                                    <Indicator label="EMA 200" value={fmt(ind.ema200)}
                                        tone={ind.ema200 && ind.price > ind.ema200 ? 'bull' : 'bear'} />
                                    <Indicator label="Support" value={ind.levels ? fmt(ind.levels.support) : '--'} tone="bull" />
                                    <Indicator label="Resistance" value={ind.levels ? fmt(ind.levels.resistance) : '--'} tone="bear" />
                                    <Indicator label="ATR (14)" value={fmt(ind.atr14)} tone="neutral" />
                                </View>
                            )}

                            {/* ===== WHY (reasons) ===== */}
                            {sig?.reasons?.length > 0 && (
                                <View style={s.reasonsBox}>
                                    <Text style={s.sectionHeader}>Why this signal</Text>
                                    {sig.reasons.map((r, i) => (
                                        <View key={i} style={s.reasonRow}>
                                            <Ionicons
                                                name={r.neutral ? 'remove-circle' : r.bullish ? 'arrow-up-circle' : 'arrow-down-circle'}
                                                size={16}
                                                color={r.neutral ? COLORS.textMuted : r.bullish ? COLORS.accentGreen : COLORS.accentRed}
                                            />
                                            <Text style={s.reasonText}><Text style={s.reasonName}>{r.name}:</Text> {r.text}</Text>
                                        </View>
                                    ))}
                                </View>
                            )}

                            {/* ===== OHLC ===== */}
                            <View style={s.quoteDetailsRow}>
                                <View style={s.qBox}><Text style={s.qLabel}>Open</Text><Text style={s.qVal}>{quoteData.o || '--'}</Text></View>
                                <View style={s.qBox}><Text style={s.qLabel}>High</Text><Text style={[s.qVal, { color: COLORS.accentGreen }]}>{quoteData.h || '--'}</Text></View>
                                <View style={s.qBox}><Text style={s.qLabel}>Low</Text><Text style={[s.qVal, { color: COLORS.accentRed }]}>{quoteData.l || '--'}</Text></View>
                                <View style={s.qBox}><Text style={s.qLabel}>Close</Text><Text style={s.qVal}>{quoteData.c || '--'}</Text></View>
                            </View>

                            {/* Chart */}
                            {chartData && chartData.datasets[0].data.length > 0 ? (
                                <View style={s.chartContainer}>
                                    <Text style={s.sectionHeader}>Price Trend</Text>
                                    <Text style={s.chartSub}>{MODES[mode].chartLabel}</Text>
                                    <LineChart
                                        data={chartData}
                                        width={width - SPACING.xl * 2 - 40}
                                        height={220}
                                        withDots={false}
                                        withInnerLines={false}
                                        yAxisLabel="₹"
                                        chartConfig={{
                                            backgroundColor: COLORS.surface,
                                            backgroundGradientFrom: COLORS.surface,
                                            backgroundGradientTo: COLORS.surface,
                                            decimalPlaces: 1,
                                            color: (opacity = 1) => `rgba(108, 92, 231, ${opacity})`,
                                            labelColor: () => COLORS.textSecondary,
                                            style: { borderRadius: 16 },
                                            propsForBackgroundLines: { strokeDasharray: '' },
                                        }}
                                        bezier
                                        style={s.chartStyle}
                                    />
                                </View>
                            ) : (
                                <View style={s.noChartBox}><Text style={s.noChartText}>Chart Data Unavailable</Text></View>
                            )}

                            <Text style={s.disclaimer}>
                                ⚠️ Educational analysis only — not investment advice. Indicators can be wrong; always do your own research and manage risk.
                            </Text>

                            <TouchableOpacity style={s.backBtn} onPress={() => { setSelectedStock(null); setQuoteData(null); setChartData(null); setResult(null); }}>
                                <Text style={s.backBtnText}>Select Another Stock</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    )}
                </View>
            </View>
        </Modal>
    );
};

// Small indicator pill
const Indicator = ({ label, value, tone }) => {
    const color = tone === 'bull' ? COLORS.accentGreen : tone === 'bear' ? COLORS.accentRed : COLORS.textPrimary;
    return (
        <View style={s.indCell}>
            <Text style={s.indLabel}>{label}</Text>
            <Text style={[s.indValue, { color }]}>{value}</Text>
        </View>
    );
};

const s = StyleSheet.create({
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: COLORS.surface, borderTopLeftRadius: BORDER_RADIUS.xl, borderTopRightRadius: BORDER_RADIUS.xl, height: '90%', padding: SPACING.xl, paddingBottom: 40 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
    modalTitle: { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary },
    searchBar: { flexDirection: 'row', gap: 10, marginBottom: SPACING.md },
    input: { flex: 1, backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.md, paddingHorizontal: 14, height: 48, color: COLORS.textPrimary, borderWidth: 1, borderColor: COLORS.border },
    searchBtn: { width: 48, height: 48, backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.md, justifyContent: 'center', alignItems: 'center' },
    resultsList: { flex: 1 },
    resultItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
    resultSym: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
    resultName: { fontSize: 12, color: COLORS.textSecondary, marginTop: 4 },
    loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loadingText: { color: COLORS.textMuted, marginTop: 12, fontSize: 14, fontWeight: '600' },
    analysisBody: { flex: 1 },
    quoteHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
    tickerText: { fontSize: 22, fontWeight: '900', color: COLORS.textPrimary },
    exchText: { fontSize: 10, backgroundColor: COLORS.background, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, color: COLORS.textSecondary, fontWeight: '700' },
    ltpText: { fontSize: 32, fontWeight: '800', color: COLORS.accentGreen, marginVertical: 10 },

    modeToggle: { flexDirection: 'row', backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.md, padding: 4, marginBottom: SPACING.md },
    modeBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: BORDER_RADIUS.sm },
    modeBtnActive: { backgroundColor: COLORS.primary },
    modeBtnText: { color: COLORS.textSecondary, fontWeight: '700', fontSize: 13 },
    modeBtnTextActive: { color: '#FFF' },

    signalCard: { borderWidth: 1.5, borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md, backgroundColor: COLORS.background },
    signalTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    signalLabelSmall: { fontSize: 10, color: COLORS.textMuted, fontWeight: '700', letterSpacing: 1 },
    signalAction: { fontSize: 26, fontWeight: '900', marginTop: 2 },
    confBox: { alignItems: 'flex-end' },
    confValue: { fontSize: 22, fontWeight: '800', color: COLORS.textPrimary },
    confLabel: { fontSize: 10, color: COLORS.textMuted },
    scoreTrack: { height: 8, backgroundColor: COLORS.surfaceLight, borderRadius: 4, marginTop: 14, position: 'relative', overflow: 'hidden' },
    scoreCenter: { position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, backgroundColor: COLORS.textMuted },
    scoreFill: { position: 'absolute', top: 0, bottom: 0, borderRadius: 4 },

    indicatorGrid: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.md, padding: 6, marginBottom: SPACING.md },
    indCell: { width: '33.33%', padding: 8, alignItems: 'center' },
    indLabel: { fontSize: 10, color: COLORS.textMuted, fontWeight: '600', marginBottom: 4 },
    indValue: { fontSize: 15, fontWeight: '800' },

    reasonsBox: { backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md },
    reasonRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
    reasonText: { flex: 1, fontSize: 12, color: COLORS.textSecondary, lineHeight: 17 },
    reasonName: { color: COLORS.textPrimary, fontWeight: '700' },

    sectionHeader: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 6 },
    chartSub: { fontSize: 11, color: COLORS.textMuted, marginBottom: 8 },
    quoteDetailsRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: COLORS.background, padding: 12, borderRadius: BORDER_RADIUS.md, marginBottom: 16 },
    qBox: { alignItems: 'center' },
    qLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: '600', marginBottom: 4 },
    qVal: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
    chartContainer: { backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.md, padding: 10, overflow: 'hidden' },
    chartStyle: { marginVertical: 8, borderRadius: 16, alignSelf: 'center' },
    noChartBox: { height: 120, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.md, marginBottom: 20 },
    noChartText: { color: COLORS.textSecondary, fontWeight: '600' },
    disclaimer: { fontSize: 11, color: COLORS.textMuted, lineHeight: 16, marginTop: 16, fontStyle: 'italic' },
    backBtn: { marginTop: 16, padding: 14, backgroundColor: COLORS.border, borderRadius: BORDER_RADIUS.md, alignItems: 'center' },
    backBtnText: { color: COLORS.textPrimary, fontWeight: '700' },
});

export default AnalysisModal;
