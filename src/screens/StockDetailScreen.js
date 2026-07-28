import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, Dimensions, RefreshControl
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LineChart } from 'react-native-chart-kit';
import { COLORS, BORDER_RADIUS, SPACING } from '../theme/colors';
import ShoonyaApi from '../api/ShoonyaApi';
import { formatCurrency } from '../utils/helpers';

const { width } = Dimensions.get('window');
const CHART_WIDTH = width - SPACING.lg * 2 - 10;

const INTERVALS = [
    { label: '1m', value: '1', days: 1 },
    { label: '5m', value: '5', days: 2 },
    { label: '15m', value: '15', days: 5 },
    { label: '1H', value: '60', days: 7 },
    { label: '1D', value: '240', days: 90 },
];

const StockDetailScreen = ({ route, navigation }) => {
    const { symbol, exchange, token, companyName, isConnected } = route.params;

    const [quoteData, setQuoteData] = useState(null);
    const [chartData, setChartData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedInterval, setSelectedInterval] = useState(INTERVALS[3]); // 1H default

    const fetchData = useCallback(async () => {
        if (!isConnected || !token) {
            setLoading(false);
            return;
        }
        try {
            // Get quote
            const quoteRes = await ShoonyaApi.getQuotes(exchange, token);
            if (quoteRes && quoteRes.stat === 'Ok') {
                setQuoteData(quoteRes);
            }

            // Get chart data
            const endTime = Math.floor(Date.now() / 1000);
            const startTime = endTime - (selectedInterval.days * 24 * 60 * 60);
            const chartRes = await ShoonyaApi.getChartData(
                exchange, token,
                startTime.toString(), endTime.toString(),
                selectedInterval.value
            );

            if (chartRes && Array.isArray(chartRes) && chartRes.length > 0) {
                const historical = [...chartRes].reverse();
                const maxPoints = 40;
                const step = Math.max(1, Math.floor(historical.length / maxPoints));
                const sampled = historical.filter((_, i) => i % step === 0);

                const labelStep = Math.max(1, Math.floor(sampled.length / 6));
                const labels = sampled.map((p, i) => {
                    if (i % labelStep === 0) {
                        const time = p.time || '';
                        if (selectedInterval.value === '240') {
                            // Show date for daily
                            return time.split(' ')[0]?.slice(5) || '';
                        }
                        return time.split(' ')[1]?.slice(0, 5) || '';
                    }
                    return '';
                });

                const values = sampled.map(p => parseFloat(p.intc || p.into || p.c || 0));
                const validValues = values.filter(v => !isNaN(v) && v > 0);

                if (validValues.length > 2) {
                    setChartData({
                        labels,
                        datasets: [{ data: validValues }]
                    });
                } else {
                    setChartData(null);
                }
            } else {
                setChartData(null);
            }
        } catch (e) {
            console.error('StockDetail fetch error:', e);
        } finally {
            setLoading(false);
        }
    }, [isConnected, token, exchange, selectedInterval]);

    useEffect(() => {
        setLoading(true);
        fetchData();
    }, [fetchData]);

    const onRefresh = async () => {
        setRefreshing(true);
        await fetchData();
        setRefreshing(false);
    };

    const ltp = quoteData ? parseFloat(quoteData.lp || quoteData.ltp || 0) : 0;
    const prevClose = quoteData ? parseFloat(quoteData.c || quoteData.pc || 0) : 0;
    const change = prevClose > 0 ? ltp - prevClose : 0;
    const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;
    const isUp = change >= 0;

    return (
        <View style={s.container}>
            <ScrollView
                style={s.scrollView}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
            >
                {/* Header */}
                <View style={s.header}>
                    <View style={s.headerLeft}>
                        <Text style={s.symbolText}>{symbol}</Text>
                        <View style={s.exchBadge}>
                            <Text style={s.exchBadgeText}>{exchange}</Text>
                        </View>
                    </View>
                    {companyName ? <Text style={s.companyName} numberOfLines={1}>{companyName}</Text> : null}
                </View>

                {loading ? (
                    <View style={s.loadingBox}>
                        <ActivityIndicator size="large" color={COLORS.primary} />
                        <Text style={s.loadingText}>Fetching market data...</Text>
                    </View>
                ) : !isConnected ? (
                    <View style={s.loadingBox}>
                        <Ionicons name="cloud-offline" size={48} color={COLORS.textMuted} />
                        <Text style={s.loadingText}>Connect to Shoonya to view live data</Text>
                    </View>
                ) : (
                    <>
                        {/* Price Section */}
                        <View style={s.priceSection}>
                            <Text style={s.ltpText}>₹{ltp.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
                            <View style={[s.changePill, { backgroundColor: isUp ? COLORS.accentGreen + '15' : COLORS.accentRed + '15' }]}>
                                <Ionicons name={isUp ? 'caret-up' : 'caret-down'} size={14} color={isUp ? COLORS.accentGreen : COLORS.accentRed} />
                                <Text style={[s.changeAmount, { color: isUp ? COLORS.accentGreen : COLORS.accentRed }]}>
                                    {change >= 0 ? '+' : ''}{change.toFixed(2)} ({changePct.toFixed(2)}%)
                                </Text>
                            </View>
                        </View>

                        {/* OHLC Cards */}
                        {quoteData && (
                            <View style={s.ohlcRow}>
                                <View style={s.ohlcCard}>
                                    <Text style={s.ohlcLabel}>Open</Text>
                                    <Text style={s.ohlcValue}>{quoteData.o || '--'}</Text>
                                </View>
                                <View style={s.ohlcCard}>
                                    <Text style={s.ohlcLabel}>High</Text>
                                    <Text style={[s.ohlcValue, { color: COLORS.accentGreen }]}>{quoteData.h || '--'}</Text>
                                </View>
                                <View style={s.ohlcCard}>
                                    <Text style={s.ohlcLabel}>Low</Text>
                                    <Text style={[s.ohlcValue, { color: COLORS.accentRed }]}>{quoteData.l || '--'}</Text>
                                </View>
                                <View style={s.ohlcCard}>
                                    <Text style={s.ohlcLabel}>Prev Close</Text>
                                    <Text style={s.ohlcValue}>{quoteData.c || quoteData.pc || '--'}</Text>
                                </View>
                            </View>
                        )}

                        {/* Interval Selector */}
                        <View style={s.intervalRow}>
                            {INTERVALS.map((int) => (
                                <TouchableOpacity
                                    key={int.label}
                                    style={[s.intervalBtn, selectedInterval.label === int.label && s.intervalBtnActive]}
                                    onPress={() => setSelectedInterval(int)}
                                >
                                    <Text style={[s.intervalBtnText, selectedInterval.label === int.label && s.intervalBtnTextActive]}>
                                        {int.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* Chart */}
                        <View style={s.chartSection}>
                            <Text style={s.sectionTitle}>Price Chart</Text>
                            {chartData && chartData.datasets[0].data.length > 2 ? (
                                <View style={s.chartContainer}>
                                    <LineChart
                                        data={chartData}
                                        width={CHART_WIDTH}
                                        height={250}
                                        withDots={false}
                                        withInnerLines={true}
                                        withOuterLines={false}
                                        yAxisLabel="₹"
                                        yAxisSuffix=""
                                        chartConfig={{
                                            backgroundColor: COLORS.surface,
                                            backgroundGradientFrom: COLORS.surface,
                                            backgroundGradientTo: COLORS.background,
                                            decimalPlaces: 1,
                                            color: (opacity = 1) => isUp ? `rgba(0, 230, 118, ${opacity})` : `rgba(255, 82, 82, ${opacity})`,
                                            labelColor: () => COLORS.textMuted,
                                            style: { borderRadius: 12 },
                                            propsForBackgroundLines: {
                                                strokeDasharray: '4 4',
                                                stroke: COLORS.border,
                                                strokeWidth: 0.5
                                            },
                                            fillShadowGradientFrom: isUp ? COLORS.accentGreen : COLORS.accentRed,
                                            fillShadowGradientFromOpacity: 0.15,
                                            fillShadowGradientTo: COLORS.surface,
                                            fillShadowGradientToOpacity: 0,
                                        }}
                                        bezier
                                        style={s.chartStyle}
                                    />
                                </View>
                            ) : (
                                <View style={s.noChartBox}>
                                    <Ionicons name="analytics-outline" size={36} color={COLORS.textMuted} />
                                    <Text style={s.noChartText}>Chart data not available for this interval</Text>
                                </View>
                            )}
                        </View>

                        {/* Volume & Additional Info */}
                        {quoteData && (
                            <View style={s.infoSection}>
                                <Text style={s.sectionTitle}>Market Info</Text>
                                <View style={s.infoGrid}>
                                    <View style={s.infoItem}>
                                        <Text style={s.infoLabel}>Volume</Text>
                                        <Text style={s.infoValue}>{quoteData.v ? parseInt(quoteData.v).toLocaleString('en-IN') : '--'}</Text>
                                    </View>
                                    <View style={s.infoItem}>
                                        <Text style={s.infoLabel}>Avg Price</Text>
                                        <Text style={s.infoValue}>{quoteData.ap || '--'}</Text>
                                    </View>
                                    <View style={s.infoItem}>
                                        <Text style={s.infoLabel}>Upper Circuit</Text>
                                        <Text style={[s.infoValue, { color: COLORS.accentGreen }]}>{quoteData.uc || '--'}</Text>
                                    </View>
                                    <View style={s.infoItem}>
                                        <Text style={s.infoLabel}>Lower Circuit</Text>
                                        <Text style={[s.infoValue, { color: COLORS.accentRed }]}>{quoteData.lc || '--'}</Text>
                                    </View>
                                    <View style={s.infoItem}>
                                        <Text style={s.infoLabel}>52W High</Text>
                                        <Text style={[s.infoValue, { color: COLORS.accentGreen }]}>{quoteData['52h'] || '--'}</Text>
                                    </View>
                                    <View style={s.infoItem}>
                                        <Text style={s.infoLabel}>52W Low</Text>
                                        <Text style={[s.infoValue, { color: COLORS.accentRed }]}>{quoteData['52l'] || '--'}</Text>
                                    </View>
                                    <View style={s.infoItem}>
                                        <Text style={s.infoLabel}>Bid Qty</Text>
                                        <Text style={s.infoValue}>{quoteData.bq1 || '--'}</Text>
                                    </View>
                                    <View style={s.infoItem}>
                                        <Text style={s.infoLabel}>Ask Qty</Text>
                                        <Text style={s.infoValue}>{quoteData.sq1 || '--'}</Text>
                                    </View>
                                </View>
                            </View>
                        )}
                    </>
                )}
                <View style={{ height: 40 }} />
            </ScrollView>
        </View>
    );
};

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    scrollView: { flex: 1, paddingHorizontal: SPACING.lg },
    // Header
    header: { marginTop: SPACING.md, marginBottom: SPACING.sm },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    symbolText: { fontSize: 24, fontWeight: '900', color: COLORS.textPrimary },
    exchBadge: { backgroundColor: COLORS.primary + '20', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    exchBadgeText: { fontSize: 10, fontWeight: '800', color: COLORS.primary },
    companyName: { fontSize: 13, color: COLORS.textSecondary, marginTop: 4 },
    // Loading
    loadingBox: { justifyContent: 'center', alignItems: 'center', paddingVertical: 80 },
    loadingText: { color: COLORS.textMuted, marginTop: 12, fontSize: 14, fontWeight: '600' },
    // Price
    priceSection: { marginBottom: SPACING.lg },
    ltpText: { fontSize: 38, fontWeight: '900', color: COLORS.textPrimary },
    changePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, alignSelf: 'flex-start', marginTop: 8 },
    changeAmount: { fontSize: 14, fontWeight: '700' },
    // OHLC
    ohlcRow: { flexDirection: 'row', gap: 8, marginBottom: SPACING.lg },
    ohlcCard: { flex: 1, backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
    ohlcLabel: { fontSize: 10, color: COLORS.textMuted, fontWeight: '600', marginBottom: 4 },
    ohlcValue: { fontSize: 13, fontWeight: '800', color: COLORS.textPrimary },
    // Intervals
    intervalRow: { flexDirection: 'row', gap: 8, marginBottom: SPACING.lg },
    intervalBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: COLORS.surface, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
    intervalBtnActive: { backgroundColor: COLORS.primary + '20', borderColor: COLORS.primary },
    intervalBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted },
    intervalBtnTextActive: { color: COLORS.primary },
    // Chart
    chartSection: { marginBottom: SPACING.lg },
    sectionTitle: { fontSize: 16, fontWeight: '800', color: COLORS.textPrimary, marginBottom: SPACING.md },
    chartContainer: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, padding: 8, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border },
    chartStyle: { borderRadius: 12 },
    noChartBox: { height: 180, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, borderWidth: 1, borderColor: COLORS.border },
    noChartText: { color: COLORS.textSecondary, fontWeight: '600', marginTop: 10, fontSize: 13 },
    // Info
    infoSection: { marginBottom: SPACING.xl },
    infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    infoItem: { width: (width - SPACING.lg * 2 - 8) / 2 - 4, backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md, padding: 14, borderWidth: 1, borderColor: COLORS.border },
    infoLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: '600', marginBottom: 4 },
    infoValue: { fontSize: 15, fontWeight: '800', color: COLORS.textPrimary },
});

export default StockDetailScreen;
