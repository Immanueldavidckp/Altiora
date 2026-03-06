import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Alert, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, BORDER_RADIUS, SPACING } from '../theme/colors';
import { Card, StatCard, EmptyState, SectionHeader } from '../components/Card';
import { formatCurrency, getTodayKey, getRelativeDate, formatDate, formatDateKey } from '../utils/helpers';
import { addTrade, getTrades, getTradeSummary, deleteTrade } from '../db/database';

const TradingTracker = () => {
    const [trades, setTrades] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedDate, setSelectedDate] = useState(getTodayKey());
    const [monthlySummary, setMonthlySummary] = useState({});
    const [startingMoney, setStartingMoney] = useState('');
    const [endingMoney, setEndingMoney] = useState('');
    const [buyAmount, setBuyAmount] = useState('');
    const [sellAmount, setSellAmount] = useState('');
    const [tradeNotes, setTradeNotes] = useState('');

    const loadData = useCallback(async () => {
        try {
            const data = await getTrades(selectedDate);
            setTrades(data);
            const now = new Date();
            const sm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
            const em = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-31`;
            const summary = await getTradeSummary(sm, em);
            setMonthlySummary(summary || {});
        } catch (err) { console.error(err); }
    }, [selectedDate]);

    useEffect(() => { loadData(); }, [loadData]);
    const onRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

    const handleSubmit = async () => {
        if (!startingMoney && !buyAmount && !sellAmount) { Alert.alert('Error', 'Enter at least one value'); return; }
        try {
            await addTrade({ date: selectedDate, starting_money: parseFloat(startingMoney) || 0, ending_money: parseFloat(endingMoney) || 0, buy_amount: parseFloat(buyAmount) || 0, sell_amount: parseFloat(sellAmount) || 0, notes: tradeNotes.trim() });
            setShowModal(false); resetForm(); loadData();
        } catch (err) { Alert.alert('Error', 'Failed to save'); }
    };

    const resetForm = () => { setStartingMoney(''); setEndingMoney(''); setBuyAmount(''); setSellAmount(''); setTradeNotes(''); };
    const handleDelete = (id) => { Alert.alert('Delete', 'Delete this trade?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { await deleteTrade(id); loadData(); } }]); };
    const navigateDate = (o) => { const d = new Date(selectedDate); d.setDate(d.getDate() + o); setSelectedDate(formatDateKey(d)); };

    const dayPnL = trades.reduce((s, t) => s + (t.profit_loss || 0), 0);
    const dayBought = trades.reduce((s, t) => s + (t.buy_amount || 0), 0);
    const daySold = trades.reduce((s, t) => s + (t.sell_amount || 0), 0);

    return (
        <View style={s.container}>
            <View style={s.dateSelector}>
                <TouchableOpacity onPress={() => navigateDate(-1)} style={s.dateArrow}><Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} /></TouchableOpacity>
                <TouchableOpacity onPress={() => setSelectedDate(getTodayKey())}>
                    <Text style={s.dateText}>{getRelativeDate(selectedDate)}</Text>
                    <Text style={s.dateSubText}>{formatDate(selectedDate)}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => navigateDate(1)} style={s.dateArrow}><Ionicons name="chevron-forward" size={22} color={COLORS.textPrimary} /></TouchableOpacity>
            </View>
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
            <SectionHeader title="Trade Entries" rightText={`${trades.length} entries`} />
            <ScrollView style={s.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}>
                {trades.length === 0 ? <EmptyState title="No trades today" subtitle="Tap + to log trading" emoji="📈" /> :
                    trades.map(t => (
                        <Card key={t.id} onPress={() => handleDelete(t.id)}>
                            <View style={s.tradeRow}>
                                <View style={{ flex: 1 }}>
                                    <View style={s.tradeMoneyRow}>
                                        <View><Text style={s.tmLabel}>Start</Text><Text style={s.tmVal}>{formatCurrency(t.starting_money)}</Text></View>
                                        <Ionicons name="arrow-forward" size={16} color={COLORS.textMuted} />
                                        <View><Text style={s.tmLabel}>End</Text><Text style={s.tmVal}>{formatCurrency(t.ending_money)}</Text></View>
                                    </View>
                                    <View style={s.tradeBuySell}>
                                        <Text style={[s.tbs, { color: COLORS.accentRed }]}>Buy: {formatCurrency(t.buy_amount)}</Text>
                                        <Text style={[s.tbs, { color: COLORS.accentGreen }]}>Sell: {formatCurrency(t.sell_amount)}</Text>
                                    </View>
                                    {t.notes ? <Text style={s.tradeNotes}>{t.notes}</Text> : null}
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
            <Modal visible={showModal} animationType="slide" transparent>
                <View style={s.modalOverlay}>
                    <View style={s.modalContent}>
                        <View style={s.modalHeader}>
                            <Text style={s.modalTitle}>Add Trade Entry</Text>
                            <TouchableOpacity onPress={() => { setShowModal(false); resetForm(); }}><Ionicons name="close-circle" size={28} color={COLORS.textSecondary} /></TouchableOpacity>
                        </View>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            <View style={s.row}>
                                <View style={{ flex: 1 }}><Text style={s.inputLabel}>Starting Money (₹)</Text><TextInput style={s.input} value={startingMoney} onChangeText={setStartingMoney} placeholder="0" placeholderTextColor={COLORS.textMuted} keyboardType="decimal-pad" /></View>
                                <View style={{ flex: 1 }}><Text style={s.inputLabel}>Ending Money (₹)</Text><TextInput style={s.input} value={endingMoney} onChangeText={setEndingMoney} placeholder="0" placeholderTextColor={COLORS.textMuted} keyboardType="decimal-pad" /></View>
                            </View>
                            <View style={s.row}>
                                <View style={{ flex: 1 }}><Text style={s.inputLabel}>Buy Amount (₹)</Text><TextInput style={s.input} value={buyAmount} onChangeText={setBuyAmount} placeholder="0" placeholderTextColor={COLORS.textMuted} keyboardType="decimal-pad" /></View>
                                <View style={{ flex: 1 }}><Text style={s.inputLabel}>Sell Amount (₹)</Text><TextInput style={s.input} value={sellAmount} onChangeText={setSellAmount} placeholder="0" placeholderTextColor={COLORS.textMuted} keyboardType="decimal-pad" /></View>
                            </View>
                            <Text style={s.inputLabel}>Notes</Text>
                            <TextInput style={[s.input, { minHeight: 80 }]} value={tradeNotes} onChangeText={setTradeNotes} placeholder="Trade details..." placeholderTextColor={COLORS.textMuted} multiline />
                            <TouchableOpacity style={s.submitBtn} onPress={handleSubmit}><Text style={s.submitBtnText}>Save Trade</Text></TouchableOpacity>
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background, paddingHorizontal: SPACING.lg },
    dateSelector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: SPACING.md, marginBottom: SPACING.sm },
    dateArrow: { padding: SPACING.sm }, dateText: { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary, textAlign: 'center' },
    dateSubText: { fontSize: 12, color: COLORS.textSecondary, textAlign: 'center', marginTop: 2 },
    pnlCard: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, padding: SPACING.xl, marginBottom: SPACING.md, borderLeftWidth: 4, borderWidth: 1, borderColor: COLORS.border },
    pnlLabel: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600' }, pnlValue: { fontSize: 32, fontWeight: '900', marginVertical: 4 },
    pnlRow: { flexDirection: 'row', marginTop: SPACING.sm }, pnlItemLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: '600' },
    pnlItemVal: { fontSize: 16, fontWeight: '700', marginTop: 2 }, summaryRow: { flexDirection: 'row', marginBottom: SPACING.sm },
    list: { flex: 1 }, tradeRow: { flexDirection: 'row', alignItems: 'center' },
    tradeMoneyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, tmLabel: { fontSize: 10, color: COLORS.textMuted, fontWeight: '600' },
    tmVal: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary }, tradeBuySell: { flexDirection: 'row', gap: 16, marginTop: 6 },
    tbs: { fontSize: 12, fontWeight: '600' }, tradeNotes: { fontSize: 12, color: COLORS.textSecondary, marginTop: 4 },
    tradePnl: { borderRadius: BORDER_RADIUS.sm, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
    tradePnlText: { fontSize: 14, fontWeight: '800' },
    fab: { position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: COLORS.background, borderTopLeftRadius: BORDER_RADIUS.xxl, borderTopRightRadius: BORDER_RADIUS.xxl, padding: SPACING.xxl, maxHeight: '90%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xl },
    modalTitle: { fontSize: 22, fontWeight: '800', color: COLORS.textPrimary },
    inputLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, marginBottom: SPACING.sm, marginTop: SPACING.md },
    input: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md, padding: SPACING.lg, color: COLORS.textPrimary, fontSize: 16, borderWidth: 1, borderColor: COLORS.border, textAlignVertical: 'top' },
    row: { flexDirection: 'row', gap: 12 },
    submitBtn: { backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.md, paddingVertical: SPACING.lg, alignItems: 'center', marginTop: SPACING.xxl, marginBottom: SPACING.xxxl },
    submitBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
});

export default TradingTracker;
