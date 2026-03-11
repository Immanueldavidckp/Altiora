import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Modal, TextInput, Switch, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '../theme/colors';
import { getTodayKey, getRelativeDate, formatDate, formatDateKey } from '../utils/helpers';
import { getAdvHabits, getAdvHabitChecks, toggleAdvHabit, addAdvHabit, deleteAdvHabit } from '../db/database';

const isHabitVisible = (habit, dateStr) => {
    if (habit.from_date && dateStr < habit.from_date) return false;
    if (habit.to_date && dateStr > habit.to_date) return false;
    if (habit.repeat_type === 'Everyday') return true;
    if (habit.repeat_type === 'Once') return (!habit.from_date) || (habit.from_date === dateStr);
    
    const targetDate = new Date(dateStr);
    if (!habit.from_date) return true;
    const startDate = new Date(habit.from_date);

    if (habit.repeat_type === 'Weekly') return targetDate.getDay() === startDate.getDay();
    if (habit.repeat_type === 'Monthly') return targetDate.getDate() === startDate.getDate();
    if (habit.repeat_type === 'Yearly') return targetDate.getDate() === startDate.getDate() && targetDate.getMonth() === startDate.getMonth();
    
    return true;
};

const PRIORITY_OPTS = [
    { value: 1, label: 'Must do in time (Priority 1)' },
    { value: 2, label: 'Must do within the day' },
    { value: 3, label: 'Optional' }
];

const REPEAT_OPTS = ['Everyday', 'Weekly', 'Monthly', 'Yearly', 'Once'];

const Cell = React.memo(({ hour, slot, habit, onPressEmpty, onToggle, onLongPress }) => {
    if (!habit) {
        return (
            <TouchableOpacity
                activeOpacity={1}
                onPress={() => onPressEmpty(hour, slot)}
                style={s.emptyCell}
            />
        );
    }

    const { is_checked, priority } = habit;
    let pColor = COLORS.borderLight;
    if (priority === 1) pColor = COLORS.accentRed;
    if (priority === 2) pColor = COLORS.accentOrange;

    return (
        <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => onToggle(habit.id)}
            onLongPress={() => onLongPress(habit)}
            delayLongPress={400}
            style={[s.habitCell, !is_checked && { borderColor: pColor }, is_checked && s.habitCellChecked]}
        >
            {is_checked ? <Ionicons name="checkmark" size={16} color="#FFF" /> : null}
        </TouchableOpacity>
    );
}, (prev, next) => prev.habit === next.habit && prev.hour === next.hour);

const HabitTracker = () => {
    const [refreshing, setRefreshing] = useState(false);
    const [selectedDate, setSelectedDate] = useState(getTodayKey());
    
    const [habitsMap, setHabitsMap] = useState({});
    
    // Modal State
    const [modalVisible, setModalVisible] = useState(false);
    const [modalSlot, setModalSlot] = useState({ hour: 0, slot: 0 });
    const [form, setForm] = useState({
        name: '', startTime: '', endTime: '', hasNotification: false, 
        priority: 1, fromDate: getTodayKey(), toDate: '', repeatType: 'Everyday'
    });

    const loadData = useCallback(async () => {
        try {
            const allHabits = await getAdvHabits();
            const checks = await getAdvHabitChecks(selectedDate);
            const checksMap = {};
            checks.forEach(c => checksMap[c.habit_id] = c.is_checked);

            const map = {};
            allHabits.forEach(h => {
                if (isHabitVisible(h, selectedDate)) {
                    const key = `${h.hour_slot}:${h.slot_index}`;
                    map[key] = { ...h, is_checked: !!checksMap[h.id] };
                }
            });
            setHabitsMap(map);
        } catch (e) { console.error(e); }
    }, [selectedDate]);

    useEffect(() => { loadData(); }, [loadData]);

    const handleToggle = async (habitId) => {
        try {
            await toggleAdvHabit(habitId, selectedDate);
            loadData();
        } catch (e) { console.error(e); }
    };

    const handleLongPress = (habit) => {
        let msg = `${habit.start_time || 'N/A'} - ${habit.end_time || 'N/A'}\nPriority: ${habit.priority}`;
        Alert.alert(habit.name, msg, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete Habit', style: 'destructive', onPress: async () => {
                await deleteAdvHabit(habit.id);
                loadData();
            }}
        ]);
    };

    const handlePressEmpty = (hour, slot) => {
        setModalSlot({ hour, slot });
        setForm({
            name: '', startTime: `${String(hour).padStart(2, '0')}:00`, endTime: '', 
            hasNotification: false, priority: 1, fromDate: getTodayKey(), toDate: '', repeatType: 'Everyday'
        });
        setModalVisible(true);
    };

    const submitHabit = async () => {
        if (!form.name.trim()) return Alert.alert('Error', 'Please enter habit name');
        try {
            await addAdvHabit({
                name: form.name.trim(),
                start_time: form.startTime.trim() || null,
                end_time: form.endTime.trim() || null,
                hour_slot: modalSlot.hour,
                slot_index: modalSlot.slot,
                has_notification: form.hasNotification,
                priority: form.priority,
                from_date: form.fromDate.trim() || null,
                to_date: form.toDate.trim() || null,
                repeat_type: form.repeatType
            });
            setModalVisible(false);
            loadData();
        } catch (e) { console.error(e); Alert.alert('Error saving habit'); }
    };

    const navigateDate = (o) => {
        const d = new Date(selectedDate);
        d.setDate(d.getDate() + o);
        setSelectedDate(formatDateKey(d));
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    };

    return (
        <View style={s.container}>
            <View style={s.dateSelector}>
                <TouchableOpacity onPress={() => navigateDate(-1)} style={s.dateArrow}>
                    <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setSelectedDate(getTodayKey())}>
                    <Text style={s.dateText}>{getRelativeDate(selectedDate)}</Text>
                    <Text style={s.dateSubText}>{formatDate(selectedDate)}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => navigateDate(1)} style={s.dateArrow}>
                    <Ionicons name="chevron-forward" size={22} color={COLORS.textPrimary} />
                </TouchableOpacity>
            </View>

            <ScrollView 
                style={s.scrollContainer} 
                contentContainerStyle={s.scrollContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
                showsVerticalScrollIndicator={false}
            >
                <View style={s.gridContainer}>
                    {Array.from({ length: 24 }).map((_, h) => (
                        <View key={`hour_${h}`} style={s.row}>
                            <Text style={s.hourLabel}>{String(h).padStart(2, '0')}:00</Text>
                            <View style={s.slotsContainer}>
                                {Array.from({ length: 5 }).map((_, slot) => {
                                    const key = `${h}:${slot}`;
                                    const habit = habitsMap[key];
                                    return (
                                        <Cell
                                            key={key}
                                            hour={h}
                                            slot={slot}
                                            habit={habit}
                                            onPressEmpty={handlePressEmpty}
                                            onToggle={handleToggle}
                                            onLongPress={handleLongPress}
                                        />
                                    );
                                })}
                            </View>
                        </View>
                    ))}
                </View>
            </ScrollView>

            <Modal visible={modalVisible} animationType="slide" transparent>
                <View style={s.modalOverlay}>
                    <View style={s.modalContent}>
                        <View style={s.modalHeader}>
                            <Text style={s.modalTitle}>Add Habit at {String(modalSlot.hour).padStart(2,'0')}:00</Text>
                            <TouchableOpacity onPress={() => setModalVisible(false)}>
                                <Ionicons name="close-circle" size={28} color={COLORS.textSecondary} />
                            </TouchableOpacity>
                        </View>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            <Text style={s.inputLabel}>Activity Name</Text>
                            <TextInput style={s.input} value={form.name} onChangeText={v => setForm({...form, name: v})} placeholder="e.g. Read Book" placeholderTextColor={COLORS.textMuted} />
                            
                            <View style={s.hStack}>
                                <View style={{flex: 1, marginRight: 8}}>
                                    <Text style={s.inputLabel}>Start Time</Text>
                                    <TextInput style={s.input} value={form.startTime} onChangeText={v => setForm({...form, startTime: v})} placeholder="HH:MM" placeholderTextColor={COLORS.textMuted} />
                                </View>
                                <View style={{flex: 1, marginLeft: 8}}>
                                    <Text style={s.inputLabel}>End Time</Text>
                                    <TextInput style={s.input} value={form.endTime} onChangeText={v => setForm({...form, endTime: v})} placeholder="HH:MM" placeholderTextColor={COLORS.textMuted} />
                                </View>
                            </View>

                            <Text style={s.inputLabel}>Priority</Text>
                            {PRIORITY_OPTS.map(p => (
                                <TouchableOpacity key={p.value} style={[s.radioItem, form.priority === p.value && s.radioSelected]} onPress={() => setForm({...form, priority: p.value})}>
                                    <Text style={form.priority === p.value ? {color: COLORS.primary, fontWeight: '700'} : {color: COLORS.textSecondary}}>{p.label}</Text>
                                </TouchableOpacity>
                            ))}

                            <Text style={s.inputLabel}>Repeat Frequency</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{paddingBottom: 8}}>
                                {REPEAT_OPTS.map(r => (
                                    <TouchableOpacity key={r} style={[s.pill, form.repeatType === r && s.pillSelected]} onPress={() => setForm({...form, repeatType: r})}>
                                        <Text style={form.repeatType === r ? {color: '#FFF', fontWeight: 'bold'} : {color: COLORS.textSecondary}}>{r}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>

                            <View style={s.hStack}>
                                <View style={{flex: 1, marginRight: 8}}>
                                    <Text style={s.inputLabel}>From Date</Text>
                                    <TextInput style={s.input} value={form.fromDate} onChangeText={v => setForm({...form, fromDate: v})} placeholder="YYYY-MM-DD" placeholderTextColor={COLORS.textMuted} />
                                </View>
                                <View style={{flex: 1, marginLeft: 8}}>
                                    <Text style={s.inputLabel}>To Date</Text>
                                    <TextInput style={s.input} value={form.toDate} onChangeText={v => setForm({...form, toDate: v})} placeholder="Optional" placeholderTextColor={COLORS.textMuted} />
                                </View>
                            </View>

                            <View style={[s.hStack, {marginTop: SPACING.lg, marginBottom: SPACING.xl, alignItems: 'center'}]}>
                                <Text style={[s.inputLabel, {marginTop: 0, flex: 1}]}>Enable Notifications</Text>
                                <Switch value={form.hasNotification} onValueChange={v => setForm({...form, hasNotification: v})} trackColor={{ false: COLORS.borderLight, true: COLORS.primary }} />
                            </View>

                            <TouchableOpacity style={s.submitBtn} onPress={submitHabit}>
                                <Text style={s.submitBtnText}>Create Habit</Text>
                            </TouchableOpacity>
                            <View style={{height: 100}}/>
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    dateSelector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: SPACING.sm, paddingHorizontal: SPACING.lg },
    dateArrow: { padding: SPACING.sm },
    dateText: { fontSize: 18, fontWeight: '800', color: COLORS.textPrimary, textAlign: 'center' },
    dateSubText: { fontSize: 11, color: COLORS.textSecondary, textAlign: 'center', marginTop: 2 },
    scrollContainer: { flex: 1 },
    scrollContent: { flex: 1 },
    gridContainer: { flex: 1, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border, paddingBottom: 10 },
    row: { flex: 1, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.borderLight },
    slotsContainer: { flex: 1, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingRight: SPACING.lg },
    hourLabel: { width: 50, color: COLORS.textSecondary, fontSize: 11, textAlign: 'center', fontWeight: '600' },
    
    emptyCell: { width: 34, height: 34 },
    habitCell: { width: 24, height: 24, borderRadius: BORDER_RADIUS.sm, borderWidth: 1.5, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' },
    habitCellChecked: { backgroundColor: COLORS.accentGreen, borderColor: '#10b981' },
    
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: COLORS.background, borderTopLeftRadius: BORDER_RADIUS.xxl, borderTopRightRadius: BORDER_RADIUS.xxl, padding: SPACING.xxl, maxHeight: '90%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xl },
    modalTitle: { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary },
    inputLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 6, marginTop: SPACING.md },
    input: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md, padding: SPACING.lg, color: COLORS.textPrimary, fontSize: 15, borderWidth: 1, borderColor: COLORS.border },
    hStack: { flexDirection: 'row' },
    radioItem: { paddingVertical: SPACING.md, paddingHorizontal: SPACING.md, borderWidth: 1, borderColor: COLORS.border, borderRadius: BORDER_RADIUS.sm, marginBottom: 6 },
    radioSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '20' },
    pill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, marginRight: 8, backgroundColor: COLORS.surface },
    pillSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
    submitBtn: { backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.md, paddingVertical: SPACING.lg, alignItems: 'center', marginTop: SPACING.md },
    submitBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
});

export default HabitTracker;
