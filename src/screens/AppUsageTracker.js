import React, { useState, useCallback, useEffect } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
    Modal, Alert, RefreshControl
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, BORDER_RADIUS, SPACING } from '../theme/colors';
import { Card, StatCard, EmptyState, SectionHeader } from '../components/Card';
import { getTodayKey, getRelativeDate, formatDate, formatDateKey } from '../utils/helpers';
import { addAppUsage, getAppUsage, deleteAppUsage } from '../db/database';

const COMMON_APPS = [
    { name: 'WhatsApp', color: '#25D366', icon: 'logo-whatsapp' },
    { name: 'Instagram', color: '#E1306C', icon: 'logo-instagram' },
    { name: 'YouTube', color: '#FF0000', icon: 'logo-youtube' },
    { name: 'Facebook', color: '#1877F2', icon: 'logo-facebook' },
    { name: 'LinkedIn', color: '#0A66C2', icon: 'logo-linkedin' },
    { name: 'Google Chrome', color: '#4285F4', icon: 'globe-outline' },
    { name: 'Slack', color: '#4A154B', icon: 'chatbubbles-outline' },
    { name: 'Twitter / X', color: '#000000', icon: 'logo-twitter' },
];

const AppUsageTracker = () => {
    const [usage, setUsage] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedDate, setSelectedDate] = useState(getTodayKey());

    // Form state
    const [appName, setAppName] = useState('');
    const [hoursUsed, setHoursUsed] = useState('');
    const [timeAt, setTimeAt] = useState('');

    const loadData = useCallback(async () => {
        try {
            const data = await getAppUsage(selectedDate);
            setUsage(data);
        } catch (err) {
            console.error('Error loading app usage:', err);
        }
    }, [selectedDate]);

    useEffect(() => { loadData(); }, [loadData]);

    const onRefresh = async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    };

    const handleSubmit = async () => {
        if (!appName.trim() || !hoursUsed || isNaN(hoursUsed)) {
            Alert.alert('Error', 'Please enter a valid app name and hours');
            return;
        }
        try {
            await addAppUsage({
                app_name: appName.trim(),
                hours_used: parseFloat(hoursUsed),
                time_used_at: timeAt.trim() || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                date: selectedDate,
            });
            setShowModal(false);
            resetForm();
            loadData();
        } catch (err) {
            Alert.alert('Error', 'Failed to save app usage');
        }
    };

    const resetForm = () => {
        setAppName('');
        setHoursUsed('');
        setTimeAt('');
    };

    const handleDelete = (id) => {
        Alert.alert('Delete', 'Remove this usage entry?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: async () => { await deleteAppUsage(id); loadData(); } },
        ]);
    };

    const navigateDate = (offset) => {
        const d = new Date(selectedDate);
        d.setDate(d.getDate() + offset);
        setSelectedDate(formatDateKey(d));
    };

    const totalHours = usage.reduce((sum, item) => sum + (item.hours_used || 0), 0);

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

            {/* Screen Time Summary */}
            <Card style={styles.summaryCard}>
                <View style={styles.summaryHeader}>
                    <View>
                        <Text style={styles.summaryLabel}>Total Screen Time</Text>
                        <Text style={styles.summaryValue}>{totalHours.toFixed(1)}h</Text>
                    </View>
                    <View style={[styles.iconBox, { backgroundColor: COLORS.primary + '20' }]}>
                        <Ionicons name="phone-portrait-outline" size={32} color={COLORS.primary} />
                    </View>
                </View>
                <View style={styles.progressBarBg}>
                    <View style={[styles.progressBarFill, { width: `${Math.min(100, (totalHours / 12) * 100)}%`, backgroundColor: totalHours > 6 ? COLORS.accentRed : COLORS.accentGreen }]} />
                </View>
                <Text style={styles.summarySub}>{totalHours > 6 ? 'High usage detected' : 'Normal usage'}</Text>
            </Card>

            {/* Usage List */}
            <SectionHeader title="App Breakdown" rightText={`${usage.length} apps`} />
            <ScrollView
                style={styles.list}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
            >
                {usage.length === 0 ? (
                    <EmptyState title="No usage logged" subtitle="Tap + to record your app usage" emoji="📱" />
                ) : (
                    usage.map((item) => {
                        const commonApp = COMMON_APPS.find(a => a.name.toLowerCase() === item.app_name.toLowerCase());
                        return (
                            <Card key={item.id} onPress={() => handleDelete(item.id)}>
                                <View style={styles.usageRow}>
                                    <View style={[styles.appIcon, { backgroundColor: (commonApp?.color || COLORS.primary) + '20' }]}>
                                        <Ionicons name={commonApp?.icon || 'apps-outline'} size={24} color={commonApp?.color || COLORS.primary} />
                                    </View>
                                    <View style={styles.usageInfo}>
                                        <Text style={styles.appName}>{item.app_name}</Text>
                                        <Text style={styles.usageTime}>Used at: {item.time_used_at}</Text>
                                    </View>
                                    <View style={styles.usageHoursBox}>
                                        <Text style={[styles.usageHours, { color: commonApp?.color || COLORS.primary }]}>{item.hours_used}h</Text>
                                    </View>
                                </View>
                            </Card>
                        );
                    })
                )}
                <View style={{ height: 100 }} />
            </ScrollView>

            {/* FAB */}
            <TouchableOpacity style={styles.fab} onPress={() => setShowModal(true)}>
                <Ionicons name="add" size={28} color="#FFF" />
            </TouchableOpacity>

            {/* Add Usage Modal */}
            <Modal visible={showModal} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Log App Usage</Text>
                            <TouchableOpacity onPress={() => { setShowModal(false); resetForm(); }}>
                                <Ionicons name="close-circle" size={28} color={COLORS.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false}>
                            {/* Quick App Suggestions */}
                            <Text style={styles.inputLabel}>Quick Select</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.suggestionScroll}>
                                {COMMON_APPS.map(app => (
                                    <TouchableOpacity
                                        key={app.name}
                                        style={[styles.suggestionChip, appName === app.name && { borderColor: app.color, backgroundColor: app.color + '15' }]}
                                        onPress={() => setAppName(app.name)}
                                    >
                                        <Ionicons name={app.icon} size={16} color={app.color} />
                                        <Text style={[styles.suggestionText, appName === app.name && { color: app.color }]}>{app.name}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>

                            <Text style={styles.inputLabel}>App Name *</Text>
                            <TextInput
                                style={styles.input}
                                value={appName}
                                onChangeText={setAppName}
                                placeholder="Name of the app"
                                placeholderTextColor={COLORS.textMuted}
                            />

                            <View style={styles.row}>
                                <View style={styles.halfInput}>
                                    <Text style={styles.inputLabel}>Hours Used *</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={hoursUsed}
                                        onChangeText={setHoursUsed}
                                        placeholder="e.g. 1.5"
                                        placeholderTextColor={COLORS.textMuted}
                                        keyboardType="decimal-pad"
                                    />
                                </View>
                                <View style={styles.halfInput}>
                                    <Text style={styles.inputLabel}>Time (Optional)</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={timeAt}
                                        onChangeText={setTimeAt}
                                        placeholder="e.g. 2:00 PM"
                                        placeholderTextColor={COLORS.textMuted}
                                    />
                                </View>
                            </View>

                            <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
                                <Text style={styles.submitBtnText}>Save Usage</Text>
                            </TouchableOpacity>
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
    summaryCard: {
        backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, padding: SPACING.xl,
        marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border,
    },
    summaryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    summaryLabel: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600' },
    summaryValue: { fontSize: 32, fontWeight: '900', color: COLORS.textPrimary, marginVertical: 4 },
    iconBox: { width: 56, height: 56, borderRadius: BORDER_RADIUS.md, justifyContent: 'center', alignItems: 'center' },
    progressBarBg: { height: 8, backgroundColor: COLORS.surfaceHighlight, borderRadius: 4, marginVertical: SPACING.md, overflow: 'hidden' },
    progressBarFill: { height: '100%', borderRadius: 4 },
    summarySub: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '500' },
    list: { flex: 1 },
    usageRow: { flexDirection: 'row', alignItems: 'center' },
    appIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md },
    usageInfo: { flex: 1 },
    appName: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
    usageTime: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
    usageHoursBox: { backgroundColor: COLORS.surfaceHighlight, borderRadius: BORDER_RADIUS.sm, paddingHorizontal: SPACING.md, paddingVertical: 4 },
    usageHours: { fontSize: 15, fontWeight: '800' },
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
        borderTopRightRadius: BORDER_RADIUS.xxl, padding: SPACING.xxl, maxHeight: '90%',
    },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xl },
    modalTitle: { fontSize: 22, fontWeight: '800', color: COLORS.textPrimary },
    inputLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, marginBottom: SPACING.sm, marginTop: SPACING.md },
    suggestionScroll: { marginBottom: SPACING.md },
    suggestionChip: {
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md,
        paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.md, borderWidth: 1.5,
        borderColor: COLORS.border, marginRight: 8, backgroundColor: COLORS.surface,
    },
    suggestionText: { fontSize: 12, fontWeight: '600', marginLeft: 6, color: COLORS.textSecondary },
    input: {
        backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md, padding: SPACING.lg,
        color: COLORS.textPrimary, fontSize: 16, borderWidth: 1, borderColor: COLORS.border,
    },
    row: { flexDirection: 'row', gap: 12 },
    halfInput: { flex: 1 },
    submitBtn: {
        backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.md,
        paddingVertical: SPACING.lg, alignItems: 'center', marginTop: SPACING.xxl, marginBottom: SPACING.xxxl,
    },
    submitBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
});

export default AppUsageTracker;
