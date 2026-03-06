import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Alert, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, BORDER_RADIUS, SPACING, HABIT_CATEGORIES } from '../theme/colors';
import { Card, EmptyState, SectionHeader } from '../components/Card';
import { getTodayKey, getRelativeDate, formatDate, formatDateKey } from '../utils/helpers';
import { addHabit, getHabitChecks, toggleHabitCheck, deleteHabit } from '../db/database';

const HabitTracker = () => {
    const [habits, setHabits] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedDate, setSelectedDate] = useState(getTodayKey());
    const [habitName, setHabitName] = useState('');
    const [habitCategory, setHabitCategory] = useState('morning');
    const [scheduledTime, setScheduledTime] = useState('');

    const loadData = useCallback(async () => {
        try { const data = await getHabitChecks(selectedDate); setHabits(data); } catch (e) { console.error(e); }
    }, [selectedDate]);

    useEffect(() => { loadData(); }, [loadData]);
    const onRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

    const handleToggle = async (habitId) => {
        const now = new Date();
        const checkTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        try { await toggleHabitCheck(habitId, selectedDate, checkTime); loadData(); } catch (e) { console.error(e); }
    };

    const handleSubmit = async () => {
        if (!habitName.trim()) { Alert.alert('Error', 'Enter habit name'); return; }
        try {
            await addHabit({ name: habitName.trim(), category: habitCategory, scheduled_time: scheduledTime.trim() || null });
            setShowModal(false); setHabitName(''); setScheduledTime(''); loadData();
        } catch (e) { Alert.alert('Error', 'Failed to save'); }
    };

    const handleDeleteHabit = (id, name) => {
        Alert.alert('Delete Habit', `Delete "${name}" permanently?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: async () => { await deleteHabit(id); loadData(); } }
        ]);
    };

    const navigateDate = (o) => { const d = new Date(selectedDate); d.setDate(d.getDate() + o); setSelectedDate(formatDateKey(d)); };

    const grouped = HABIT_CATEGORIES.map(c => ({
        ...c, habits: habits.filter(h => h.category === c.id)
    }));

    const checkedCount = habits.filter(h => h.is_checked).length;
    const totalCount = habits.length;
    const completionRate = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;

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

            {/* Progress Ring */}
            <View style={s.progressCard}>
                <View style={s.progressCircle}>
                    <Text style={s.progressPercent}>{completionRate}%</Text>
                    <Text style={s.progressLabel}>Done</Text>
                </View>
                <View style={s.progressInfo}>
                    <Text style={s.progressTitle}>Daily Habits</Text>
                    <Text style={s.progressSub}>{checkedCount} of {totalCount} completed</Text>
                    <View style={s.progressBarBg}>
                        <View style={[s.progressBarFill, { width: `${completionRate}%` }]} />
                    </View>
                </View>
            </View>

            <ScrollView style={s.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}>
                {totalCount === 0 ? <EmptyState title="No habits set" subtitle="Tap + to create your first habit" emoji="✅" /> :
                    grouped.map(group => {
                        if (group.habits.length === 0) return null;
                        return (
                            <View key={group.id}>
                                <SectionHeader title={`${group.emoji} ${group.label}`} rightText={`${group.habits.filter(h => h.is_checked).length}/${group.habits.length}`} />
                                {group.habits.map(habit => {
                                    const isLate = habit.delay_minutes > 0;
                                    return (
                                        <Card key={habit.id}>
                                            <View style={s.habitRow}>
                                                <TouchableOpacity onPress={() => handleToggle(habit.id)} style={[s.checkbox, habit.is_checked && { backgroundColor: group.color, borderColor: group.color }]}>
                                                    {habit.is_checked && <Ionicons name="checkmark" size={16} color="#FFF" />}
                                                </TouchableOpacity>
                                                <View style={s.habitInfo}>
                                                    <Text style={[s.habitName, habit.is_checked && s.habitChecked]}>{habit.name}</Text>
                                                    <View style={s.habitMeta}>
                                                        {habit.scheduled_time && <Text style={s.habitTime}>⏰ {habit.scheduled_time}</Text>}
                                                        {habit.is_checked && habit.check_time && <Text style={s.checkTime}>✓ {habit.check_time}</Text>}
                                                        {habit.is_checked && isLate && <Text style={s.lateText}>⚠ {habit.delay_minutes}min late</Text>}
                                                    </View>
                                                </View>
                                                <TouchableOpacity onPress={() => handleDeleteHabit(habit.id, habit.name)} style={s.deleteBtn}>
                                                    <Ionicons name="trash-outline" size={18} color={COLORS.textMuted} />
                                                </TouchableOpacity>
                                            </View>
                                        </Card>
                                    );
                                })}
                            </View>
                        );
                    })
                }
                <View style={{ height: 100 }} />
            </ScrollView>

            <TouchableOpacity style={s.fab} onPress={() => setShowModal(true)}><Ionicons name="add" size={28} color="#FFF" /></TouchableOpacity>

            <Modal visible={showModal} animationType="slide" transparent>
                <View style={s.modalOverlay}>
                    <View style={s.modalContent}>
                        <View style={s.modalHeader}>
                            <Text style={s.modalTitle}>Add Habit</Text>
                            <TouchableOpacity onPress={() => { setShowModal(false); setHabitName(''); setScheduledTime(''); }}><Ionicons name="close-circle" size={28} color={COLORS.textSecondary} /></TouchableOpacity>
                        </View>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            <Text style={s.inputLabel}>Habit Name *</Text>
                            <TextInput style={s.input} value={habitName} onChangeText={setHabitName} placeholder="e.g., Meditation, Exercise" placeholderTextColor={COLORS.textMuted} />
                            <Text style={s.inputLabel}>Category</Text>
                            <View style={s.catPicker}>
                                {HABIT_CATEGORIES.map(c => (
                                    <TouchableOpacity key={c.id} style={[s.catItem, habitCategory === c.id && { backgroundColor: c.color + '25', borderColor: c.color }]} onPress={() => setHabitCategory(c.id)}>
                                        <Text style={s.catEmoji}>{c.emoji}</Text><Text style={[s.catLabel, habitCategory === c.id && { color: c.color }]}>{c.label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            <Text style={s.inputLabel}>Scheduled Time (optional)</Text>
                            <TextInput style={s.input} value={scheduledTime} onChangeText={setScheduledTime} placeholder="e.g., 06:30" placeholderTextColor={COLORS.textMuted} />
                            <TouchableOpacity style={s.submitBtn} onPress={handleSubmit}><Text style={s.submitBtnText}>Save Habit</Text></TouchableOpacity>
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
    progressCard: { flexDirection: 'row', backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, padding: SPACING.xl, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
    progressCircle: { width: 70, height: 70, borderRadius: 35, borderWidth: 4, borderColor: COLORS.accentGreen, justifyContent: 'center', alignItems: 'center', marginRight: SPACING.lg },
    progressPercent: { fontSize: 18, fontWeight: '900', color: COLORS.accentGreen }, progressLabel: { fontSize: 10, color: COLORS.textMuted, fontWeight: '600' },
    progressInfo: { flex: 1 }, progressTitle: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary },
    progressSub: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
    progressBarBg: { height: 6, backgroundColor: COLORS.surfaceHighlight, borderRadius: 3, marginTop: 8, overflow: 'hidden' },
    progressBarFill: { height: '100%', backgroundColor: COLORS.accentGreen, borderRadius: 3 },
    list: { flex: 1 },
    habitRow: { flexDirection: 'row', alignItems: 'center' },
    checkbox: { width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: COLORS.borderLight, justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md },
    habitInfo: { flex: 1 }, habitName: { fontSize: 15, fontWeight: '600', color: COLORS.textPrimary },
    habitChecked: { textDecorationLine: 'line-through', color: COLORS.textMuted },
    habitMeta: { flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' },
    habitTime: { fontSize: 11, color: COLORS.accent, fontWeight: '600' }, checkTime: { fontSize: 11, color: COLORS.accentGreen, fontWeight: '600' },
    lateText: { fontSize: 11, color: COLORS.accentRed, fontWeight: '600' }, deleteBtn: { padding: SPACING.sm },
    fab: { position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: COLORS.background, borderTopLeftRadius: BORDER_RADIUS.xxl, borderTopRightRadius: BORDER_RADIUS.xxl, padding: SPACING.xxl, maxHeight: '90%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xl },
    modalTitle: { fontSize: 22, fontWeight: '800', color: COLORS.textPrimary },
    inputLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, marginBottom: SPACING.sm, marginTop: SPACING.md },
    input: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md, padding: SPACING.lg, color: COLORS.textPrimary, fontSize: 16, borderWidth: 1, borderColor: COLORS.border },
    catPicker: { flexDirection: 'row', gap: 8 },
    catItem: { flex: 1, alignItems: 'center', paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.md, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.surface },
    catEmoji: { fontSize: 20 }, catLabel: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary, marginTop: 2 },
    submitBtn: { backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.md, paddingVertical: SPACING.lg, alignItems: 'center', marginTop: SPACING.xxl, marginBottom: SPACING.xxxl },
    submitBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
});

export default HabitTracker;
