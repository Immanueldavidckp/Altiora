import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Alert, RefreshControl, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, BORDER_RADIUS, SPACING } from '../theme/colors';
import { Card, StatCard, EmptyState, SectionHeader } from '../components/Card';
import { formatCurrency, getTodayKey, getRelativeDate, formatDate, formatDateKey } from '../utils/helpers';
import { addTrade, getTrades, getTradeSummary, deleteTrade, saveFlatTradeConfig, getFlatTradeConfig, saveFlatTradeToken, getTradingPresets, saveTradingPreset, deleteTradingPreset } from '../db/database';
import FlatTradeApi from '../api/FlatTradeApi';
import AnalysisModal from '../components/AnalysisModal';
import FlatTradeLoginModal from '../components/FlatTradeLoginModal';

const DEFAULT_REDIRECT = 'https://trade.scratchforge.in/';

const TradingTracker = () => {
    // Standard data
    const [trades, setTrades] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [showConfigModal, setShowConfigModal] = useState(false);
    const [showPresetModal, setShowPresetModal] = useState(false);
    const [showAnalysisModal, setShowAnalysisModal] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedDate, setSelectedDate] = useState(getTodayKey());
    const [monthlySummary, setMonthlySummary] = useState({});

    // Trade form
    const [startingMoney, setStartingMoney] = useState('');
    const [endingMoney, setEndingMoney] = useState('');
    const [buyAmount, setBuyAmount] = useState('');
    const [sellAmount, setSellAmount] = useState('');
    const [tradeNotes, setTradeNotes] = useState('');

    // FlatTrade state
    const [config, setConfig] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const [connecting, setConnecting] = useState(false);
    const [margin, setMargin] = useState(null);
    const [presets, setPresets] = useState([]);
    const [showLoginModal, setShowLoginModal] = useState(false);

    // Config form
    const [userId, setUserId] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [apiSecret, setApiSecret] = useState('');
    const [redirectUrl, setRedirectUrl] = useState(DEFAULT_REDIRECT);
    
    // Preset form
    const [presetName, setPresetName] = useState('');
    const [presetSymbol, setPresetSymbol] = useState('');
    const [presetQty, setPresetQty] = useState('1');
    const [presetExchange, setPresetExchange] = useState('NSE');

    const loadData = useCallback(async () => {
        try {
            const data = await getTrades(selectedDate);
            setTrades(data);
            const now = new Date();
            const sm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
            const em = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-31`;
            const summary = await getTradeSummary(sm, em);
            setMonthlySummary(summary || {});

            const cfg = await getFlatTradeConfig();
            setConfig(cfg);
            if (cfg) {
                setUserId(cfg.user_id || '');
                setApiKey(cfg.api_key || '');
                setApiSecret(cfg.api_secret || '');
                setRedirectUrl(cfg.redirect_url || DEFAULT_REDIRECT);
            }

            const prs = await getTradingPresets();
            setPresets(prs);
        } catch (err) { console.error(err); }
    }, [selectedDate]);

    useEffect(() => { loadData(); }, [loadData]);

    const goLive = async () => {
        setIsConnected(true);
        try {
            const limits = await FlatTradeApi.getLimits();
            setMargin(limits);
        } catch (e) { /* margin is best-effort */ }
    };

    const handleConnect = async () => {
        if (!config || !config.api_key || !config.api_secret) { setShowConfigModal(true); return; }
        setConnecting(true);
        try {
            // Reuse today's token if we already exchanged one (FlatTrade tokens
            // are valid for the trading day only).
            if (config.access_token && config.token_date === getTodayKey()) {
                FlatTradeApi.setSession(config.user_id, config.access_token);
                await goLive();
            } else {
                // Need a fresh login: open the FlatTrade WebView OAuth flow.
                setShowLoginModal(true);
            }
        } catch (e) {
            Alert.alert('Error', 'Could not connect. Check your credentials and internet.');
        } finally {
            setConnecting(false);
        }
    };

    // Called by the WebView modal once it captures ?code= from the redirect.
    const handleAuthCode = async (code) => {
        setShowLoginModal(false);
        setConnecting(true);
        try {
            FlatTradeApi.setSession(config.user_id, null);
            const res = await FlatTradeApi.getToken(config.api_key, code, config.api_secret);
            if (res.success) {
                await saveFlatTradeToken(res.token, getTodayKey());
                await goLive();
                loadData();
            } else {
                Alert.alert('Login Failed', res.message || 'Token exchange failed');
            }
        } catch (e) {
            Alert.alert('Error', 'Token exchange failed. Try again.');
        } finally {
            setConnecting(false);
        }
    };

    const handleQuickOrder = async (preset, type) => {
        if (!isConnected) { Alert.alert('Not Connected', 'Please connect to FlatTrade first'); return; }
        try {
            const res = await FlatTradeApi.placeOrder({
                tsym: preset.symbol,
                qty: preset.quantity,
                trantype: type, // B or S
                exch: preset.exchange,
                prd: preset.product_type
            });
            if (res.stat === 'Ok') {
                Alert.alert('Order Placed', `${type === 'B' ? 'Bought' : 'Sold'} ${preset.quantity} of ${preset.symbol}`);
                // Record it locally too if needed
            } else {
                Alert.alert('Order Failed', res.emsg);
            }
        } catch (e) {
            Alert.alert('Error', 'Order execution failed');
        }
    };

    const saveConfig = async () => {
        if (!userId || !apiKey || !apiSecret) { Alert.alert('Error', 'Client ID, API Key and API Secret are required'); return; }
        await saveFlatTradeConfig({ user_id: userId.trim(), api_key: apiKey.trim(), api_secret: apiSecret.trim(), redirect_url: redirectUrl.trim() || DEFAULT_REDIRECT });
        setShowConfigModal(false);
        loadData();
    };

    const addPreset = async () => {
        if (!presetName || !presetSymbol) { Alert.alert('Error', 'Name and Symbol required'); return; }
        await saveTradingPreset({ name: presetName, symbol: presetSymbol, quantity: parseInt(presetQty), exchange: presetExchange });
        setShowPresetModal(false);
        setPresetName(''); setPresetSymbol(''); setPresetQty('1');
        loadData();
    };

    const onRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

    const handleSubmit = async () => {
        if (!startingMoney && !buyAmount && !sellAmount) { Alert.alert('Error', 'Enter at least one value'); return; }
        try {
            await addTrade({ date: selectedDate, starting_money: parseFloat(startingMoney) || 0, ending_money: parseFloat(endingMoney) || 0, buy_amount: parseFloat(buyAmount) || 0, sell_amount: parseFloat(sellAmount) || 0, notes: tradeNotes.trim() });
            setShowModal(false); resetForm(); loadData();
        } catch (err) { Alert.alert('Error', 'Failed to save'); }
    };

    const resetForm = () => { setStartingMoney(''); setEndingMoney(''); setBuyAmount(''); setSellAmount(''); setTradeNotes(''); };

    const dayPnL = trades.reduce((s, t) => s + (t.profit_loss || 0), 0);
    const dayBought = trades.reduce((s, t) => s + (t.buy_amount || 0), 0);
    const daySold = trades.reduce((s, t) => s + (t.sell_amount || 0), 0);

    return (
        <View style={s.container}>
            {/* Header / Date */}
            <View style={s.dateSelector}>
                <TouchableOpacity onPress={() => navigateDate(-1)} style={s.dateArrow}><Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} /></TouchableOpacity>
                <TouchableOpacity onPress={() => setSelectedDate(getTodayKey())}>
                    <Text style={s.dateText}>{getRelativeDate(selectedDate)}</Text>
                    <Text style={s.dateSubText}>{formatDate(selectedDate)}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => navigateDate(1)} style={s.dateArrow}><Ionicons name="chevron-forward" size={22} color={COLORS.textPrimary} /></TouchableOpacity>
            </View>

            {/* FlatTrade Connection Bar */}
            <View style={[s.shoonyaBar, isConnected && s.shoonyaBarConnected]}>
                <View style={s.shoonyaInfo}>
                    <Ionicons name="flash" size={18} color={isConnected ? COLORS.accentGreen : COLORS.textMuted} />
                    <Text style={s.shoonyaStatus}>{isConnected ? 'FlatTrade Connected' : 'FlatTrade Offline'}</Text>
                    {isConnected && margin && (
                        <Text style={s.shoonyaBalance}>Base: {formatCurrency(parseFloat(margin.cash) || 0)}</Text>
                    )}
                </View>
                <TouchableOpacity style={s.connectBtn} onPress={() => isConnected ? (FlatTradeApi.clearSession(), setIsConnected(false)) : handleConnect()}>
                    {connecting ? <ActivityIndicator size="small" color="#FFF" /> : (
                        <Text style={s.connectBtnText}>{isConnected ? 'Disconnect' : 'Connect'}</Text>
                    )}
                </TouchableOpacity>
                <TouchableOpacity style={s.settingsIcon} onPress={() => setShowAnalysisModal(true)}>
                    <Ionicons name="bar-chart-outline" size={20} color={COLORS.primary} />
                </TouchableOpacity>
                <TouchableOpacity style={s.settingsIcon} onPress={() => setShowConfigModal(true)}>
                    <Ionicons name="settings-outline" size={20} color={COLORS.textSecondary} />
                </TouchableOpacity>
            </View>

            {/* Quick Order Presets */}
            {presets.length > 0 && (
                <View style={s.presetSection}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                        {presets.map(p => (
                            <View key={p.id} style={s.presetCard}>
                                <View style={s.presetHeader}>
                                    <Text style={s.presetName}>{p.name}</Text>
                                    <TouchableOpacity onPress={() => deleteTradingPreset(p.id).then(loadData)}>
                                        <Ionicons name="close" size={14} color={COLORS.textMuted} />
                                    </TouchableOpacity>
                                </View>
                                <Text style={s.presetSym}>{p.symbol} ({p.quantity})</Text>
                                <View style={s.presetActions}>
                                    <TouchableOpacity style={[s.qBtn, s.qBuy]} onPress={() => handleQuickOrder(p, 'B')}>
                                        <Text style={s.qBtnText}>BUY</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={[s.qBtn, s.qSell]} onPress={() => handleQuickOrder(p, 'S')}>
                                        <Text style={s.qBtnText}>SELL</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ))}
                        <TouchableOpacity style={s.addPresetBtn} onPress={() => setShowPresetModal(true)}>
                            <Ionicons name="add" size={24} color={COLORS.textMuted} />
                        </TouchableOpacity>
                    </ScrollView>
                </View>
            )}

            {/* P&L Cards */}
            <View style={[s.pnlCard, { borderLeftColor: dayPnL >= 0 ? COLORS.accentGreen : COLORS.accentRed }]}>
                <Text style={s.pnlLabel}>Today's P&L</Text>
                <Text style={[s.pnlValue, { color: dayPnL >= 0 ? COLORS.accentGreen : COLORS.accentRed }]}>{dayPnL >= 0 ? '+' : ''}{formatCurrency(dayPnL)}</Text>
                <View style={s.pnlRow}>
                    <View style={{ flex: 1 }}><Text style={s.pnlItemLabel}>Bought</Text><Text style={[s.pnlItemVal, { color: COLORS.accentRed }]}>{formatCurrency(dayBought)}</Text></View>
                    <View style={{ width: 1, backgroundColor: COLORS.border, marginHorizontal: 12 }} />
                    <View style={{ flex: 1 }}><Text style={s.pnlItemLabel}>Sold</Text><Text style={[s.pnlItemVal, { color: COLORS.accentGreen }]}>{formatCurrency(daySold)}</Text></View>
                </View>
            </View>

            <View style={s.summaryRow}>
                <StatCard title="Monthly P&L" value={formatCurrency(monthlySummary.total_pnl || 0)} color={(monthlySummary.total_pnl || 0) >= 0 ? COLORS.accentGreen : COLORS.accentRed} subtitle={`${monthlySummary.count || 0} trades`} />
                <StatCard title="Total Bought" value={formatCurrency(monthlySummary.total_bought || 0)} color={COLORS.accentOrange} />
            </View>

            {/* List */}
            <SectionHeader title="Trade Entries" rightText={`${trades.length} entries`} />
            <ScrollView style={s.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}>
                {trades.length === 0 ? <EmptyState title="No trades recorded" subtitle="Connect FlatTrade for live or manual log below" emoji="📉" /> :
                    trades.map(t => (
                        <Card key={t.id} onPress={() => {}}>
                            <View style={s.tradeRow}>
                                <View style={{ flex: 1 }}>
                                    <View style={s.tradeMoneyRow}>
                                        <Text style={s.tmVal}>{t.notes || 'Trade entry'}</Text>
                                    </View>
                                    <View style={s.tradeBuySell}>
                                        <Text style={[s.tbs, { color: COLORS.accentRed }]}>B: {formatCurrency(t.buy_amount)}</Text>
                                        <Text style={[s.tbs, { color: COLORS.accentGreen }]}>S: {formatCurrency(t.sell_amount)}</Text>
                                    </View>
                                </View>
                                <View style={[s.tradePnl, { backgroundColor: t.profit_loss >= 0 ? COLORS.accentGreen + '15' : COLORS.accentRed + '15' }]}>
                                    <Text style={[s.tradePnlText, { color: t.profit_loss >= 0 ? COLORS.accentGreen : COLORS.accentRed }]}>{t.profit_loss >= 0 ? '+' : ''}{formatCurrency(t.profit_loss)}</Text>
                                </View>
                            </View>
                        </Card>
                    ))
                }
                <View style={{ height: 100 }} />
            </ScrollView>

            <TouchableOpacity style={s.fab} onPress={() => setShowModal(true)}><Ionicons name="add" size={28} color="#FFF" /></TouchableOpacity>

            {/* Config Modal */}
            <Modal visible={showConfigModal} animationType="fade" transparent>
                <View style={s.modalOverlay}>
                    <View style={s.modalContent}>
                        <View style={s.modalHeader}>
                            <Text style={s.modalTitle}>FlatTrade API Config</Text>
                            <TouchableOpacity onPress={() => setShowConfigModal(false)}><Ionicons name="close" size={24} color={COLORS.textSecondary}/></TouchableOpacity>
                        </View>
                        <TextInput style={s.input} value={userId} onChangeText={setUserId} placeholder="Client ID (e.g. FZ46051)" autoCapitalize="characters" placeholderTextColor={COLORS.textMuted}/>
                        <TextInput style={s.input} value={apiKey} onChangeText={setApiKey} placeholder="API Key" autoCapitalize="none" placeholderTextColor={COLORS.textMuted}/>
                        <TextInput style={s.input} value={apiSecret} onChangeText={setApiSecret} placeholder="API Secret" autoCapitalize="none" secureTextEntry placeholderTextColor={COLORS.textMuted}/>
                        <TextInput style={s.input} value={redirectUrl} onChangeText={setRedirectUrl} placeholder="Redirect URL" autoCapitalize="none" placeholderTextColor={COLORS.textMuted}/>
                        <Text style={s.configHint}>Must match the Redirect URL set on wall.flattrade.in. You'll log in via FlatTrade once per day.</Text>
                        <TouchableOpacity style={s.submitBtn} onPress={saveConfig}><Text style={s.submitBtnText}>Save Config</Text></TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Preset Modal */}
            <Modal visible={showPresetModal} animationType="fade" transparent>
                <View style={s.modalOverlay}>
                    <View style={s.modalContent}>
                        <View style={s.modalHeader}>
                            <Text style={s.modalTitle}>Add Quick Preset</Text>
                            <TouchableOpacity onPress={() => setShowPresetModal(false)}><Ionicons name="close" size={24} color={COLORS.textSecondary}/></TouchableOpacity>
                        </View>
                        <TextInput style={s.input} value={presetName} onChangeText={setPresetName} placeholder="Name (e.g. NIFTY ATM)" placeholderTextColor={COLORS.textMuted}/>
                        <TextInput style={s.input} value={presetSymbol} onChangeText={setPresetSymbol} placeholder="Symbol (e.g. NIFTY13MAR24P22400)" placeholderTextColor={COLORS.textMuted}/>
                        <View style={s.row}>
                             <TextInput style={[s.input, {flex:1}]} value={presetQty} onChangeText={setPresetQty} placeholder="Qty" keyboardType="numeric" placeholderTextColor={COLORS.textMuted}/>
                             <TextInput style={[s.input, {flex: 1}]} value={presetExchange} onChangeText={setPresetExchange} placeholder="Exch (NSE/NFO)" placeholderTextColor={COLORS.textMuted}/>
                        </View>
                        <TouchableOpacity style={s.submitBtn} onPress={addPreset}><Text style={s.submitBtnText}>Save Preset</Text></TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Analysis Modal */}
            <AnalysisModal
                visible={showAnalysisModal}
                onClose={() => setShowAnalysisModal(false)}
                isConnected={isConnected}
            />

            {/* FlatTrade OAuth Login (WebView) */}
            <FlatTradeLoginModal
                visible={showLoginModal}
                apiKey={config?.api_key}
                onCode={handleAuthCode}
                onClose={() => { setShowLoginModal(false); setConnecting(false); }}
            />
        </View>
    );
};

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background, paddingHorizontal: SPACING.lg },
    dateSelector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: SPACING.md, marginBottom: SPACING.sm },
    dateArrow: { padding: SPACING.sm }, dateText: { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary, textAlign: 'center' },
    dateSubText: { fontSize: 12, color: COLORS.textSecondary, textAlign: 'center', marginTop: 2 },
    shoonyaBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md, padding: 12, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
    shoonyaBarConnected: { borderColor: COLORS.accentGreen + '40' },
    shoonyaInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
    shoonyaStatus: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary },
    shoonyaBalance: { fontSize: 12, color: COLORS.accentGreen, fontWeight: '800' },
    connectBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
    connectBtnText: { fontSize: 11, fontWeight: '800', color: '#FFF' },
    settingsIcon: { marginLeft: 12 },
    presetSection: { marginBottom: SPACING.md },
    presetCard: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md, padding: 12, width: 140, borderWidth: 1, borderColor: COLORS.border },
    presetHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    presetName: { fontSize: 11, fontWeight: '800', color: COLORS.primary },
    presetSym: { fontSize: 10, color: COLORS.textSecondary, marginBottom: 8 },
    presetActions: { flexDirection: 'row', gap: 6 },
    qBtn: { flex: 1, paddingVertical: 4, borderRadius: 4, alignItems: 'center' },
    qBuy: { backgroundColor: COLORS.accentRed + '20' },
    qSell: { backgroundColor: COLORS.accentGreen + '20' },
    qBtnText: { fontSize: 10, fontWeight: '900' },
    addPresetBtn: { width: 50, height: '100%', backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: COLORS.border },
    pnlCard: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, padding: SPACING.xl, marginBottom: SPACING.md, borderLeftWidth: 4, borderWidth: 1, borderColor: COLORS.border },
    pnlLabel: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600' }, pnlValue: { fontSize: 32, fontWeight: '900', marginVertical: 4 },
    pnlRow: { flexDirection: 'row', marginTop: SPACING.sm }, pnlItemLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: '600' },
    pnlItemVal: { fontSize: 16, fontWeight: '700', marginTop: 2 }, summaryRow: { flexDirection: 'row', marginBottom: SPACING.sm },
    list: { flex: 1 }, 
    tradeRow: { flexDirection: 'row', alignItems: 'center' },
    tradeMoneyRow: { flexDirection: 'row', alignItems: 'center' }, 
    tmVal: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary }, 
    tradeBuySell: { flexDirection: 'row', gap: 12, marginTop: 4 },
    tbs: { fontSize: 11, fontWeight: '600' },
    tradePnl: { borderRadius: BORDER_RADIUS.sm, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
    tradePnlText: { fontSize: 14, fontWeight: '800' },
    fab: { position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', elevation: 8 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', padding: 20 },
    modalContent: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl, padding: SPACING.xl, borderWidth: 1, borderColor: COLORS.border },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xl },
    modalTitle: { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary },
    input: { backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.md, padding: 14, color: COLORS.textPrimary, fontSize: 14, borderWidth: 1, borderColor: COLORS.border, marginBottom: 12 },
    configHint: { fontSize: 11, color: COLORS.textMuted, marginBottom: 4, lineHeight: 16 },
    row: { flexDirection: 'row', gap: 12, marginBottom: 0 },
    submitBtn: { backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.md, paddingVertical: 14, alignItems: 'center', marginTop: 10 },
    submitBtnText: { fontSize: 15, fontWeight: '800', color: '#FFF' },
});

export default TradingTracker;
