import React, { useState, useCallback, useEffect } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
    Modal, Alert, RefreshControl
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, BORDER_RADIUS, SPACING, DAILY_VARIANTS } from '../theme/colors';
import { Card, EmptyState, SectionHeader, Badge } from '../components/Card';
import { getTodayKey, getRelativeDate, formatDate, formatDateKey } from '../utils/helpers';
import { addDailyRecord, getDailyRecords, deleteDailyRecord } from '../db/database';

const DailyRecords = () => {
    const [records, setRecords] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedDate, setSelectedDate] = useState(getTodayKey());
    const [selectedVariant, setSelectedVariant] = useState('morning');

    // Form
    const [taskDesc, setTaskDesc] = useState('');
    const [hoursSpent, setHoursSpent] = useState('');
    const [startTime, setStartTime] = useState('');
    const [endTime, setEndTime] = useState('');
    const [notes, setNotes] = useState('');
    const [formVariant, setFormVariant] = useState('morning');

    const loadData = useCallback(async () => {
        try {
            const data = await getDailyRecords(selectedDate);
            setRecords(data);
        } catch (err) {
            console.error('Error loading daily records:', err);
        }
    }, [selectedDate]);

    useEffect(() => { loadData(); }, [loadData]);

    const onRefresh = async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    };

    const handleSubmit = async () => {
        if (!taskDesc.trim()) {
            Alert.alert('Error', 'Please enter a task description');
            return;
        }
        try {
            await addDailyRecord({
                date: selectedDate,
                variant: formVariant,
                task_description: taskDesc.trim(),
                hours_spent: parseFloat(hoursSpent) || 0,
                start_time: startTime.trim(),
                end_time: endTime.trim(),
                notes: notes.trim(),
            });
            setShowModal(false);
            resetForm();
            loadData();
        } catch (err) {
            Alert.alert('Error', 'Failed to save record');
        }
    };

    const resetForm = () => {
        setTaskDesc('');
        setHoursSpent('');
        setStartTime('');
        setEndTime('');
        setNotes('');
    };

    const handleDelete = (id) => {
        Alert.alert('Delete', 'Delete this record?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: async () => { await deleteDailyRecord(id); loadData(); } },
        ]);
    };

    const navigateDate = (offset) => {
        const d = new Date(selectedDate);
        d.setDate(d.getDate() + offset);
        setSelectedDate(formatDateKey(d));
    };

    const getVariantInfo = (v) => DAILY_VARIANTS.find(d => d.id === v) || DAILY_VARIANTS[0];
    const groupedRecords = DAILY_VARIANTS.map(v => ({
        ...v,
        records: records.filter(r => r.variant === v.id),
        totalHours: records.filter(r => r.variant === v.id).reduce((sum, r) => sum + (r.hours_spent || 0), 0),
    }));

    const totalHoursDay = records.reduce((sum, r) => sum + (r.hours_spent || 0), 0);

    return (
        <View style={styles.container}>
            {/* Date Nav */}
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

            {/* Productivity Summary */}
            <View style={styles.productivityBar}>
                <Text style={styles.prodLabel}>Total Productive Hours</Text>
                <Text style={styles.prodValue}>{totalHoursDay.toFixed(1)}h</Text>
                <View style={styles.prodBarBg}>
                    <View style={[styles.prodBarFill, { width: `${Math.min(100, (totalHoursDay / 16) * 100)}%` }]} />
                </View>
            </View>

            {/* Variant Tabs */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll}>
                {DAILY_VARIANTS.map(v => (
                    <TouchableOpacity
                        key={v.id}
                        style={[styles.variantTab, selectedVariant === v.id && { backgroundColor: v.color + '25', borderColor: v.color }]}
                        onPress={() => setSelectedVariant(v.id)}
                    >
                        <Text style={styles.variantEmoji}>{v.emoji}</Text>
                        <Text style={[styles.variantLabel, selectedVariant === v.id && { color: v.color }]}>{v.label}</Text>
                        <Text style={[styles.variantHours, { color: v.color }]}>
                            {groupedRecords.find(g => g.id === v.id)?.totalHours.toFixed(1)}h
                        </Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            {/* Records */}
            <ScrollView
                style={styles.list}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
            >
                {(() => {
                    const currentGroup = groupedRecords.find(g => g.id === selectedVariant);
                    if (!currentGroup || currentGroup.records.length === 0) {
                        return <EmptyState title={`No ${selectedVariant} tasks`} subtitle="Tap + to record your activity" emoji={getVariantInfo(selectedVariant).emoji} />;
                    }
                    return currentGroup.records.map(rec => (
                        <Card key={rec.id} onPress={() => handleDelete(rec.id)}>
                            <View style={styles.recordRow}>
                                <View style={[styles.recDot, { backgroundColor: getVariantInfo(rec.variant).color }]} />
                                <View style={styles.recInfo}>
                                    <Text style={styles.recTask}>{rec.task_description}</Text>
                                    <View style={styles.recMetaRow}>
                                        {rec.start_time ? <Text style={styles.recTime}>{rec.start_time} - {rec.end_time || '...'}</Text> : null}
                                        {rec.notes ? <Text style={styles.recNotes} numberOfLines={1}>{rec.notes}</Text> : null}
                                    </View>
                                </View>
                                <View style={styles.recHoursBox}>
                                    <Text style={[styles.recHours, { color: getVariantInfo(rec.variant).color }]}>{rec.hours_spent}h</Text>
                                </View>
                            </View>
                        </Card>
                    ));
                })()}
                <View style={{ height: 100 }} />
            </ScrollView>

            {/* FAB */}
            <TouchableOpacity style={styles.fab} onPress={() => { setFormVariant(selectedVariant); setShowModal(true); }}>
                <Ionicons name="add" size={28} color="#FFF" />
            </TouchableOpacity>

            {/* Modal */}
            <Modal visible={showModal} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Add Daily Task</Text>
                            <TouchableOpacity onPress={() => { setShowModal(false); resetForm(); }}>
                                <Ionicons name="close-circle" size={28} color={COLORS.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false}>
                            {/* Variant Picker */}
                            <Text style={styles.inputLabel}>Time of Day</Text>
                            <View style={styles.variantPicker}>
                                {DAILY_VARIANTS.map(v => (
                                    <TouchableOpacity
                                        key={v.id}
                                        style={[styles.variantPickItem, formVariant === v.id && { backgroundColor: v.color + '25', borderColor: v.color }]}
                                        onPress={() => setFormVariant(v.id)}
                                    >
                                        <Text style={styles.vpEmoji}>{v.emoji}</Text>
                                        <Text style={[styles.vpLabel, formVariant === v.id && { color: v.color }]}>{v.label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <Text style={styles.inputLabel}>Task Description *</Text>
                            <TextInput
                                style={[styles.input, { minHeight: 80 }]}
                                value={taskDesc}
                                onChangeText={setTaskDesc}
                                placeholder="What did you do?"
                                placeholderTextColor={COLORS.textMuted}
                                multiline
                            />

                            <View style={styles.row}>
                                <View style={styles.halfInput}>
                                    <Text style={styles.inputLabel}>Start Time</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={startTime}
                                        onChangeText={setStartTime}
                                        placeholder="09:00"
                                        placeholderTextColor={COLORS.textMuted}
                                    />
                                </View>
                                <View style={styles.halfInput}>
                                    <Text style={styles.inputLabel}>End Time</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={endTime}
                                        onChangeText={setEndTime}
                                        placeholder="17:00"
                                        placeholderTextColor={COLORS.textMuted}
                                    />
                                </View>
                            </View>

                            <Text style={styles.inputLabel}>Hours Spent</Text>
                            <TextInput
                                style={styles.input}
                                value={hoursSpent}
                                onChangeText={setHoursSpent}
                                placeholder="e.g., 2.5"
                                placeholderTextColor={COLORS.textMuted}
                                keyboardType="decimal-pad"
                            />

                            <Text style={styles.inputLabel}>Notes</Text>
                            <TextInput
                                style={[styles.input, { minHeight: 60 }]}
                                value={notes}
                                onChangeText={setNotes}
                                placeholder="Additional notes..."
                                placeholderTextColor={COLORS.textMuted}
                                multiline
                            />

                            <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
                                <Text style={styles.submitBtnText}>Save Record</Text>
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
    productivityBar: {
        backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg,
        marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border,
    },
    prodLabel: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600' },
    prodValue: { fontSize: 28, fontWeight: '800', color: COLORS.accentGreen, marginVertical: 4 },
    prodBarBg: {
        height: 6, backgroundColor: COLORS.surfaceHighlight, borderRadius: 3, marginTop: 4, overflow: 'hidden',
    },
    prodBarFill: { height: '100%', backgroundColor: COLORS.accentGreen, borderRadius: 3 },
    tabScroll: { marginBottom: SPACING.md, maxHeight: 80 },
    variantTab: {
        backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md, paddingHorizontal: SPACING.lg,
        paddingVertical: SPACING.md, marginRight: SPACING.sm, alignItems: 'center',
        borderWidth: 1.5, borderColor: COLORS.border, minWidth: 85,
    },
    variantEmoji: { fontSize: 20 },
    variantLabel: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary, marginTop: 2 },
    variantHours: { fontSize: 14, fontWeight: '800', marginTop: 2 },
    list: { flex: 1 },
    recordRow: { flexDirection: 'row', alignItems: 'center' },
    recDot: { width: 10, height: 10, borderRadius: 5, marginRight: SPACING.md },
    recInfo: { flex: 1 },
    recTask: { fontSize: 15, fontWeight: '600', color: COLORS.textPrimary },
    recMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 8 },
    recTime: { fontSize: 12, color: COLORS.accent, fontWeight: '600' },
    recNotes: { fontSize: 12, color: COLORS.textSecondary, flex: 1 },
    recHoursBox: {
        backgroundColor: COLORS.surfaceHighlight, borderRadius: BORDER_RADIUS.sm,
        paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs,
    },
    recHours: { fontSize: 14, fontWeight: '800' },
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
    modalHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xl,
    },
    modalTitle: { fontSize: 22, fontWeight: '800', color: COLORS.textPrimary },
    inputLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, marginBottom: SPACING.sm, marginTop: SPACING.md },
    input: {
        backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md, padding: SPACING.lg,
        color: COLORS.textPrimary, fontSize: 16, borderWidth: 1, borderColor: COLORS.border, textAlignVertical: 'top',
    },
    row: { flexDirection: 'row', gap: 12 },
    halfInput: { flex: 1 },
    variantPicker: { flexDirection: 'row', gap: 8 },
    variantPickItem: {
        flex: 1, alignItems: 'center', paddingVertical: SPACING.md,
        borderRadius: BORDER_RADIUS.md, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.surface,
    },
    vpEmoji: { fontSize: 20 },
    vpLabel: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary, marginTop: 2 },
    submitBtn: {
        backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.md,
        paddingVertical: SPACING.lg, alignItems: 'center', marginTop: SPACING.xxl, marginBottom: SPACING.xxxl,
    },
    submitBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
});

export default DailyRecords;
