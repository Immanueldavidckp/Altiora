import React, { useState, useCallback, useEffect } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
    Modal, Alert, RefreshControl, ActivityIndicator, FlatList
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, BORDER_RADIUS, SPACING, PAYMENT_METHODS } from '../theme/colors';
import { Card, StatCard, Badge, EmptyState, SectionHeader } from '../components/Card';
import { formatCurrency, getTodayKey, getRelativeDate, formatDate, formatDateKey } from '../utils/helpers';
import { addExpense, getExpenses, getExpenseSummary, deleteExpense, addTransfer, getTransfers, deleteTransfer, addReceivable, getReceivables, settleReceivable, deleteReceivable } from '../db/database';
import { getCurrentLocation } from '../utils/location';
import {
    requestSmsPermission,
    checkSmsPermission,
    getTransactionSms,
    getAllSmsMessages,
    categorizeSms,
} from '../utils/smsReader';

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

    // Consumer details state
    const [consumerType, setConsumerType] = useState('myself'); // 'myself' | 'others' | 'split' | 'company'
    const [otherName, setOtherName] = useState('');
    const [companyName, setCompanyName] = useState('');
    const [splitPeople, setSplitPeople] = useState([{ name: '', amount: '' }]);

    // Receivables panel state
    const [receivables, setReceivables] = useState([]);
    const [showSettled, setShowSettled] = useState(false);

    // SMS state
    const [showSmsModal, setShowSmsModal] = useState(false);
    const [smsMessages, setSmsMessages] = useState([]);
    const [smsLoading, setSmsLoading] = useState(false);
    const [smsPermGranted, setSmsPermGranted] = useState(false);
    const [smsFilter, setSmsFilter] = useState('transactions'); // 'transactions' or 'all'
    const [selectedSms, setSelectedSms] = useState(null);
    const [showSmsDetail, setShowSmsDetail] = useState(false);
    const [smsUnreadCount, setSmsUnreadCount] = useState(0);

    // Whenever modal opens, reset time/date to current
    const openModal = () => {
        const now = new Date();
        setTxDate(selectedDate);
        setTxTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
        setShowModal(true);
    };

    const loadReceivables = useCallback(async () => {
        try {
            const data = await getReceivables(showSettled);
            setReceivables(data);
        } catch (e) {
            console.error('Error loading receivables:', e);
        }
    }, [showSettled]);

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
    useEffect(() => { loadReceivables(); }, [loadReceivables]);

    // Check SMS permission on mount
    useEffect(() => {
        const checkPerm = async () => {
            const granted = await checkSmsPermission();
            setSmsPermGranted(granted);
            if (granted) {
                // Get a quick count of transaction messages
                try {
                    const msgs = await getTransactionSms(20);
                    const unread = msgs.filter(m => !m.isRead).length;
                    setSmsUnreadCount(unread);
                } catch { /* ignore */ }
            }
        };
        checkPerm();
    }, []);

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

        // Validate consumer inputs
        if (consumerType === 'others' && !otherName.trim()) {
            Alert.alert('Error', 'Please enter the person name for Others');
            return;
        }
        if (consumerType === 'company' && !companyName.trim()) {
            Alert.alert('Error', 'Please enter the company name');
            return;
        }
        if (consumerType === 'split') {
            const validPeople = splitPeople.filter(p => p.name.trim() && p.amount && !isNaN(p.amount));
            if (validPeople.length === 0) {
                Alert.alert('Error', 'Add at least one valid person with name and amount for Split');
                return;
            }
        }

        try {
            setLocationLoading(true);
            let locationData = null;
            if (includeLocation) locationData = await getCurrentLocation();

            let consumerData = null;
            if (consumerType === 'others') consumerData = { name: otherName.trim() };
            if (consumerType === 'company') consumerData = { name: companyName.trim() };
            if (consumerType === 'split') consumerData = { people: splitPeople.filter(p => p.name.trim()) };

            const expenseId = await addExpense({
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
                consumer_type: consumerType,
                consumer_data: consumerData,
            });

            // Create receivable records for Others/Split/Company
            const expDate = txDate || selectedDate;
            const expDesc = description.trim() || category.trim() || 'Expense';
            if (consumerType === 'others') {
                await addReceivable({ expense_id: expenseId, consumer_type: 'others', person_name: otherName.trim(), amount: parseFloat(amount), description: expDesc, date: expDate });
            } else if (consumerType === 'company') {
                await addReceivable({ expense_id: expenseId, consumer_type: 'company', person_name: companyName.trim(), amount: parseFloat(amount), description: expDesc, date: expDate });
            } else if (consumerType === 'split') {
                for (const p of splitPeople.filter(p => p.name.trim() && p.amount && !isNaN(p.amount))) {
                    await addReceivable({ expense_id: expenseId, consumer_type: 'split', person_name: p.name.trim(), amount: parseFloat(p.amount), description: expDesc, date: expDate });
                }
            }

            setShowModal(false);
            resetForm();
            loadData();
            loadReceivables();
        } catch (err) {
            console.error('Failed to save expense:', err);
            Alert.alert('Error', 'Failed to save expense: ' + (err.message || 'Unknown error'));
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
        setConsumerType('myself');
        setOtherName('');
        setCompanyName('');
        setSplitPeople([{ name: '', amount: '' }]);
        // txDate and txTime reset when modal re-opens
    };

    const addSplitPerson = () => setSplitPeople(prev => [...prev, { name: '', amount: '' }]);
    const removeSplitPerson = (idx) => setSplitPeople(prev => prev.filter((_, i) => i !== idx));
    const updateSplitPerson = (idx, field, val) => setSplitPeople(prev => prev.map((p, i) => i === idx ? { ...p, [field]: val } : p));

    const handleSettleReceivable = (id) => {
        Alert.alert('Mark as Settled', 'Did you receive this money back?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Yes, Settled!', onPress: async () => { await settleReceivable(id); loadReceivables(); } },
        ]);
    };

    const handleDeleteReceivable = (id) => {
        Alert.alert('Delete', 'Remove this receivable record?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: async () => { await deleteReceivable(id); loadReceivables(); } },
        ]);
    };

    const CONSUMER_TYPES = [
        { id: 'myself', label: 'Myself', icon: 'person', color: COLORS.primary },
        { id: 'others', label: 'Others', icon: 'people', color: COLORS.accentYellow },
        { id: 'split', label: 'Split', icon: 'git-branch', color: COLORS.accent },
        { id: 'company', label: 'Company', icon: 'briefcase', color: COLORS.accentGreen },
    ];

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

    const getMethodInfo = (methodId) => {
        const method = PAYMENT_METHODS.find(m => m.id === methodId);
        if (method) return method;
        // Handle custom accounts from SMS
        return { 
            id: methodId, 
            label: methodId.replace(/_/g, ' ').toUpperCase(), 
            color: COLORS.primary, 
            icon: 'card-outline' 
        };
    };

    // ======== SMS Functions ========

    const handleOpenSms = async () => {
        setSmsLoading(true);
        setShowSmsModal(true);
        setSmsMessages([]);

        const hasPermission = await checkSmsPermission();
        if (!hasPermission) {
            const granted = await requestSmsPermission();
            if (!granted) {
                setSmsLoading(false);
                Alert.alert(
                    'Permission Required',
                    'SMS permission is needed to read your bank messages and track spending automatically. Please enable it in Settings.',
                );
                return;
            }
            setSmsPermGranted(true);
        }

        await loadSmsMessages();
    };

    const loadSmsMessages = async () => {
        setSmsLoading(true);
        try {
            let messages;
            if (smsFilter === 'transactions') {
                messages = await getTransactionSms(100);
            } else {
                messages = await getAllSmsMessages(100);
            }
            setSmsMessages(messages);
            const unread = messages.filter(m => !m.isRead).length;
            setSmsUnreadCount(unread);
        } catch (err) {
            console.error('Error loading SMS:', err);
            Alert.alert('Error', 'Failed to load messages');
        } finally {
            setSmsLoading(false);
        }
    };

    const handleSmsFilterChange = async (newFilter) => {
        setSmsFilter(newFilter);
        setSmsLoading(true);
        try {
            let messages;
            if (newFilter === 'transactions') {
                messages = await getTransactionSms(100);
            } else {
                messages = await getAllSmsMessages(100);
            }
            setSmsMessages(messages);
        } catch {
            Alert.alert('Error', 'Failed to load messages');
        } finally {
            setSmsLoading(false);
        }
    };

    const handleSmsSelect = (sms) => {
        setSelectedSms(sms);
        setShowSmsDetail(true);
    };

    /** Add an expense directly from a parsed SMS */
    const handleAddFromSms = async (sms) => {
        if (!sms.parsed || !sms.parsed.amount) {
            Alert.alert('Cannot Add', 'Could not parse an amount from this message. You can add it manually.');
            return;
        }

        const cat = categorizeSms(sms.body);
        const type = sms.parsed.type === 'credit' ? 'income' : 'expense';

        try {
            await addExpense({
                amount: sms.parsed.amount,
                description: sms.parsed.merchant || sms.sender,
                category: cat,
                payment_method: sms.parsed.account || 'debit_card',
                type: type,
                date: sms.dateKey,
                time: sms.time,
            });
            Alert.alert('Added!', `₹${sms.parsed.amount} ${type} saved.`);
            setShowSmsDetail(false);
            loadData();
        } catch (err) {
            Alert.alert('Error', 'Failed to save expense: ' + (err.message || 'Unknown'));
        }
    };

    // Combine and sort expenses + transfers by created_at
    const allTransactions = [
        ...expenses.map(e => ({ ...e, _type: 'expense' })),
        ...transfers.map(t => ({ ...t, _type: 'transfer' })),
    ].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

    const getTransactionTypeColor = (parsed) => {
        if (!parsed) return COLORS.textMuted;
        if (parsed.type === 'debit') return COLORS.accentRed;
        if (parsed.type === 'credit') return COLORS.accentGreen;
        return COLORS.textSecondary;
    };

    const getTransactionTypeIcon = (parsed) => {
        if (!parsed) return 'chatbubble-outline';
        if (parsed.type === 'debit') return 'arrow-up-circle';
        if (parsed.type === 'credit') return 'arrow-down-circle';
        return 'swap-horizontal';
    };

    // ======== Render SMS Item ========
    const renderSmsItem = ({ item }) => {
        const sms = item;
        const typeColor = getTransactionTypeColor(sms.parsed);
        const typeIcon = getTransactionTypeIcon(sms.parsed);

        return (
            <TouchableOpacity
                style={styles.smsItem}
                onPress={() => handleSmsSelect(sms)}
                activeOpacity={0.7}
            >
                <View style={[styles.smsIcon, { backgroundColor: typeColor + '18' }]}>
                    <Ionicons name={typeIcon} size={20} color={typeColor} />
                </View>
                <View style={styles.smsContent}>
                    <View style={styles.smsTopRow}>
                        <Text style={styles.smsSender} numberOfLines={1}>{sms.sender}</Text>
                        <Text style={styles.smsTime}>{sms.time}</Text>
                    </View>
                    <Text style={styles.smsBody} numberOfLines={2}>{sms.body}</Text>
                    <View style={styles.smsBottom}>
                        <Text style={styles.smsDate}>{sms.date}</Text>
                        {sms.parsed && sms.parsed.amount && (
                            <View style={[styles.smsAmountBadge, { backgroundColor: typeColor + '18' }]}>
                                <Text style={[styles.smsAmountText, { color: typeColor }]}>
                                    {sms.parsed.type === 'credit' ? '+' : '-'}₹{sms.parsed.amount.toLocaleString()}
                                </Text>
                            </View>
                        )}
                        {!sms.isRead && (
                            <View style={styles.unreadDot} />
                        )}
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

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
                <View style={styles.dateRightGroup}>
                    {/* SMS Icon Button */}
                    <TouchableOpacity style={styles.smsIconBtn} onPress={handleOpenSms} activeOpacity={0.7}>
                        <Ionicons name="chatbubbles" size={22} color={COLORS.accent} />
                        {smsUnreadCount > 0 && (
                            <View style={styles.smsBadge}>
                                <Text style={styles.smsBadgeText}>
                                    {smsUnreadCount > 9 ? '9+' : smsUnreadCount}
                                </Text>
                            </View>
                        )}
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => navigateDate(1)} style={styles.dateArrow}>
                        <Ionicons name="chevron-forward" size={22} color={COLORS.textPrimary} />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Summary Cards */}
            <View style={styles.summaryRow}>
                <StatCard title="Total Spent" value={formatCurrency(totalSpent)} color={COLORS.accentRed} subtitle="This month" />
                <StatCard title="Income" value={formatCurrency(totalIncome)} color={COLORS.accentGreen} subtitle="This month" />
            </View>

            {/* To Get Back Panel */}
            {receivables.length > 0 && (
                <View style={styles.receivablePanel}>
                    <View style={styles.receivablePanelHeader}>
                        <View style={styles.receivablePanelTitle}>
                            <Ionicons name="cash" size={16} color={COLORS.accentGreen} />
                            <Text style={styles.receivablePanelTitleText}>💸 To Get Back</Text>
                            <View style={styles.receivableBadge}>
                                <Text style={styles.receivableBadgeText}>{receivables.length}</Text>
                            </View>
                        </View>
                        <TouchableOpacity onPress={() => { setShowSettled(!showSettled); }} style={styles.settledToggle}>
                            <Text style={styles.settledToggleText}>{showSettled ? 'Pending' : 'Settled'}</Text>
                        </TouchableOpacity>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.receivableScroll}>
                        {receivables.map(rec => (
                            <View key={rec.id} style={[
                                styles.receivableCard,
                                { borderLeftColor: rec.consumer_type === 'company' ? COLORS.accentGreen : rec.consumer_type === 'split' ? COLORS.accent : COLORS.accentYellow }
                            ]}>
                                <View style={styles.receivableCardTop}>
                                    <Ionicons
                                        name={rec.consumer_type === 'company' ? 'briefcase' : rec.consumer_type === 'split' ? 'git-branch' : 'person'}
                                        size={14}
                                        color={rec.consumer_type === 'company' ? COLORS.accentGreen : rec.consumer_type === 'split' ? COLORS.accent : COLORS.accentYellow}
                                    />
                                    <Text style={styles.receivableCardType}>{rec.consumer_type.toUpperCase()}</Text>
                                </View>
                                <Text style={styles.receivableCardName} numberOfLines={1}>{rec.person_name || '—'}</Text>
                                <Text style={styles.receivableCardAmount}>₹{parseFloat(rec.amount).toLocaleString()}</Text>
                                <Text style={styles.receivableCardDesc} numberOfLines={1}>{rec.description || ''}</Text>
                                {!rec.is_settled && (
                                    <TouchableOpacity style={styles.receivableSettleBtn} onPress={() => handleSettleReceivable(rec.id)}>
                                        <Ionicons name="checkmark-circle" size={12} color={COLORS.accentGreen} />
                                        <Text style={styles.receivableSettleBtnText}>Got it back</Text>
                                    </TouchableOpacity>
                                )}
                                <TouchableOpacity style={styles.receivableDeleteBtn} onPress={() => handleDeleteReceivable(rec.id)}>
                                    <Ionicons name="trash-outline" size={12} color={COLORS.accentRed} />
                                </TouchableOpacity>
                            </View>
                        ))}
                    </ScrollView>
                </View>
            )}

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

                                    {/* ===== Consumer Details ===== */}
                                    <View style={styles.consumerSection}>
                                        <Text style={styles.consumerSectionTitle}>👤 Who is this for?</Text>
                                        <View style={styles.consumerTypeRow}>
                                            {CONSUMER_TYPES.map(ct => (
                                                <TouchableOpacity
                                                    key={ct.id}
                                                    style={[
                                                        styles.consumerTypeBtn,
                                                        { borderColor: ct.color + '40' },
                                                        consumerType === ct.id && { backgroundColor: ct.color + '22', borderColor: ct.color },
                                                    ]}
                                                    onPress={() => setConsumerType(ct.id)}
                                                >
                                                    <Ionicons name={ct.icon} size={18} color={consumerType === ct.id ? ct.color : COLORS.textMuted} />
                                                    <Text style={[styles.consumerTypeLbl, consumerType === ct.id && { color: ct.color }]}>{ct.label}</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>

                                        {/* Myself — nothing extra needed */}
                                        {consumerType === 'myself' && (
                                            <View style={styles.consumerInfoBox}>
                                                <Ionicons name="checkmark-circle" size={16} color={COLORS.primary} />
                                                <Text style={styles.consumerInfoText}>This is your personal expense — no tracking needed.</Text>
                                            </View>
                                        )}

                                        {/* Others — enter name */}
                                        {consumerType === 'others' && (
                                            <View>
                                                <Text style={styles.consumerSubLabel}>Person's Name</Text>
                                                <TextInput
                                                    style={styles.input}
                                                    value={otherName}
                                                    onChangeText={setOtherName}
                                                    placeholder="Who did you pay for?"
                                                    placeholderTextColor={COLORS.textMuted}
                                                />
                                                <View style={styles.consumerInfoBox}>
                                                    <Ionicons name="arrow-undo" size={14} color={COLORS.accentYellow} />
                                                    <Text style={[styles.consumerInfoText, { color: COLORS.accentYellow }]}>You'll get ₹{amount || '0'} back from {otherName || 'them'}.</Text>
                                                </View>
                                            </View>
                                        )}

                                        {/* Split — add people + amounts */}
                                        {consumerType === 'split' && (
                                            <View>
                                                <Text style={styles.consumerSubLabel}>Split With</Text>
                                                {splitPeople.map((person, idx) => (
                                                    <View key={idx} style={styles.splitRow}>
                                                        <TextInput
                                                            style={[styles.input, styles.splitNameInput]}
                                                            value={person.name}
                                                            onChangeText={v => updateSplitPerson(idx, 'name', v)}
                                                            placeholder="Name"
                                                            placeholderTextColor={COLORS.textMuted}
                                                        />
                                                        <TextInput
                                                            style={[styles.input, styles.splitAmtInput]}
                                                            value={person.amount}
                                                            onChangeText={v => updateSplitPerson(idx, 'amount', v)}
                                                            placeholder="₹"
                                                            placeholderTextColor={COLORS.textMuted}
                                                            keyboardType="decimal-pad"
                                                        />
                                                        <TouchableOpacity onPress={() => removeSplitPerson(idx)} style={styles.splitRemoveBtn}>
                                                            <Ionicons name="close-circle" size={22} color={COLORS.accentRed} />
                                                        </TouchableOpacity>
                                                    </View>
                                                ))}
                                                <TouchableOpacity style={styles.addSplitBtn} onPress={addSplitPerson}>
                                                    <Ionicons name="add-circle-outline" size={18} color={COLORS.accent} />
                                                    <Text style={styles.addSplitBtnText}>Add Person</Text>
                                                </TouchableOpacity>
                                                <View style={styles.consumerInfoBox}>
                                                    <Ionicons name="arrow-undo" size={14} color={COLORS.accent} />
                                                    <Text style={[styles.consumerInfoText, { color: COLORS.accent }]}>
                                                        Tracking ₹{splitPeople.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0).toFixed(0)} to get back.
                                                    </Text>
                                                </View>
                                            </View>
                                        )}

                                        {/* Company */}
                                        {consumerType === 'company' && (
                                            <View>
                                                <Text style={styles.consumerSubLabel}>Company Name</Text>
                                                <TextInput
                                                    style={styles.input}
                                                    value={companyName}
                                                    onChangeText={setCompanyName}
                                                    placeholder="Which company owes you?"
                                                    placeholderTextColor={COLORS.textMuted}
                                                />
                                                <View style={styles.consumerInfoBox}>
                                                    <Ionicons name="briefcase" size={14} color={COLORS.accentGreen} />
                                                    <Text style={[styles.consumerInfoText, { color: COLORS.accentGreen }]}>Logged for reimbursement from {companyName || 'company'}.</Text>
                                                </View>
                                            </View>
                                        )}
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

            {/* ========== SMS Messages Modal ========== */}
            <Modal visible={showSmsModal} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.smsModalContent}>
                        {/* Header */}
                        <View style={styles.smsModalHeader}>
                            <View style={styles.smsModalTitleRow}>
                                <Ionicons name="chatbubbles" size={24} color={COLORS.accent} />
                                <Text style={styles.smsModalTitle}>Messages</Text>
                            </View>
                            <TouchableOpacity onPress={() => setShowSmsModal(false)}>
                                <Ionicons name="close-circle" size={28} color={COLORS.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        {/* Filter Tabs */}
                        <View style={styles.smsFilterRow}>
                            <TouchableOpacity
                                style={[styles.smsFilterBtn, smsFilter === 'transactions' && styles.smsFilterBtnActive]}
                                onPress={() => handleSmsFilterChange('transactions')}
                            >
                                <Ionicons name="card" size={14} color={smsFilter === 'transactions' ? COLORS.accent : COLORS.textSecondary} />
                                <Text style={[styles.smsFilterText, smsFilter === 'transactions' && styles.smsFilterTextActive]}>
                                    Transactions
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.smsFilterBtn, smsFilter === 'all' && styles.smsFilterBtnActive]}
                                onPress={() => handleSmsFilterChange('all')}
                            >
                                <Ionicons name="chatbubble-ellipses" size={14} color={smsFilter === 'all' ? COLORS.accent : COLORS.textSecondary} />
                                <Text style={[styles.smsFilterText, smsFilter === 'all' && styles.smsFilterTextActive]}>
                                    All SMS
                                </Text>
                            </TouchableOpacity>
                        </View>

                        {/* Message Count */}
                        {!smsLoading && smsMessages.length > 0 && (
                            <Text style={styles.smsCount}>
                                {smsMessages.length} messages found
                            </Text>
                        )}

                        {/* Messages List */}
                        {smsLoading ? (
                            <View style={styles.smsLoadingContainer}>
                                <ActivityIndicator size="large" color={COLORS.accent} />
                                <Text style={styles.smsLoadingText}>Reading messages...</Text>
                            </View>
                        ) : !smsPermGranted ? (
                            <View style={styles.smsEmptyContainer}>
                                <Ionicons name="lock-closed" size={48} color={COLORS.textMuted} />
                                <Text style={styles.smsEmptyTitle}>Permission Required</Text>
                                <Text style={styles.smsEmptySubtitle}>
                                    Grant SMS permission to read your bank messages and auto-track spending
                                </Text>
                                <TouchableOpacity style={styles.smsPermBtn} onPress={handleOpenSms}>
                                    <Ionicons name="shield-checkmark" size={18} color="#FFF" style={{ marginRight: 8 }} />
                                    <Text style={styles.smsPermBtnText}>Grant Permission</Text>
                                </TouchableOpacity>
                            </View>
                        ) : smsMessages.length === 0 ? (
                            <View style={styles.smsEmptyContainer}>
                                <Ionicons name="chatbubble-outline" size={48} color={COLORS.textMuted} />
                                <Text style={styles.smsEmptyTitle}>No messages found</Text>
                                <Text style={styles.smsEmptySubtitle}>
                                    {smsFilter === 'transactions'
                                        ? 'No transaction-related SMS found. Try viewing all messages.'
                                        : 'No SMS messages found on this device.'}
                                </Text>
                            </View>
                        ) : (
                            <FlatList
                                data={smsMessages}
                                keyExtractor={(item) => item.id}
                                renderItem={renderSmsItem}
                                style={styles.smsList}
                                showsVerticalScrollIndicator={false}
                                contentContainerStyle={{ paddingBottom: 20 }}
                            />
                        )}
                    </View>
                </View>
            </Modal>

            {/* ========== SMS Detail Modal ========== */}
            <Modal visible={showSmsDetail} animationType="fade" transparent>
                <View style={styles.smsDetailOverlay}>
                    <View style={styles.smsDetailContent}>
                        {selectedSms && (
                            <>
                                {/* Header with sender */}
                                <View style={styles.smsDetailHeader}>
                                    <View style={[styles.smsDetailIcon, { backgroundColor: getTransactionTypeColor(selectedSms.parsed) + '18' }]}>
                                        <Ionicons
                                            name={getTransactionTypeIcon(selectedSms.parsed)}
                                            size={28}
                                            color={getTransactionTypeColor(selectedSms.parsed)}
                                        />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.smsDetailSender}>{selectedSms.sender}</Text>
                                        <Text style={styles.smsDetailDate}>{selectedSms.date} at {selectedSms.time}</Text>
                                    </View>
                                    <TouchableOpacity onPress={() => setShowSmsDetail(false)}>
                                        <Ionicons name="close-circle" size={28} color={COLORS.textSecondary} />
                                    </TouchableOpacity>
                                </View>

                                {/* Full message body */}
                                <ScrollView style={styles.smsDetailBodyScroll}>
                                    <Text style={styles.smsDetailBody}>{selectedSms.body}</Text>
                                </ScrollView>

                                {/* Parsed transaction info */}
                                {selectedSms.parsed && (
                                    <View style={styles.smsDetailParsed}>
                                        <Text style={styles.smsDetailParsedTitle}>💡 Detected Transaction</Text>
                                        <View style={styles.smsDetailInfoGrid}>
                                            {selectedSms.parsed.amount && (
                                                <View style={styles.smsDetailInfoItem}>
                                                    <Text style={styles.smsDetailInfoLabel}>Amount</Text>
                                                    <Text style={[styles.smsDetailInfoValue, { 
                                                        color: selectedSms.parsed.type === 'credit' ? COLORS.accentGreen : COLORS.accentRed 
                                                    }]}>
                                                        ₹{selectedSms.parsed.amount.toLocaleString()}
                                                    </Text>
                                                </View>
                                            )}
                                            {selectedSms.parsed.type && (
                                                <View style={styles.smsDetailInfoItem}>
                                                    <Text style={styles.smsDetailInfoLabel}>Type</Text>
                                                    <Text style={styles.smsDetailInfoValue}>
                                                        {selectedSms.parsed.type === 'credit' ? '📥 Credit' : '📤 Debit'}
                                                    </Text>
                                                </View>
                                            )}
                                            {selectedSms.parsed.merchant && (
                                                <View style={styles.smsDetailInfoItem}>
                                                    <Text style={styles.smsDetailInfoLabel}>Merchant</Text>
                                                    <Text style={styles.smsDetailInfoValue} numberOfLines={1}>
                                                        {selectedSms.parsed.merchant}
                                                    </Text>
                                                </View>
                                            )}
                                            {selectedSms.parsed.account && (
                                                <View style={styles.smsDetailInfoItem}>
                                                    <Text style={styles.smsDetailInfoLabel}>Account</Text>
                                                    <Text style={styles.smsDetailInfoValue}>
                                                        ****{selectedSms.parsed.account}
                                                    </Text>
                                                </View>
                                            )}
                                            {selectedSms.parsed.balance != null && (
                                                <View style={styles.smsDetailInfoItem}>
                                                    <Text style={styles.smsDetailInfoLabel}>Balance</Text>
                                                    <Text style={styles.smsDetailInfoValue}>
                                                        ₹{selectedSms.parsed.balance.toLocaleString()}
                                                    </Text>
                                                </View>
                                            )}
                                            <View style={styles.smsDetailInfoItem}>
                                                <Text style={styles.smsDetailInfoLabel}>Category</Text>
                                                <Text style={styles.smsDetailInfoValue}>
                                                    {categorizeSms(selectedSms.body)}
                                                </Text>
                                            </View>
                                        </View>
                                    </View>
                                )}

                                {/* Actions */}
                                <View style={styles.smsDetailActions}>
                                    {selectedSms.parsed && selectedSms.parsed.amount && (
                                        <TouchableOpacity
                                            style={styles.smsAddExpenseBtn}
                                            onPress={() => handleAddFromSms(selectedSms)}
                                            activeOpacity={0.8}
                                        >
                                            <Ionicons name="add-circle" size={20} color="#FFF" style={{ marginRight: 8 }} />
                                            <Text style={styles.smsAddExpenseBtnText}>
                                                Add as {selectedSms.parsed.type === 'credit' ? 'Income' : 'Expense'}
                                            </Text>
                                        </TouchableOpacity>
                                    )}
                                    <TouchableOpacity
                                        style={styles.smsCloseBtn}
                                        onPress={() => setShowSmsDetail(false)}
                                        activeOpacity={0.8}
                                    >
                                        <Text style={styles.smsCloseBtnText}>Close</Text>
                                    </TouchableOpacity>
                                </View>
                            </>
                        )}
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background, paddingHorizontal: SPACING.lg },

    // Receivables Panel
    receivablePanel: {
        marginBottom: SPACING.md,
        backgroundColor: COLORS.surface,
        borderRadius: BORDER_RADIUS.lg,
        padding: SPACING.md,
        borderWidth: 1,
        borderColor: COLORS.accentGreen + '30',
    },
    receivablePanelHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm,
    },
    receivablePanelTitle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    receivablePanelTitleText: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
    receivableBadge: {
        backgroundColor: COLORS.accentGreen + '30', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1,
    },
    receivableBadgeText: { fontSize: 11, fontWeight: '800', color: COLORS.accentGreen },
    settledToggle: {
        backgroundColor: COLORS.surfaceHighlight, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
        borderWidth: 1, borderColor: COLORS.border,
    },
    settledToggleText: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
    receivableScroll: { flexDirection: 'row' },
    receivableCard: {
        backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.md, padding: SPACING.md,
        marginRight: SPACING.sm, minWidth: 130, maxWidth: 160,
        borderWidth: 1, borderColor: COLORS.border,
        borderLeftWidth: 3,
    },
    receivableCardTop: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
    receivableCardType: { fontSize: 9, fontWeight: '800', color: COLORS.textMuted, letterSpacing: 0.5 },
    receivableCardName: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 2 },
    receivableCardAmount: { fontSize: 16, fontWeight: '800', color: COLORS.accentGreen, marginBottom: 2 },
    receivableCardDesc: { fontSize: 11, color: COLORS.textMuted, marginBottom: 6 },
    receivableSettleBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: COLORS.accentGreen + '18', borderRadius: 6,
        paddingHorizontal: 8, paddingVertical: 4, marginBottom: 4,
    },
    receivableSettleBtnText: { fontSize: 11, fontWeight: '700', color: COLORS.accentGreen },
    receivableDeleteBtn: {
        position: 'absolute', top: 6, right: 6,
    },

    // Consumer Details
    consumerSection: {
        marginTop: SPACING.lg,
        backgroundColor: COLORS.surfaceHighlight,
        borderRadius: BORDER_RADIUS.md,
        padding: SPACING.md,
        borderWidth: 1, borderColor: COLORS.border,
    },
    consumerSectionTitle: { fontSize: 13, fontWeight: '700', color: COLORS.textPrimary, marginBottom: SPACING.sm },
    consumerTypeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: SPACING.sm },
    consumerTypeBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
        borderRadius: BORDER_RADIUS.sm, borderWidth: 1.5, backgroundColor: COLORS.surface,
    },
    consumerTypeLbl: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted },
    consumerInfoBox: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        marginTop: SPACING.sm, backgroundColor: COLORS.surface,
        borderRadius: BORDER_RADIUS.sm, padding: SPACING.sm,
    },
    consumerInfoText: { fontSize: 12, color: COLORS.textSecondary, flex: 1, lineHeight: 16 },
    consumerSubLabel: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary, marginTop: SPACING.sm, marginBottom: SPACING.sm },
    splitRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    splitNameInput: { flex: 1.5, marginBottom: 0 },
    splitAmtInput: { flex: 1, marginBottom: 0 },
    splitRemoveBtn: { padding: 2 },
    addSplitBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingVertical: SPACING.sm,
        borderRadius: BORDER_RADIUS.sm,
        backgroundColor: COLORS.accent + '15',
        borderWidth: 1, borderColor: COLORS.accent + '40',
        justifyContent: 'center', marginTop: 4,
    },
    addSplitBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.accent },

    dateSelector: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingVertical: SPACING.md, marginBottom: SPACING.sm,
    },
    dateArrow: { padding: SPACING.sm },
    dateText: { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary, textAlign: 'center' },
    dateSubText: { fontSize: 12, color: COLORS.textSecondary, textAlign: 'center', marginTop: 2 },
    dateRightGroup: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    summaryRow: { flexDirection: 'row', marginBottom: SPACING.sm },
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

    // ======== SMS Icon Button Styles ========
    smsIconBtn: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: COLORS.accent + '15',
        justifyContent: 'center', alignItems: 'center',
        borderWidth: 1, borderColor: COLORS.accent + '30',
    },
    smsBadge: {
        position: 'absolute', top: -4, right: -4,
        backgroundColor: COLORS.accentRed, borderRadius: 10,
        minWidth: 18, height: 18,
        justifyContent: 'center', alignItems: 'center',
        paddingHorizontal: 4,
    },
    smsBadgeText: {
        fontSize: 10, fontWeight: '800', color: '#FFF',
    },

    // ======== SMS Modal Styles ========
    smsModalContent: {
        backgroundColor: COLORS.background,
        borderTopLeftRadius: BORDER_RADIUS.xxl,
        borderTopRightRadius: BORDER_RADIUS.xxl,
        padding: SPACING.xl,
        maxHeight: '95%',
        flex: 1,
    },
    smsModalHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: SPACING.lg, paddingBottom: SPACING.md,
        borderBottomWidth: 1, borderBottomColor: COLORS.border,
    },
    smsModalTitleRow: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
    },
    smsModalTitle: {
        fontSize: 22, fontWeight: '800', color: COLORS.textPrimary,
    },
    smsFilterRow: {
        flexDirection: 'row', gap: 8, marginBottom: SPACING.md,
    },
    smsFilterBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
        borderRadius: BORDER_RADIUS.md,
        backgroundColor: COLORS.surface,
        borderWidth: 1, borderColor: COLORS.border,
    },
    smsFilterBtnActive: {
        backgroundColor: COLORS.accent + '15',
        borderColor: COLORS.accent + '50',
    },
    smsFilterText: {
        fontSize: 13, fontWeight: '600', color: COLORS.textSecondary,
    },
    smsFilterTextActive: {
        color: COLORS.accent,
    },
    smsCount: {
        fontSize: 12, color: COLORS.textMuted, fontWeight: '500',
        marginBottom: SPACING.sm,
    },
    smsList: {
        flex: 1,
    },
    smsItem: {
        flexDirection: 'row', alignItems: 'flex-start',
        backgroundColor: COLORS.surface,
        borderRadius: BORDER_RADIUS.md,
        padding: SPACING.md,
        marginBottom: SPACING.sm,
        borderWidth: 1, borderColor: COLORS.border,
    },
    smsIcon: {
        width: 40, height: 40, borderRadius: 20,
        justifyContent: 'center', alignItems: 'center',
        marginRight: SPACING.md,
    },
    smsContent: {
        flex: 1,
    },
    smsTopRow: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 4,
    },
    smsSender: {
        fontSize: 14, fontWeight: '700', color: COLORS.textPrimary, flex: 1,
    },
    smsTime: {
        fontSize: 11, color: COLORS.textMuted, fontWeight: '500', marginLeft: 8,
    },
    smsBody: {
        fontSize: 13, color: COLORS.textSecondary, lineHeight: 18,
        marginBottom: 6,
    },
    smsBottom: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
    },
    smsDate: {
        fontSize: 11, color: COLORS.textMuted, fontWeight: '500',
    },
    smsAmountBadge: {
        paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6,
    },
    smsAmountText: {
        fontSize: 12, fontWeight: '800',
    },
    unreadDot: {
        width: 8, height: 8, borderRadius: 4,
        backgroundColor: COLORS.accent,
    },
    smsLoadingContainer: {
        flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60,
    },
    smsLoadingText: {
        fontSize: 14, color: COLORS.textSecondary, marginTop: SPACING.md, fontWeight: '500',
    },
    smsEmptyContainer: {
        flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60,
    },
    smsEmptyTitle: {
        fontSize: 18, fontWeight: '700', color: COLORS.textPrimary, marginTop: SPACING.md,
    },
    smsEmptySubtitle: {
        fontSize: 14, color: COLORS.textSecondary, textAlign: 'center',
        marginTop: SPACING.sm, paddingHorizontal: SPACING.xxl, lineHeight: 20,
    },
    smsPermBtn: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: COLORS.accent, borderRadius: BORDER_RADIUS.md,
        paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md,
        marginTop: SPACING.xxl,
    },
    smsPermBtnText: {
        fontSize: 15, fontWeight: '700', color: '#FFF',
    },

    // ======== SMS Detail Modal Styles ========
    smsDetailOverlay: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
        justifyContent: 'center', alignItems: 'center', padding: SPACING.xl,
    },
    smsDetailContent: {
        backgroundColor: COLORS.background,
        borderRadius: BORDER_RADIUS.xxl,
        padding: SPACING.xl,
        width: '100%', maxHeight: '85%',
        borderWidth: 1, borderColor: COLORS.border,
    },
    smsDetailHeader: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        marginBottom: SPACING.lg, paddingBottom: SPACING.md,
        borderBottomWidth: 1, borderBottomColor: COLORS.border,
    },
    smsDetailIcon: {
        width: 48, height: 48, borderRadius: 24,
        justifyContent: 'center', alignItems: 'center',
    },
    smsDetailSender: {
        fontSize: 16, fontWeight: '700', color: COLORS.textPrimary,
    },
    smsDetailDate: {
        fontSize: 12, color: COLORS.textSecondary, marginTop: 2,
    },
    smsDetailBodyScroll: {
        maxHeight: 150, marginBottom: SPACING.md,
    },
    smsDetailBody: {
        fontSize: 14, color: COLORS.textPrimary, lineHeight: 22,
        backgroundColor: COLORS.surface,
        padding: SPACING.md, borderRadius: BORDER_RADIUS.md,
        borderWidth: 1, borderColor: COLORS.border,
    },
    smsDetailParsed: {
        backgroundColor: COLORS.surfaceHighlight,
        borderRadius: BORDER_RADIUS.md,
        padding: SPACING.md,
        marginBottom: SPACING.md,
        borderWidth: 1, borderColor: COLORS.accent + '25',
    },
    smsDetailParsedTitle: {
        fontSize: 14, fontWeight: '700', color: COLORS.accent,
        marginBottom: SPACING.sm,
    },
    smsDetailInfoGrid: {
        flexDirection: 'row', flexWrap: 'wrap', gap: 10,
    },
    smsDetailInfoItem: {
        backgroundColor: COLORS.surface,
        borderRadius: BORDER_RADIUS.sm,
        paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
        borderWidth: 1, borderColor: COLORS.border,
        minWidth: '45%',
    },
    smsDetailInfoLabel: {
        fontSize: 10, fontWeight: '700', color: COLORS.textMuted,
        textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2,
    },
    smsDetailInfoValue: {
        fontSize: 14, fontWeight: '700', color: COLORS.textPrimary,
    },
    smsDetailActions: {
        gap: 8, marginTop: SPACING.sm,
    },
    smsAddExpenseBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: COLORS.primary,
        borderRadius: BORDER_RADIUS.md,
        paddingVertical: SPACING.md,
    },
    smsAddExpenseBtnText: {
        fontSize: 15, fontWeight: '700', color: '#FFF',
    },
    smsCloseBtn: {
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: COLORS.surface,
        borderRadius: BORDER_RADIUS.md,
        paddingVertical: SPACING.md,
        borderWidth: 1, borderColor: COLORS.border,
    },
    smsCloseBtnText: {
        fontSize: 15, fontWeight: '600', color: COLORS.textSecondary,
    },
});

export default ExpenseTracker;
