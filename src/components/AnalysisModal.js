import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ActivityIndicator, ScrollView, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LineChart } from 'react-native-chart-kit';
import { COLORS, BORDER_RADIUS, SPACING } from '../theme/colors';
import FlatTradeApi from '../api/FlatTradeApi';

const { width } = Dimensions.get('window');

// Safely parse numeric quote fields that may arrive as strings.
const num = (v) => {
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
};

const fmt = (v, dp = 2) => {
    const n = num(v);
    return n === null ? '--' : n.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });
};

// Compact volume formatting (1.2M, 45.3K).
const fmtVol = (v) => {
    const n = num(v);
    if (n === null) return '--';
    if (n >= 1e7) return (n / 1e7).toFixed(2) + ' Cr';
    if (n >= 1e5) return (n / 1e5).toFixed(2) + ' L';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + ' K';
    return n.toString();
};

const AnalysisModal = ({ visible, onClose, isConnected }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);

    const [selectedStock, setSelectedStock] = useState(null);
    const [quoteData, setQuoteData] = useState(null);
    const [chartData, setChartData] = useState(null);
    const [chartStats, setChartStats] = useState(null);
    const [loadingData, setLoadingData] = useState(false);

    const handleSearch = async () => {
        if (!isConnected) { alert('Connect to Shoonya first!'); return; }
        if (!searchQuery.trim()) return;
        setSearching(true);
        try {
            const res = await FlatTradeApi.searchScrip(searchQuery.toUpperCase(), 'NSE');
            if (res && res.stat === 'Ok' && res.values) {
                setSearchResults(res.values.slice(0, 10)); // top 10 results
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

    const fetchAnalysisData = async (stock) => {
        setSelectedStock(stock);
        setSearchResults([]);
        setLoadingData(true);
        try {
            // Get Quotes
            const quoteRes = await FlatTradeApi.getQuotes(stock.exch, stock.token);
            if (quoteRes && quoteRes.stat === 'Ok') {
                setQuoteData(quoteRes);
            }

            // Get Chart Data (TPSeries)
            const endTime = Math.floor(Date.now() / 1000);
            const startTime = endTime - (7 * 24 * 60 * 60); // past 7 days roughly

            const chartRes = await FlatTradeApi.getChartData(stock.exch, stock.token, startTime.toString(), endTime.toString(), '60'); // 60 min interval

            if (chartRes && chartRes.length > 0) {
                // Ensure chartRes is an array and reverse it to have oldest to newest if needed
                const historical = Array.isArray(chartRes) ? [...chartRes].reverse() : [];
                if (historical.length > 0) {
                    // sample last N points
                    const points = historical.slice(-30);
                    const labels = points.map(p => p.time.split(' ')[1] || '').filter((_, i) => i % 5 === 0);
                    const values = points.map(p => parseFloat(p.intc || p.c || p.into || 0)); // 'intc' is the interval close price (Noren)

                    if (values.length > 0 && !values.includes(NaN)) {
                        setChartData({
                            labels: labels.length > 0 ? labels : ['0'],
                            datasets: [{ data: values }]
                        });
                        // Period stats for the dashboard
                        const first = values[0];
                        const last = values[values.length - 1];
                        const change = last - first;
                        setChartStats({
                            high: Math.max(...values),
                            low: Math.min(...values),
                            change,
                            changePct: first ? (change / first) * 100 : 0,
                        });
                    }
                }
            } else {
                setChartData(null);
                setChartStats(null);
            }
        } catch (e) {
            console.error('Fetch analysis error', e);
        } finally {
            setLoadingData(false);
        }
    };

    const reset = () => {
        setSearchQuery('');
        setSearchResults([]);
        setSelectedStock(null);
        setQuoteData(null);
        setChartData(null);
        setChartStats(null);
        onClose();
    };

    const backToSearch = () => {
        setSelectedStock(null);
        setQuoteData(null);
        setChartData(null);
        setChartStats(null);
    };

    // --- Derived metrics for the dashboard ---
    const ltp = quoteData ? num(quoteData.lp ?? quoteData.ltp) : null;
    const prevClose = quoteData ? num(quoteData.c) : null;
    const dayHigh = quoteData ? num(quoteData.h) : null;
    const dayLow = quoteData ? num(quoteData.l) : null;
    const dayChange = (ltp !== null && prevClose !== null) ? ltp - prevClose : null;
    const dayChangePct = (dayChange !== null && prevClose) ? (dayChange / prevClose) * 100 : null;
    const isUp = dayChange === null ? null : dayChange >= 0;
    const trendColor = isUp === null ? COLORS.textSecondary : (isUp ? COLORS.accentGreen : COLORS.accentRed);

    // Position of LTP within the day's low-high range (0..1) for the range bar.
    let rangePos = null;
    if (ltp !== null && dayHigh !== null && dayLow !== null && dayHigh > dayLow) {
        rangePos = Math.min(1, Math.max(0, (ltp - dayLow) / (dayHigh - dayLow)));
    }

    const metrics = quoteData ? [
        { label: 'Open', value: fmt(quoteData.o), icon: 'sunny-outline', color: COLORS.accentOrange },
        { label: 'Prev Close', value: fmt(quoteData.c), icon: 'moon-outline', color: COLORS.primaryLight },
        { label: 'Day High', value: fmt(quoteData.h), icon: 'arrow-up-outline', color: COLORS.accentGreen },
        { label: 'Day Low', value: fmt(quoteData.l), icon: 'arrow-down-outline', color: COLORS.accentRed },
        { label: 'Avg Price', value: fmt(quoteData.ap), icon: 'analytics-outline', color: COLORS.accent },
        { label: 'Volume', value: fmtVol(quoteData.v), icon: 'bar-chart-outline', color: COLORS.accentYellow },
    ] : [];

    const bid = quoteData ? num(quoteData.bp1) : null;
    const ask = quoteData ? num(quoteData.sp1) : null;

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View style={s.modalOverlay}>
                <View style={s.modalContent}>
                    <View style={s.modalHeader}>
                        <View style={s.headerLeft}>
                            <View style={s.headerIcon}><Ionicons name="stats-chart" size={18} color={COLORS.primaryLight} /></View>
                            <Text style={s.modalTitle}>Market Dashboard</Text>
                        </View>
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
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.resultSym}>{item.tsym}</Text>
                                        <Text style={s.resultName}>{item.cname || item.instname}</Text>
                                    </View>
                                    <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    )}

                    {/* Empty state */}
                    {!loadingData && !selectedStock && searchResults.length === 0 && (
                        <View style={s.emptyBox}>
                            <Ionicons name="search-circle-outline" size={64} color={COLORS.border} />
                            <Text style={s.emptyText}>Search for a stock to view its live dashboard</Text>
                        </View>
                    )}

                    {/* Loading */}
                    {loadingData && (
                        <View style={s.loadingBox}>
                            <ActivityIndicator size="large" color={COLORS.primary} />
                            <Text style={s.loadingText}>Fetching Market Data...</Text>
                        </View>
                    )}

                    {/* Dashboard */}
                    {!loadingData && selectedStock && quoteData && (
                        <ScrollView style={s.analysisBody} showsVerticalScrollIndicator={false}>

                            {/* Hero price card */}
                            <View style={s.heroCard}>
                                <View style={s.quoteHeader}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.tickerText} numberOfLines={1}>{selectedStock.tsym}</Text>
                                        <Text style={s.companyName} numberOfLines={1}>{selectedStock.cname || selectedStock.instname || selectedStock.exch}</Text>
                                    </View>
                                    <Text style={s.exchText}>{selectedStock.exch}</Text>
                                </View>

                                <View style={s.priceRow}>
                                    <Text style={s.ltpText}>₹{fmt(ltp)}</Text>
                                    {dayChange !== null && (
                                        <View style={[s.changeBadge, { backgroundColor: trendColor + '22' }]}>
                                            <Ionicons name={isUp ? 'caret-up' : 'caret-down'} size={14} color={trendColor} />
                                            <Text style={[s.changeText, { color: trendColor }]}>
                                                {dayChange >= 0 ? '+' : ''}{fmt(dayChange)} ({dayChangePct >= 0 ? '+' : ''}{fmt(dayChangePct)}%)
                                            </Text>
                                        </View>
                                    )}
                                </View>

                                {/* Day range bar */}
                                {rangePos !== null && (
                                    <View style={s.rangeWrap}>
                                        <View style={s.rangeTrack}>
                                            <View style={[s.rangeFill, { width: `${rangePos * 100}%`, backgroundColor: trendColor }]} />
                                            <View style={[s.rangeMarker, { left: `${rangePos * 100}%`, borderColor: trendColor }]} />
                                        </View>
                                        <View style={s.rangeLabels}>
                                            <Text style={s.rangeLabel}>L  ₹{fmt(dayLow)}</Text>
                                            <Text style={s.rangeLabelMid}>Day Range</Text>
                                            <Text style={s.rangeLabel}>₹{fmt(dayHigh)}  H</Text>
                                        </View>
                                    </View>
                                )}
                            </View>

                            {/* Metrics grid */}
                            <View style={s.metricsGrid}>
                                {metrics.map((m, i) => (
                                    <View key={i} style={s.metricCard}>
                                        <View style={[s.metricIcon, { backgroundColor: m.color + '1A' }]}>
                                            <Ionicons name={m.icon} size={14} color={m.color} />
                                        </View>
                                        <Text style={s.metricLabel}>{m.label}</Text>
                                        <Text style={s.metricValue}>{m.value}</Text>
                                    </View>
                                ))}
                            </View>

                            {/* Bid / Ask spread */}
                            {(bid !== null || ask !== null) && (
                                <View style={s.spreadRow}>
                                    <View style={[s.spreadBox, { backgroundColor: COLORS.accentGreen + '14' }]}>
                                        <Text style={s.spreadLabel}>BID</Text>
                                        <Text style={[s.spreadValue, { color: COLORS.accentGreen }]}>₹{fmt(bid)}</Text>
                                    </View>
                                    <View style={[s.spreadBox, { backgroundColor: COLORS.accentRed + '14' }]}>
                                        <Text style={s.spreadLabel}>ASK</Text>
                                        <Text style={[s.spreadValue, { color: COLORS.accentRed }]}>₹{fmt(ask)}</Text>
                                    </View>
                                </View>
                            )}

                            {/* Price trend chart widget */}
                            <View style={s.widgetCard}>
                                <View style={s.widgetHeader}>
                                    <Text style={s.sectionHeader}>Price Trend</Text>
                                    <Text style={s.widgetSub}>Last 30 intervals · 60m</Text>
                                </View>

                                {chartData && chartData.datasets[0].data.length > 0 ? (
                                    <>
                                        <LineChart
                                            data={chartData}
                                            width={width - SPACING.xl * 2 - 24}
                                            height={200}
                                            withDots={false}
                                            withInnerLines={false}
                                            yAxisLabel="₹"
                                            chartConfig={{
                                                backgroundColor: COLORS.surface,
                                                backgroundGradientFrom: COLORS.surface,
                                                backgroundGradientTo: COLORS.surface,
                                                decimalPlaces: 1,
                                                color: (opacity = 1) => isUp === false
                                                    ? `rgba(255, 82, 82, ${opacity})`
                                                    : `rgba(0, 230, 118, ${opacity})`,
                                                labelColor: () => COLORS.textSecondary,
                                                style: { borderRadius: 16 },
                                                propsForBackgroundLines: { strokeDasharray: '' }
                                            }}
                                            bezier
                                            style={s.chartStyle}
                                        />

                                        {chartStats && (
                                            <View style={s.chartStatsRow}>
                                                <View style={s.chartStat}>
                                                    <Text style={s.chartStatLabel}>Period High</Text>
                                                    <Text style={[s.chartStatVal, { color: COLORS.accentGreen }]}>₹{fmt(chartStats.high)}</Text>
                                                </View>
                                                <View style={s.chartStat}>
                                                    <Text style={s.chartStatLabel}>Period Low</Text>
                                                    <Text style={[s.chartStatVal, { color: COLORS.accentRed }]}>₹{fmt(chartStats.low)}</Text>
                                                </View>
                                                <View style={s.chartStat}>
                                                    <Text style={s.chartStatLabel}>Change</Text>
                                                    <Text style={[s.chartStatVal, { color: chartStats.change >= 0 ? COLORS.accentGreen : COLORS.accentRed }]}>
                                                        {chartStats.change >= 0 ? '+' : ''}{fmt(chartStats.changePct)}%
                                                    </Text>
                                                </View>
                                            </View>
                                        )}
                                    </>
                                ) : (
                                    <View style={s.noChartBox}>
                                        <Ionicons name="cloud-offline-outline" size={28} color={COLORS.textMuted} />
                                        <Text style={s.noChartText}>Chart Data Unavailable</Text>
                                    </View>
                                )}
                            </View>

                            <TouchableOpacity style={s.backBtn} onPress={backToSearch}>
                                <Ionicons name="search" size={16} color={COLORS.textPrimary} />
                                <Text style={s.backBtnText}>Select Another Stock</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    )}
                </View>
            </View>
        </Modal>
    );
};

const s = StyleSheet.create({
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: COLORS.background, borderTopLeftRadius: BORDER_RADIUS.xl, borderTopRightRadius: BORDER_RADIUS.xl, height: '90%', padding: SPACING.xl, paddingBottom: 40 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.lg },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    headerIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: COLORS.surfaceLight, justifyContent: 'center', alignItems: 'center' },
    modalTitle: { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary },

    searchBar: { flexDirection: 'row', gap: 10, marginBottom: SPACING.md },
    input: { flex: 1, backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md, paddingHorizontal: 14, height: 48, color: COLORS.textPrimary, borderWidth: 1, borderColor: COLORS.border },
    searchBtn: { width: 48, height: 48, backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.md, justifyContent: 'center', alignItems: 'center' },

    resultsList: { flex: 1 },
    resultItem: { flexDirection: 'row', alignItems: 'center', padding: 14, backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md, marginBottom: 8 },
    resultSym: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
    resultName: { fontSize: 12, color: COLORS.textSecondary, marginTop: 4 },

    emptyBox: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14, paddingHorizontal: 30 },
    emptyText: { color: COLORS.textMuted, fontSize: 14, fontWeight: '600', textAlign: 'center' },

    loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loadingText: { color: COLORS.textMuted, marginTop: 12, fontSize: 14, fontWeight: '600' },

    analysisBody: { flex: 1 },

    // Hero card
    heroCard: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
    quoteHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    tickerText: { fontSize: 22, fontWeight: '900', color: COLORS.textPrimary },
    companyName: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
    exchText: { fontSize: 10, backgroundColor: COLORS.surfaceLight, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, color: COLORS.textSecondary, fontWeight: '700' },
    priceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' },
    ltpText: { fontSize: 34, fontWeight: '800', color: COLORS.textPrimary },
    changeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: BORDER_RADIUS.sm },
    changeText: { fontSize: 13, fontWeight: '800' },

    // Range bar
    rangeWrap: { marginTop: 18 },
    rangeTrack: { height: 6, backgroundColor: COLORS.surfaceLight, borderRadius: 3, justifyContent: 'center' },
    rangeFill: { position: 'absolute', left: 0, height: 6, borderRadius: 3, opacity: 0.5 },
    rangeMarker: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: COLORS.textPrimary, borderWidth: 2, marginLeft: -6 },
    rangeLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
    rangeLabel: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '700' },
    rangeLabelMid: { fontSize: 10, color: COLORS.textMuted, fontWeight: '600' },

    // Metrics grid
    metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: SPACING.xs },
    metricCard: { width: '31.5%', backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md, padding: 12, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
    metricIcon: { width: 26, height: 26, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
    metricLabel: { fontSize: 10, color: COLORS.textMuted, fontWeight: '600' },
    metricValue: { fontSize: 14, fontWeight: '800', color: COLORS.textPrimary, marginTop: 2 },

    // Spread
    spreadRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.xs, marginBottom: SPACING.md },
    spreadBox: { flex: 1, borderRadius: BORDER_RADIUS.md, padding: 12, alignItems: 'center' },
    spreadLabel: { fontSize: 10, color: COLORS.textSecondary, fontWeight: '700', letterSpacing: 1 },
    spreadValue: { fontSize: 16, fontWeight: '800', marginTop: 4 },

    // Chart widget
    widgetCard: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
    widgetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingHorizontal: 2 },
    sectionHeader: { fontSize: 16, fontWeight: '800', color: COLORS.textPrimary },
    widgetSub: { fontSize: 10, color: COLORS.textMuted, fontWeight: '600' },
    chartStyle: { marginVertical: 4, borderRadius: 16, alignSelf: 'center' },
    chartStatsRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border },
    chartStat: { alignItems: 'center' },
    chartStatLabel: { fontSize: 10, color: COLORS.textMuted, fontWeight: '600', marginBottom: 4 },
    chartStatVal: { fontSize: 14, fontWeight: '800' },
    noChartBox: { height: 150, justifyContent: 'center', alignItems: 'center', gap: 8 },
    noChartText: { color: COLORS.textSecondary, fontWeight: '600' },

    backBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: SPACING.lg, padding: 14, backgroundColor: COLORS.surfaceLight, borderRadius: BORDER_RADIUS.md },
    backBtnText: { color: COLORS.textPrimary, fontWeight: '700' }
});

export default AnalysisModal;
