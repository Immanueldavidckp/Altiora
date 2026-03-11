import React, { useState, useCallback, useEffect } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
    Modal, Alert, RefreshControl
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, BORDER_RADIUS, SPACING, PAYMENT_METHODS } from '../theme/colors';
import { Card, StatCard, Badge, EmptyState, SectionHeader } from '../components/Card';
import { formatCurrency, getTodayKey, getRelativeDate, formatDate, formatDateKey } from '../utils/helpers';
import { addExpense, getExpenses, getExpenseSummary, deleteExpense, addTransfer, getTransfers, deleteTransfer } from '../db/database';
import { getCurrentLocation } from '../utils/location';

const ExpenseTracker = () => {
    const [expenses, setExpenses] = useState([]);
    const [transfers, setTransfers] = useState([]);
    const [summary, setSummary] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedDate, setSelectedDate] = useState(getTodayKey());
    const [totalSpent, setTotalSpent] = useState(0);
    const [totalIncome, setTotalIncome] = useState(0);

    // Form state
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState('');    
    const [selectedMethod, setSelectedMethod] = useState(PAYMENT_METHODS[0].id);
    const [expenseType, setExpenseType] = useState('expense');
    const [includeLocation, setIncludeLocation] = useState(true);
    const [locationLoading, setLocationLoading] = useState(false);
    const [txDate, setTxDate] = useState(selectedDate);
    const [txTime, setTxTime] = useState('');

    // Transfer form state
    const [fromAccount, setFromAccount] = useState('');
    const [toAccount, setToAccount] = useState('');
    const [transferReason, setTransferReason] = useState('');

    // Whenever modal opens, reset time/date to current
    const openModal = () => {
        const now = new Date();
        setTxDate(selectedDate);
        setTxTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
        setShowModal(true);
    };

    const loadData = useCallback(async () => {
        try {
            const data = await getExpenses(selectedDate);
            setExpenses(data);

            const trfs = await getTransfers(selectedDate);
            setTransfers(trfs);

            const now = new Date();
            const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
            const endOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-31`;
            const summ = await getExpenseSummary(startOfMonth, endOfMonth);
            setSummary(summ);

            let spent = 0, income = 0;
            summ.forEach(s => { spent += s.total_spent || 0; income += s.total_income || 0; });
            setTotalSpent(spent);
            setTotalIncome(income);
        } catch (err) {
            console.error('Error loading expenses:', err);
        }
    }, [selectedDate]);

    useEffect(() => { loadData(); }, [loadData]);

    const onRefresh = async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    };

    const getCurrentTime = () => {
        const now = new Date();
        return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    };

    const handleSubmit = async () => {
        if (expenseType === 'transfer') {
            if (!amount || isNaN(amount)) { Alert.alert('Error', 'Please enter a valid amount'); return; }
            if (!fromAccount.trim()) { Alert.alert('Error', 'Please enter the From account'); return; }
            if (!toAccount.trim()) { Alert.alert('Error', 'Please enter the To account'); return; }
            try {
                await addTransfer({
                    amount: parseFloat(amount),
                    from_account: fromAccount.trim(),
                    to_account: toAccount.trim(),
                    reason: transferReason.trim(),
                    date: txDate || selectedDate,
                    time: txTime || getCurrentTime(),
                });
                setShowModal(false);
                resetForm();
                loadData();
            } catch (err) {
                Alert.alert('Error', 'Failed to save transfer');
            }
            return;
        }

        if (!amount || isNaN(amount)) { Alert.alert('Error', 'Please enter a valid amount'); return; }
        try {
            setLocationLoading(true);
            let locationData = null;
            if (includeLocation) locationData = await getCurrentLocation();
            await addExpense({
                amount: parseFloat(amount),
                description: description.trim(),
                category: category.trim(),
                payment_method: selectedMethod,
                type: expenseType,
                date: txDate || selectedDate,
                time: txTime || getCurrentTime(),
                latitude: locationData?.latitude,
                longitude: locationData?.longitude,
                location_name: locationData?.locationName,
            });
            setShowModal(false);
            resetForm();
            loadData();
        } catch (err) {
            Alert.alert('Error', 'Failed to save expense');
        } finally {
            setLocationLoading(false);
        }
    };

    const resetForm = () => {
        setAmount('');
        setDescription('');
        setCategory('');
        setSelectedMethod(PAYMENT_METHODS[0].id);
        setExpenseType('expense');
        setFromAccount('');
        setToAccount('');
        setTransferReason('');
        // txDate and txTime reset when modal re-opens
    };

    const handleDelete = (id) => {
        Alert.alert('Delete', 'Delete this transaction?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: async () => { await deleteExpense(id); loadData(); } },
        ]);
    };

    const handleDeleteTransfer = (id) => {
        Alert.alert('Delete', 'Delete this transfer?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: async () => { await deleteTransfer(id); loadData(); } },
        ]);
    };

    const navigateDate = (offset) => {
        const d = new Date(selectedDate);
        d.setDate(d.getDate() + offset);
        setSelectedDate(formatDateKey(d));
    };

    const getMethodInfo = (methodId) => PAYMENT_METHODS.find(m => m.id === methodId) || PAYMENT_METHODS[0];

    // Combine and sort expenses + transfers by created_at
    const allTransactions = [
        ...expenses.map(e => ({ ...e, _type: 'expense' })),
        ...transfers.map(t => ({ ...t, _type: 'transfer' })),
    ].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

    return (
        <View style={styles.container}>
            {/* Date Selector */}
            <View style={styles.dateSelector}>
                <TouchableOpacity onPress={() => navigateDate(-1)} style={styles.dateArrow}>
                    <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setSelectedDate(getTodayKey())}>
                    <Text style={styles.dateText}>{getRelativeDate(selectedDate)}</Text>
                    <Text style={styles.dateSubText}>{formatDate(selectedDate)}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => navigateDate(1)} style={styles.dateArrow}>
                    <Ionicons name="chevron-forward" size={22} color={COLORS.textPrimary} />
                </TouchableOpacity>
            </View>

            {/* Summary Cards */}
            <View style={styles.summaryRow}>
                <StatCard title="Total Spent" value={formatCurrency(totalSpent)} color={COLORS.accentRed} subtitle="This month" />
                <StatCard title="Income" value={formatCurrency(totalIncome)} color={COLORS.accentGreen} subtitle="This month" />
            </View>

            {/* Payment Methods Summary */}
            <SectionHeader title="By Payment Method" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.methodScroll}>
                {PAYMENT_METHODS.map((method) => {
                    const s = summary.find(x => x.payment_method === method.id);
                    return (
                        <View key={method.id} style={[styles.methodCard, { borderTopColor: method.color }]}>
                            <Text style={styles.methodLabel}>{method.label}</Text>
                            <Text style={[styles.methodAmount, { color: method.color }]}>
                                {formatCurrency(s?.total_spent || 0)}
                            </Text>
                        </View>
                    );
                })}
            </ScrollView>

            {/* Transaction List */}
            <SectionHeader title="Transactions" rightText={`${allTransactions.length} entries`} />
            <ScrollView
                style={styles.list}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
            >
                {allTransactions.length === 0 ? (
                    <EmptyState title="No transactions" subtitle="Tap + to add expense, income or transfer" emoji="💰" />
                ) : (
                    allTransactions.map((item) => {
                        if (item._type === 'transfer') {
                            return (
                                <Card key={`t-${item.id}`} onPress={() => handleDeleteTransfer(item.id)}>
                                    <View style={styles.expenseRow}>
                                        <View style={[styles.transferBadge]}>
                                            <Ionicons name="swap-horizontal" size={16} color={COLORS.accentYellow} />
                                        </View>
                                        <View style={styles.expInfo}>
                                            <Text style={styles.expDesc}>
                                                {item.from_account}  →  {item.to_account}
                                            </Text>
                                            <View style={styles.expMeta}>
                                                <Text style={styles.transferTag}>TRANSFER</Text>
                                                {item.reason ? <Text style={styles.expCat}>{item.reason}</Text> : null}
                                                <Text style={styles.timeText}>{item.time}</Text>
                                            </View>
                                        </View>
                                        <Text style={[styles.expAmount, { color: COLORS.accentYellow }]}>
                                            ⇄ {formatCurrency(item.amount)}
                                        </Text>
                                    </View>
                                </Card>
                            );
                        }
                        const method = getMethodInfo(item.payment_method);
                        return (
                            <Card key={`e-${item.id}`} onPress={() => handleDelete(item.id)}>
                                <View style={styles.expenseRow}>
                                    <View style={[styles.expDot, { backgroundColor: method.color }]} />
                                    <View style={styles.expInfo}>
                                        <Text style={styles.expDesc}>{item.description || item.category || 'No description'}</Text>
                                        <View style={styles.expMeta}>
                                            <Badge label={method.label} color={method.color} />
                                            {item.category ? <Text style={styles.expCat}>{item.category}</Text> : null}
                                            {item.location_name && (
                                                <View style={styles.locationTag}>
                                                    <Ionicons name="location" size={10} color={COLORS.textSecondary} />
                                                    <Text style={styles.locationText} numberOfLines={1}>{item.location_name}</Text>
                                                </View>
                                            )}
                                        </View>
                                    </View>
                                    <Text style={[styles.expAmount, { color: item.type === 'income' ? COLORS.accentGreen : COLORS.accentRed }]}>
                                        {item.type === 'income' ? '+' : '-'}{formatCurrency(item.amount)}
                                    </Text>
                                </View>
                            </Card>
                        );
                    })
                )}
                <View style={{ height: 100 }} />
            </ScrollView>

            {/* FAB */}
            <TouchableOpacity style={styles.fab} onPress={openModal} activeOpacity={0.8}>
                <Ionicons name="add" size={28} color="#FFF" />
            </TouchableOpacity>

            {/* Add Transaction Modal */}
            <Modal visible={showModal} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Add Transaction</Text>
                            <TouchableOpacity onPress={() => { setShowModal(false); resetForm(); }}>
                                <Ionicons name="close-circle" size={28} color={COLORS.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false}>
                            {/* Type Toggle */}
                            <View style={styles.typeToggle}>
                                <TouchableOpacity
                                    style={[styles.typeBtn, expenseType === 'expense' && styles.typeBtnActive]}
                                    onPress={() => setExpenseType('expense')}
                                >
                                    <Text style={[styles.typeBtnText, expenseType === 'expense' && styles.typeBtnTextActive]}>Expense</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.typeBtn, expenseType === 'income' && styles.typeBtnActiveGreen]}
                                    onPress={() => setExpenseType('income')}
                                >
                                    <Text style={[styles.typeBtnText, expenseType === 'income' && styles.typeBtnTextActive]}>Income</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.typeBtn, expenseType === 'transfer' && styles.typeBtnActiveYellow]}
                                    onPress={() => setExpenseType('transfer')}
                                >
                                    <Text style={[styles.typeBtnText, expenseType === 'transfer' && styles.typeBtnTextActive]}>Transfer</Text>
                                </TouchableOpacity>
                            </View>

                            {/* Amount (always shown) */}
                            <Text style={styles.inputLabel}>Amount (₹)</Text>
                            <TextInput
                                style={styles.input}
                                value={amount}
                                onChangeText={setAmount}
                                placeholder="0.00"
                                placeholderTextColor={COLORS.textMuted}
                                keyboardType="decimal-pad"
                            />

                            {/* Date & Time — editable, shown for ALL types */}
                            <View style={styles.dateTimeRow}>
                                <View style={[styles.dateTimeField, { flex: 1.4 }]}>
                                    <Ionicons name="calendar-outline" size={15} color={COLORS.textSecondary} style={{ marginRight: 6 }}/>
                                    <Text style={styles.dateTimeLabel}>Date</Text>
                                    <TextInput
                                        style={styles.dateTimeInput}
                                        value={txDate}
                                        onChangeText={setTxDate}
                                        placeholder="YYYY-MM-DD"
                                        placeholderTextColor={COLORS.textMuted}
                                        keyboardType="numbers-and-punctuation"
                                    />
                                </View>
                                <View style={[styles.dateTimeField, { flex: 1 }]}>
                                    <Ionicons name="time-outline" size={15} color={COLORS.textSecondary} style={{ marginRight: 6 }}/>
                                    <Text style={styles.dateTimeLabel}>Time</Text>
                                    <TextInput
                                        style={styles.dateTimeInput}
                                        value={txTime}
                                        onChangeText={setTxTime}
                                        placeholder="HH:MM"
                                        placeholderTextColor={COLORS.textMuted}
                                        keyboardType="numbers-and-punctuation"
                                    />
                                </View>
                            </View>

                            {expenseType === 'transfer' ? (
                                <>
                                    {/* From Account */}
                                    <Text style={styles.inputLabel}>From Account</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={fromAccount}
                                        onChangeText={setFromAccount}
                                        placeholder="e.g., Credit Card 1, Cash"
                                        placeholderTextColor={COLORS.textMuted}
                                    />

                                    {/* Arrow indicator */}
                                    <View style={styles.arrowRow}>
                                        <View style={styles.arrowLine} />
                                        <View style={styles.arrowCircle}>
                                            <Ionicons name="arrow-down" size={18} color={COLORS.accentYellow} />
                                        </View>
                                        <View style={styles.arrowLine} />
                                    </View>

                                    {/* To Account */}
                                    <Text style={styles.inputLabel}>To Account</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={toAccount}
                                        onChangeText={setToAccount}
                                        placeholder="e.g., Savings, Loan 1"
                                        placeholderTextColor={COLORS.textMuted}
                                    />

                                    {/* Reason */}
                                    <Text style={styles.inputLabel}>Reason (optional)</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={transferReason}
                                        onChangeText={setTransferReason}
                                        placeholder="Why are you transferring?"
                                        placeholderTextColor={COLORS.textMuted}
                                    />

                                    <TouchableOpacity style={[styles.submitBtn, { backgroundColor: COLORS.accentYellow }]} onPress={handleSubmit} activeOpacity={0.8}>
                                        <Ionicons name="swap-horizontal" size={18} color="#000" style={{ marginRight: 8 }} />
                                        <Text style={[styles.submitBtnText, { color: '#000' }]}>Save Transfer</Text>
                                    </TouchableOpacity>
                                </>
                            ) : (
                                <>
                                    {/* Description */}
                                    <Text style={styles.inputLabel}>Description</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={description}
                                        onChangeText={setDescription}
                                        placeholder="What was this for?"
                                        placeholderTextColor={COLORS.textMuted}
                                    />

                                    {/* Category */}
                                    <Text style={styles.inputLabel}>Category</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={category}
                                        onChangeText={setCategory}
                                        placeholder="e.g., Food, Travel, Shopping"
                                        placeholderTextColor={COLORS.textMuted}
                                    />

                                    {/* Payment Method */}
                                    <Text style={styles.inputLabel}>Payment Method</Text>
                                    <View style={styles.methodGrid}>
                                        {PAYMENT_METHODS.map((m) => (
                                            <TouchableOpacity
                                                key={m.id}
                                                style={[
                                                    styles.methodChip,
                                                    { borderColor: m.color + '40' },
                                                    selectedMethod === m.id && { backgroundColor: m.color + '25', borderColor: m.color },
                                                ]}
                                                onPress={() => setSelectedMethod(m.id)}
                                            >
                                                <View style={[styles.chipDot, { backgroundColor: m.color }]} />
                                                <Text style={[styles.chipText, selectedMethod === m.id && { color: m.color }]}>{m.label}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>

                                    <TouchableOpacity style={styles.locationToggle} onPress={() => setIncludeLocation(!includeLocation)}>
                                        <Ionicons
                                            name={includeLocation ? "location" : "location-outline"}
                                            size={20}
                                            color={includeLocation ? COLORS.primary : COLORS.textMuted}
                                        />
                                        <Text style={[styles.locationToggleText, includeLocation && { color: COLORS.textPrimary }]}>
                                            {includeLocation ? "Tag current location" : "Location tagging off"}
                                        </Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={[styles.submitBtn, locationLoading && { opacity: 0.7 }]}
                                        onPress={handleSubmit}
                                        activeOpacity={0.8}
                                        disabled={locationLoading}
                                    >
                                        <Text style={styles.submitBtnText}>
                                            {locationLoading ? "Fetching Location..." : "Save Transaction"}
                                        </Text>
                                    </TouchableOpacity>
                                </>
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background, paddingHorizontal: SPACING.lg },
    dateSelector: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingVertical: SPACING.md, marginBottom: SPACING.sm,
    },
    dateArrow: { padding: SPACING.sm },
    dateText: { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary, textAlign: 'center' },
    dateSubText: { fontSize: 12, color: COLORS.textSecondary, textAlign: 'center', marginTop: 2 },
    summaryRow: { flexDirection: 'row', marginBottom: SPACING.sm },
    methodScroll: { marginBottom: SPACING.sm },
    methodCard: {
        backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md,
        padding: SPACING.md, marginRight: SPACING.sm, minWidth: 120,
        borderTopWidth: 3, borderWidth: 1, borderColor: COLORS.border,
    },
    methodLabel: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '600' },
    methodAmount: { fontSize: 16, fontWeight: '800', marginTop: 4 },
    list: { flex: 1 },
    expenseRow: { flexDirection: 'row', alignItems: 'center' },
    expDot: { width: 10, height: 10, borderRadius: 5, marginRight: SPACING.md },
    transferBadge: {
        width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.accentYellow + '20',
        justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md,
    },
    transferTag: { fontSize: 10, fontWeight: '800', color: COLORS.accentYellow, backgroundColor: COLORS.accentYellow + '20', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    timeText: { fontSize: 11, color: COLORS.textMuted, fontWeight: '500' },
    expInfo: { flex: 1 },
    expDesc: { fontSize: 15, fontWeight: '600', color: COLORS.textPrimary },
    expMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 8, flexWrap: 'wrap' },
    expCat: { fontSize: 12, color: COLORS.textSecondary },
    locationTag: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    locationText: { fontSize: 10, color: COLORS.textMuted, maxWidth: 80 },
    expAmount: { fontSize: 16, fontWeight: '800' },
    fab: {
        position: 'absolute', bottom: 24, right: 20, width: 56, height: 56,
        borderRadius: 28, backgroundColor: COLORS.primary, justifyContent: 'center',
        alignItems: 'center', elevation: 8,
        shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4, shadowRadius: 8,
    },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
    modalContent: {
        backgroundColor: COLORS.background, borderTopLeftRadius: BORDER_RADIUS.xxl,
        borderTopRightRadius: BORDER_RADIUS.xxl, padding: SPACING.xxl, maxHeight: '92%',
    },
    modalHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: SPACING.xl,
    },
    modalTitle: { fontSize: 22, fontWeight: '800', color: COLORS.textPrimary },
    typeToggle: {
        flexDirection: 'row', backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md,
        padding: 4, marginBottom: SPACING.xl,
    },
    typeBtn: { flex: 1, paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.sm, alignItems: 'center' },
    typeBtnActive: { backgroundColor: COLORS.accentRed + '30' },
    typeBtnActiveGreen: { backgroundColor: COLORS.accentGreen + '30' },
    typeBtnActiveYellow: { backgroundColor: COLORS.accentYellow + '30' },
    typeBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
    typeBtnTextActive: { color: COLORS.textPrimary },
    inputLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, marginBottom: SPACING.sm, marginTop: SPACING.md },
    input: {
        backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md, padding: SPACING.lg,
        color: COLORS.textPrimary, fontSize: 16, borderWidth: 1, borderColor: COLORS.border,
    },
    methodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    methodChip: {
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md,
        paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.sm, borderWidth: 1.5,
        backgroundColor: COLORS.surface,
    },
    chipDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
    chipText: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
    locationToggle: {
        flexDirection: 'row', alignItems: 'center', marginTop: SPACING.lg, gap: 10,
        backgroundColor: COLORS.surfaceHighlight, padding: SPACING.md, borderRadius: BORDER_RADIUS.md,
    },
    locationToggleText: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary },
    arrowRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 12 },
    arrowLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
    arrowCircle: {
        width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.accentYellow + '20',
        justifyContent: 'center', alignItems: 'center', marginHorizontal: 12,
        borderWidth: 1, borderColor: COLORS.accentYellow + '60',
    },
    dateTimeInfo: {
        flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: SPACING.lg,
        backgroundColor: COLORS.surfaceHighlight, padding: SPACING.md, borderRadius: BORDER_RADIUS.md,
    },
    dateTimeText: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '500', flex: 1 },
    dateTimeRow: { flexDirection: 'row', gap: 10, marginTop: SPACING.md },
    dateTimeField: {
        flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
        backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md,
        paddingHorizontal: SPACING.md, paddingVertical: 10,
        borderWidth: 1, borderColor: COLORS.border,
    },
    dateTimeLabel: { fontSize: 11, fontWeight: '700', color: COLORS.textSecondary, marginRight: 6 },
    dateTimeInput: { fontSize: 15, fontWeight: '600', color: COLORS.textPrimary, flex: 1, padding: 0 },
    submitBtn: {
        backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.md,
        paddingVertical: SPACING.lg, alignItems: 'center', justifyContent: 'center',
        flexDirection: 'row', marginTop: SPACING.xxl, marginBottom: SPACING.xxxl,
    },
    submitBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
});

export default ExpenseTracker;
