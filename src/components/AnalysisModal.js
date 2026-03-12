import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ActivityIndicator, ScrollView, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LineChart } from 'react-native-chart-kit';
import { COLORS, BORDER_RADIUS, SPACING } from '../theme/colors';
import ShoonyaApi from '../api/ShoonyaApi';
import { formatCurrency } from '../utils/helpers';

const { width } = Dimensions.get('window');

const AnalysisModal = ({ visible, onClose, isConnected }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);
    
    const [selectedStock, setSelectedStock] = useState(null);
    const [quoteData, setQuoteData] = useState(null);
    const [chartData, setChartData] = useState(null);
    const [loadingData, setLoadingData] = useState(false);

    const handleSearch = async () => {
        if (!isConnected) { alert('Connect to Shoonya first!'); return; }
        if (!searchQuery.trim()) return;
        setSearching(true);
        try {
            const res = await ShoonyaApi.searchScrip(searchQuery.toUpperCase(), 'NSE');
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
            const quoteRes = await ShoonyaApi.getQuotes(stock.exch, stock.token);
            if (quoteRes && quoteRes.stat === 'Ok') {
                setQuoteData(quoteRes);
            }

            // Get Chart Data (TPSeries)
            const endTime = Math.floor(Date.now() / 1000);
            const startTime = endTime - (7 * 24 * 60 * 60); // past 7 days roughly
            
            const chartRes = await ShoonyaApi.getChartData(stock.exch, stock.token, startTime.toString(), endTime.toString(), '60'); // 60 min interval
            
            if (chartRes && chartRes.length > 0) {
                // Ensure chartRes is an array and reverse it to have oldest to newest if needed
                const historical = Array.isArray(chartRes) ? [...chartRes].reverse() : [];
                if (historical.length > 0) {
                    // sample last N points
                    const points = historical.slice(-30);
                    const labels = points.map(p => p.time.split(' ')[1] || '').filter((_, i) => i % 5 === 0);
                    const values = points.map(p => parseFloat(p.into || p.c || 0)); // 'into' is close price in some versions, 'c' in others
                    
                    if (values.length > 0 && !values.includes(NaN)) {
                        setChartData({
                            labels: labels.length > 0 ? labels : ['0'],
                            datasets: [{ data: values }]
                        });
                    }
                }
            } else {
                setChartData(null);
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
        onClose();
    };

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View style={s.modalOverlay}>
                <View style={s.modalContent}>
                    <View style={s.modalHeader}>
                        <Text style={s.modalTitle}>Stock Analysis</Text>
                        <TouchableOpacity onPress={reset}><Ionicons name="close" size={24} color={COLORS.textSecondary}/></TouchableOpacity>
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

                    {/* Analysis Content */}
                    {loadingData && (
                        <View style={s.loadingBox}>
                            <ActivityIndicator size="large" color={COLORS.primary} />
                            <Text style={s.loadingText}>Fetching Market Data...</Text>
                        </View>
                    )}

                    {!loadingData && selectedStock && quoteData && (
                        <ScrollView style={s.analysisBody} showsVerticalScrollIndicator={false}>
                            <View style={s.quoteHeader}>
                                <Text style={s.tickerText}>{selectedStock.tsym}</Text>
                                <Text style={s.exchText}>{selectedStock.exch}</Text>
                            </View>
                            
                            <Text style={s.ltpText}>₹{quoteData.lp || quoteData.ltp || '--'}</Text>
                            
                            <View style={s.quoteDetailsRow}>
                                <View style={s.qBox}><Text style={s.qLabel}>Open</Text><Text style={s.qVal}>{quoteData.o || '--'}</Text></View>
                                <View style={s.qBox}><Text style={s.qLabel}>High</Text><Text style={[s.qVal, {color: COLORS.accentGreen}]}>{quoteData.h || '--'}</Text></View>
                                <View style={s.qBox}><Text style={s.qLabel}>Low</Text><Text style={[s.qVal, {color: COLORS.accentRed}]}>{quoteData.l || '--'}</Text></View>
                                <View style={s.qBox}><Text style={s.qLabel}>Close</Text><Text style={s.qVal}>{quoteData.c || '--'}</Text></View>
                            </View>

                            <View style={s.vwapBox}>
                                <Text style={s.qLabel}>Volume</Text>
                                <Text style={s.qVal}>{quoteData.v || '--'}</Text>
                            </View>

                            {/* Chart */}
                            {chartData && chartData.datasets[0].data.length > 0 ? (
                                <View style={s.chartContainer}>
                                    <Text style={s.sectionHeader}>Price Trend (Last N intervals)</Text>
                                    <LineChart
                                        data={chartData}
                                        width={width - SPACING.xl * 2 - 40} // responsive width
                                        height={220}
                                        withDots={false}
                                        withInnerLines={false}
                                        yAxisLabel="₹"
                                        chartConfig={{
                                            backgroundColor: COLORS.surface,
                                            backgroundGradientFrom: COLORS.surface,
                                            backgroundGradientTo: COLORS.surface,
                                            decimalPlaces: 1, // optional, defaults to 2dp
                                            color: (opacity = 1) => `rgba(134, 65, 244, ${opacity})`,
                                            labelColor: (opacity = 1) => COLORS.textSecondary,
                                            style: { borderRadius: 16 },
                                            propsForBackgroundLines: { strokeDasharray: "" }
                                        }}
                                        bezier
                                        style={s.chartStyle}
                                    />
                                </View>
                            ) : (
                                <View style={s.noChartBox}>
                                    <Text style={s.noChartText}>Chart Data Unavailable</Text>
                                </View>
                            )}
                            
                            <TouchableOpacity style={s.backBtn} onPress={() => { setSelectedStock(null); setQuoteData(null); setChartData(null); }}>
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
    modalContent: { backgroundColor: COLORS.surface, borderTopLeftRadius: BORDER_RADIUS.xl, borderTopRightRadius: BORDER_RADIUS.xl, height: '85%', padding: SPACING.xl, paddingBottom: 40 },
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
    ltpText: { fontSize: 36, fontWeight: '800', color: COLORS.accentGreen, marginVertical: 12 },
    quoteDetailsRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: COLORS.background, padding: 12, borderRadius: BORDER_RADIUS.md, marginBottom: 16 },
    qBox: { alignItems: 'center' },
    qLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: '600', marginBottom: 4 },
    qVal: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
    vwapBox: { backgroundColor: COLORS.background, padding: 12, borderRadius: BORDER_RADIUS.md, marginBottom: SPACING.lg },
    sectionHeader: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 12 },
    chartContainer: { backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.md, padding: 10, overflow: 'hidden' },
    chartStyle: { marginVertical: 8, borderRadius: 16, alignSelf: 'center' },
    noChartBox: { height: 150, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.md, marginBottom: 20 },
    noChartText: { color: COLORS.textSecondary, fontWeight: '600' },
    backBtn: { marginTop: 20, padding: 14, backgroundColor: COLORS.border, borderRadius: BORDER_RADIUS.md, alignItems: 'center' },
    backBtnText: { color: COLORS.textPrimary, fontWeight: '700' }
});

export default AnalysisModal;
