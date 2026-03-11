import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Dimensions } from 'react-native';
import { COLORS, SPACING } from '../theme/colors';
import { SectionHeader } from '../components/Card';
import { getExpenses, getDailyRecords, getTrades } from '../db/database';
import { format, subDays } from 'date-fns';
import { LineChart, BarChart } from 'react-native-chart-kit';

const screenWidth = Dimensions.get('window').width - (SPACING.lg * 2);

const HomeScreen = ({ navigation }) => {
    const [refreshing, setRefreshing] = useState(false);
    const [weekLabels, setWeekLabels] = useState([]);
    const [expensesData, setExpensesData] = useState([0,0,0,0,0,0,0]);
    const [productivityData, setProductivityData] = useState([0,0,0,0,0,0,0]);
    const [tradeData, setTradeData] = useState([0,0,0,0,0,0,0]);

    const loadDashboard = useCallback(async () => {
        try {
            const labels = [];
            const dates = [];
            for (let i = 6; i >= 0; i--) {
                const date = subDays(new Date(), i);
                labels.push(format(date, 'EEE'));
                dates.push(format(date, 'yyyy-MM-dd'));
            }
            setWeekLabels(labels);

            const allExpenses = await getExpenses();
            const expData = dates.map(d => {
                const dayExp = allExpenses.filter(e => e.date === d && e.type !== 'income');
                return dayExp.reduce((sum, e) => sum + e.amount, 0);
            });
            setExpensesData(expData);

            const allRecords = await getDailyRecords();
            const prodData = dates.map(d => {
                const dayRecs = allRecords.filter(r => r.date === d);
                return dayRecs.reduce((sum, r) => sum + (r.hours_spent || 0), 0);
            });
            setProductivityData(prodData);

            const allTrades = await getTrades();
            const trdData = dates.map(d => {
                const dayTrades = allTrades.filter(t => t.date === d);
                return dayTrades.reduce((sum, t) => sum + (t.profit_loss || 0), 0);
            });
            setTradeData(trdData);

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

    const chartConfig = {
        backgroundGradientFrom: COLORS.surface,
        backgroundGradientTo: COLORS.surfaceHighlight,
        color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
        labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
        strokeWidth: 2,
        barPercentage: 0.5,
        useShadowColorFromDataset: false,
        decimalPlaces: 0,
    };

    const expHasData = expensesData.some(d => d > 0);
    const prodHasData = productivityData.some(d => d > 0);
    const trdHasData = tradeData.some(d => d !== 0);

    return (
        <ScrollView style={s.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}>
            <View style={s.header}>
                <View>
                    <Text style={s.greeting}>{greeting} 👋</Text>
                    <Text style={s.date}>{format(now, 'EEEE, d MMMM')}</Text>
                </View>
                <View style={s.avatar}>
                    <Text style={s.avatarText}>ID</Text>
                </View>
            </View>

            <SectionHeader title="Weekly Analysis" />

            <Text style={s.chartTitle}>Productivity (Hours)</Text>
            <View style={s.chartContainer}>
                <LineChart
                    data={{
                        labels: weekLabels.length ? weekLabels : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                        datasets: [{ data: prodHasData ? productivityData : [0,0,0,0,0,0,0] }]
                    }}
                    width={screenWidth}
                    height={220}
                    chartConfig={{
                        ...chartConfig,
                        color: (opacity = 1) => `rgba(139, 92, 246, ${opacity})`, 
                        propsForDots: { r: "4", strokeWidth: "2", stroke: COLORS.primary }
                    }}
                    bezier
                    style={s.chart}
                />
            </View>

            <Text style={s.chartTitle}>Expenses (₹)</Text>
            <View style={s.chartContainer}>
                <BarChart
                    data={{
                        labels: weekLabels.length ? weekLabels : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                        datasets: [{ data: expHasData ? expensesData : [0,0,0,0,0,0,0] }]
                    }}
                    width={screenWidth}
                    height={220}
                    yAxisLabel="₹"
                    chartConfig={{
                        ...chartConfig,
                        color: (opacity = 1) => `rgba(244, 63, 94, ${opacity})`, 
                    }}
                    style={s.chart}
                />
            </View>

            <Text style={s.chartTitle}>Trading P&L (₹)</Text>
            <View style={s.chartContainer}>
                <LineChart
                     data={{
                        labels: weekLabels.length ? weekLabels : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                        datasets: [{ data: (trdHasData ? tradeData : [0,0,0,0,0,0,0]).map(v => v || 0) }]
                    }}
                    width={screenWidth}
                    height={220}
                    yAxisLabel="₹"
                    chartConfig={{
                        ...chartConfig,
                        color: (opacity = 1) => `rgba(16, 185, 129, ${opacity})`, 
                        propsForDots: { r: "4", strokeWidth: "2", stroke: COLORS.accentGreen }
                    }}
                    bezier
                    style={s.chart}
                />
            </View>

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
    chartTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary, marginTop: SPACING.md, marginBottom: SPACING.sm },
    chartContainer: { backgroundColor: COLORS.surface, borderRadius: 16, overflow: 'hidden', paddingVertical: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
    chart: { marginVertical: 8, borderRadius: 16, paddingRight: 30 },
});

export default HomeScreen;
