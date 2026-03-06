import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, BORDER_RADIUS, SPACING } from '../theme/colors';
import { Card, StatCard, SectionHeader } from '../components/Card';
import { formatCurrency, getTodayKey } from '../utils/helpers';
import { getExpenses, getExpenseSummary, getDailyRecords, getTrades, getHabitChecks } from '../db/database';

const HomeScreen = ({ navigation }) => {
    const [refreshing, setRefreshing] = useState(false);
    const [todayExpenses, setTodayExpenses] = useState(0);
    const [todayIncome, setTodayIncome] = useState(0);
    const [productiveHours, setProductiveHours] = useState(0);
    const [tradePnL, setTradePnL] = useState(0);
    const [habitsCompleted, setHabitsCompleted] = useState(0);
    const [habitsTotal, setHabitsTotal] = useState(0);

    const loadDashboard = useCallback(async () => {
        const today = getTodayKey();
        try {
            const expenses = await getExpenses(today);
            let spent = 0, inc = 0;
            expenses.forEach(e => { if (e.type === 'income') inc += e.amount; else spent += e.amount; });
            setTodayExpenses(spent);
            setTodayIncome(inc);

            const records = await getDailyRecords(today);
            setProductiveHours(records.reduce((s, r) => s + (r.hours_spent || 0), 0));

            const trades = await getTrades(today);
            setTradePnL(trades.reduce((s, t) => s + (t.profit_loss || 0), 0));

            const habits = await getHabitChecks(today);
            setHabitsTotal(habits.length);
            setHabitsCompleted(habits.filter(h => h.is_checked).length);
        } catch (e) { console.error(e); }
    }, []);

    useEffect(() => {
        const unsubscribe = navigation.addListener('focus', loadDashboard);
        return unsubscribe;
    }, [navigation, loadDashboard]);

    const onRefresh = async () => { setRefreshing(true); await loadDashboard(); setRefreshing(false); };

    const now = new Date();
    const hour = now.getHours();
    const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';

    const quickActions = [
        { title: 'Expenses', emoji: '💰', screen: 'Expenses', color: COLORS.accentRed },
        { title: 'Daily Log', emoji: '📋', screen: 'Daily', color: COLORS.accent },
        { title: 'Trading', emoji: '📈', screen: 'Trading', color: COLORS.accentGreen },
        { title: 'Habits', emoji: '✅', screen: 'Habits', color: COLORS.accentOrange },
    ];

    return (
        <ScrollView style={s.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}>
            <View style={s.header}>
                <View>
                    <Text style={s.greeting}>{greeting} 👋</Text>
                    <Text style={s.date}>{now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
                </View>
                <View style={s.avatar}>
                    <Text style={s.avatarText}>ID</Text>
                </View>
            </View>

            {/* Quick Actions */}
            <View style={s.quickActions}>
                {quickActions.map(a => (
                    <TouchableOpacity key={a.screen} style={s.quickAction} onPress={() => navigation.navigate(a.screen)} activeOpacity={0.7}>
                        <View style={[s.qaIcon, { backgroundColor: a.color + '15' }]}>
                            <Text style={s.qaEmoji}>{a.emoji}</Text>
                        </View>
                        <Text style={s.qaTitle}>{a.title}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Today's Summary */}
            <SectionHeader title="Today's Overview" />
            <View style={s.statsRow}>
                <StatCard title="Spent" value={formatCurrency(todayExpenses)} color={COLORS.accentRed} />
                <StatCard title="Income" value={formatCurrency(todayIncome)} color={COLORS.accentGreen} />
            </View>
            <View style={s.statsRow}>
                <StatCard title="Productive" value={`${productiveHours.toFixed(1)}h`} color={COLORS.accent} />
                <StatCard title="Trade P&L" value={formatCurrency(tradePnL)} color={tradePnL >= 0 ? COLORS.accentGreen : COLORS.accentRed} />
            </View>

            {/* Habits Progress */}
            <Card style={s.habitsCard}>
                <View style={s.habitsHeader}>
                    <Text style={s.habitsTitle}>Habits Progress</Text>
                    <Text style={[s.habitsPercent, { color: COLORS.accentGreen }]}>
                        {habitsTotal > 0 ? Math.round((habitsCompleted / habitsTotal) * 100) : 0}%
                    </Text>
                </View>
                <View style={s.habitsBarBg}>
                    <View style={[s.habitsBarFill, { width: `${habitsTotal > 0 ? (habitsCompleted / habitsTotal) * 100 : 0}%` }]} />
                </View>
                <Text style={s.habitsSub}>{habitsCompleted} of {habitsTotal} habits completed today</Text>
            </Card>

            <View style={{ height: 40 }} />
        </ScrollView>
    );
};

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background, paddingHorizontal: SPACING.lg },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: SPACING.xl },
    greeting: { fontSize: 26, fontWeight: '900', color: COLORS.textPrimary },
    date: { fontSize: 14, color: COLORS.textSecondary, marginTop: 4, fontWeight: '500' },
    avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' },
    avatarText: { fontSize: 16, fontWeight: '800', color: '#FFF' },
    quickActions: { flexDirection: 'row', marginBottom: SPACING.lg, gap: 10 },
    quickAction: { flex: 1, backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, paddingVertical: SPACING.lg, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
    qaIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
    qaEmoji: { fontSize: 22 },
    qaTitle: { fontSize: 11, fontWeight: '700', color: COLORS.textSecondary },
    statsRow: { flexDirection: 'row', marginBottom: SPACING.sm },
    habitsCard: { marginTop: SPACING.sm },
    habitsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    habitsTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
    habitsPercent: { fontSize: 20, fontWeight: '900' },
    habitsBarBg: { height: 8, backgroundColor: COLORS.surfaceHighlight, borderRadius: 4, marginVertical: SPACING.sm, overflow: 'hidden' },
    habitsBarFill: { height: '100%', backgroundColor: COLORS.accentGreen, borderRadius: 4 },
    habitsSub: { fontSize: 13, color: COLORS.textSecondary },
});

export default HomeScreen;
