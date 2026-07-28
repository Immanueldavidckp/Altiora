import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Alert, Switch, KeyboardAvoidingView, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, BORDER_RADIUS, SPACING } from '../theme/colors';
import { 
    getTasksList, addTaskItem, toggleTaskCompletion, deleteTaskItem,
    getTaskSubtasks, addTaskSubtask, toggleTaskSubtask, deleteTaskSubtask,
    getTaskDocuments, addTaskDocument, deleteTaskDocument,
    getTaskLearnings, deleteTaskLearning, addTaskLearning,
    getTaskComments, addTaskComment, deleteTaskComment,
    getTaskDailyLogs, updateTaskCalendarIds
} from '../db/database';
import { syncTaskToCalendar, deleteTaskFromCalendar } from '../utils/calendar';

// Helper component for inline additions
const QuickAddInput = ({ placeholder, onAdd }) => {
    const [text, setText] = useState('');
    return (
        <View style={s.quickAddContainer}>
            <TextInput 
                style={s.quickAddInput} 
                value={text} 
                onChangeText={setText} 
                placeholder={placeholder}
                placeholderTextColor={COLORS.textMuted}
            />
            <TouchableOpacity 
                style={[s.quickAddBtn, !text.trim() && {opacity: 0.5}]} 
                onPress={() => {
                    if (text.trim()) {
                        onAdd(text.trim());
                        setText('');
                    }
                }}
                disabled={!text.trim()}
            >
                <Ionicons name="send" size={16} color="#FFF" />
            </TouchableOpacity>
        </View>
    );
};

// DETAILS SCREEN
const TaskDetails = ({ task, onBack, onCompleteToggle, onSubtaskPress, onAddSubtask, refreshTrigger, onDeleteTask }) => {
    const [subtasks, setSubtasks] = useState([]);
    const [docs, setDocs] = useState([]);
    const [learnings, setLearnings] = useState([]);
    const [comments, setComments] = useState([]);
    const [dailyLogs, setDailyLogs] = useState([]);

    // Doc Modal
    const [docModalVisible, setDocModalVisible] = useState(false);
    const [docTitle, setDocTitle] = useState('');
    const [docContent, setDocContent] = useState('');

    const loadData = async () => {
        setSubtasks(await getTaskSubtasks(task.id));
        setDocs(await getTaskDocuments(task.id));
        setLearnings(await getTaskLearnings(task.id));
        setComments(await getTaskComments(task.id));
        setDailyLogs(await getTaskDailyLogs(task.name));
    };

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [task, refreshTrigger])
    );

    // Handlers
    const handleAddDoc = async () => {
        if (!docTitle.trim()) return;
        await addTaskDocument(task.id, docTitle.trim(), docContent.trim());
        setDocModalVisible(false);
        setDocTitle('');
        setDocContent('');
        loadData();
    };

    const handleDelete = (type, id) => {
        Alert.alert('Delete', 'Delete this item?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: async () => {
                if (type === 'sub') await deleteTaskSubtask(id);
                if (type === 'doc') await deleteTaskDocument(id);
                if (type === 'lrn') await deleteTaskLearning(id);
                if (type === 'com') await deleteTaskComment(id);
                loadData();
            }}
        ]);
    };

    return (
        <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={s.header}>
                <TouchableOpacity onPress={onBack} style={s.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <Text style={[s.title, task.is_completed && {textDecorationLine: 'line-through', color: COLORS.textMuted}]} numberOfLines={1}>{task.name}</Text>
                
                <View style={{flexDirection: 'row', alignItems: 'center'}}>
                    <TouchableOpacity onPress={() => onDeleteTask(task)} style={{marginRight: 16}}>
                        <Ionicons name="trash-outline" size={24} color={COLORS.textMuted} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => onCompleteToggle(task)}>
                        <Ionicons name={task.is_completed ? "checkmark-circle" : "ellipse-outline"} size={28} color={task.is_completed ? COLORS.accentGreen : COLORS.textMuted} />
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView style={s.detailsList} contentContainerStyle={{ paddingBottom: 100 }}>
                {/* Meta Details */}
                <View style={s.metaCard}>
                    <View style={s.metaRow}><Ionicons name="calendar-outline" size={16} color={COLORS.primary}/><Text style={s.metaText}>{task.start_date} {task.end_date ? `➡️ ${task.end_date}` : ''}</Text></View>
                    <View style={s.metaRow}><Ionicons name="flag-outline" size={16} color={COLORS.primary}/><Text style={s.metaText}>{task.task_type}</Text></View>
                    {task.reminder_time && <View style={s.metaRow}><Ionicons name="notifications-outline" size={16} color={COLORS.primary}/><Text style={s.metaText}>Remind at {task.reminder_time} ({task.repeat_type})</Text></View>}
                </View>

                {/* Subtasks */}
                <View style={[s.sectionHeader, {marginTop: SPACING.sm}]}>
                    <Text style={[s.sectionTitle, {marginTop: 0, marginBottom: 0}]}>Subtasks</Text>
                    <TouchableOpacity onPress={() => onAddSubtask(task.id)}><Ionicons name="add-circle" size={24} color={COLORS.primary}/></TouchableOpacity>
                </View>
                {subtasks.map(sub => (
                    <TouchableOpacity key={sub.id} style={s.subCard} onPress={() => onSubtaskPress(sub)} onLongPress={() => handleDelete('sub', sub.id)}>
                        <TouchableOpacity style={{marginRight: 10}} onPress={async () => { await toggleTaskSubtask(sub.id, sub.is_completed); loadData(); }}>
                            <Ionicons name={sub.is_completed ? "checkbox" : "square-outline"} size={22} color={sub.is_completed ? COLORS.accentGreen : COLORS.textSecondary} />
                        </TouchableOpacity>
                        <Text style={[s.subText, sub.is_completed && s.subTextDone]}>{sub.name}</Text>
                        <Ionicons name="chevron-forward" size={18} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                ))}
                {subtasks.length === 0 && <Text style={s.emptyHint}>No subtasks attached.</Text>}

                {/* Daily Logs */}
                <View style={[s.sectionHeader, {marginTop: SPACING.xl}]}>
                    <Text style={[s.sectionTitle, {marginTop: 0, marginBottom: 0}]}>Daily Logs ({task.name})</Text>
                </View>
                {dailyLogs.map(log => {
                    let previewText = log.content || '';
                    try {
                        const parsed = JSON.parse(log.content);
                        if (parsed[task.name]) {
                            previewText = parsed[task.name];
                        } else {
                            const entries = Object.entries(parsed).filter(([k,v]) => k.toLowerCase().includes(task.name.toLowerCase()) || v.toLowerCase().includes(task.name.toLowerCase()));
                            if (entries.length > 0) previewText = entries.map(([k,v]) => v).join(' • ');
                            else previewText = 'Mentioned in log.';
                        }
                    } catch {}
                    
                    return (
                        <View key={log.id} style={s.docCard}>
                            <Ionicons name="calendar-outline" size={24} color={COLORS.primary} style={{marginRight: 12}} />
                            <View style={{flex: 1}}>
                                <Text style={s.docTitle}>{log.name}</Text>
                                {previewText ? <Text style={s.docSub} numberOfLines={3}>{previewText}</Text> : null}
                            </View>
                        </View>
                    );
                })}
                {dailyLogs.length === 0 && <Text style={s.emptyHint}>No daily logs mention this task.</Text>}

                {/* Documents */}
                <View style={[s.sectionHeader, {marginTop: SPACING.xl}]}>
                    <Text style={[s.sectionTitle, {marginTop: 0}]}>Documents</Text>
                    <TouchableOpacity onPress={() => setDocModalVisible(true)}><Ionicons name="add-circle" size={24} color={COLORS.primary}/></TouchableOpacity>
                </View>
                {docs.map(doc => (
                    <TouchableOpacity key={doc.id} style={s.docCard} onLongPress={() => handleDelete('doc', doc.id)}>
                        <Ionicons name="document-text" size={24} color={COLORS.primary} style={{marginRight: 12}} />
                        <View style={{flex: 1}}>
                            <Text style={s.docTitle}>{doc.title}</Text>
                            {doc.content ? <Text style={s.docSub} numberOfLines={2}>{doc.content}</Text> : null}
                        </View>
                    </TouchableOpacity>
                ))}
                {docs.length === 0 && <Text style={s.emptyHint}>No documents attached.</Text>}

                {/* Learnings */}
                <Text style={[s.sectionTitle, {marginTop: SPACING.xl}]}>Learnings</Text>
                {learnings.map(lrn => (
                    <TouchableOpacity key={lrn.id} style={s.textCard} onLongPress={() => handleDelete('lrn', lrn.id)}>
                        <Text style={s.textContent}>💡 {lrn.content}</Text>
                    </TouchableOpacity>
                ))}
                <QuickAddInput placeholder="What did you learn?" onAdd={async (v) => { await addTaskLearning(task.id, v); loadData(); }} />

                {/* Comments */}
                <Text style={[s.sectionTitle, {marginTop: SPACING.xl}]}>Comments</Text>
                {comments.map(com => (
                    <TouchableOpacity key={com.id} style={s.textCard} onLongPress={() => handleDelete('com', com.id)}>
                        <Text style={s.textContent}>💬 {com.content}</Text>
                    </TouchableOpacity>
                ))}
                <QuickAddInput placeholder="Add a comment or command..." onAdd={async (v) => { await addTaskComment(task.id, v); loadData(); }} />
            </ScrollView>

            {/* Doc Modal */}
            <Modal visible={docModalVisible} animationType="slide" transparent>
                <View style={s.modalOverlay}>
                    <View style={s.modalContent}>
                        <View style={s.modalHeader}>
                            <Text style={s.modalTitle}>Add Document</Text>
                            <TouchableOpacity onPress={() => setDocModalVisible(false)}>
                                <Ionicons name="close-circle" size={28} color={COLORS.textSecondary} />
                            </TouchableOpacity>
                        </View>
                        <TextInput style={s.input} value={docTitle} onChangeText={setDocTitle} placeholder="Document Title" placeholderTextColor={COLORS.textMuted} />
                        <TextInput style={[s.input, {minHeight: 120, textAlignVertical: 'top'}]} value={docContent} onChangeText={setDocContent} placeholder="Content or URL" placeholderTextColor={COLORS.textMuted} multiline />
                        <TouchableOpacity style={s.submitBtn} onPress={handleAddDoc}><Text style={s.submitBtnText}>Save Document</Text></TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </KeyboardAvoidingView>
    );
};

// MAIN SCREEN
export default function TasksScreen() {
    const [tasks, setTasks] = useState([]);
    const [taskStack, setTaskStack] = useState([]);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [parentTaskId, setParentTaskId] = useState(null);
    const [modalVisible, setModalVisible] = useState(false);

    const activeTask = taskStack.length > 0 ? taskStack[taskStack.length - 1] : null;

    // Form states
    const [name, setName] = useState('');
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState('');
    const [taskType, setTaskType] = useState('Home');
    const [hasReminder, setHasReminder] = useState(false);
    const [reminderTime, setReminderTime] = useState('09:00');
    const [repeatType, setRepeatType] = useState('Everyday');

    const types = ['Office', 'Home', 'Travel'];
    const frequencies = ['Everyday', 'Weekly', 'Monthly', 'Once'];

    const loadTasks = async () => setTasks(await getTasksList());
    
    useFocusEffect(
        useCallback(() => {
            loadTasks();
        }, [])
    );

    const resetForm = () => {
        setName(''); setStartDate(new Date().toISOString().split('T')[0]); setEndDate('');
        setTaskType('Home'); setHasReminder(false); setReminderTime('09:00'); setRepeatType('Everyday');
    };

    const handleCreateTask = async () => {
        if (!name.trim() || !startDate.trim()) return Alert.alert('Error', 'Name and Start Date required');
        try {
            const taskObj = {
                name: name.trim(), start_date: startDate.trim(), end_date: endDate.trim() || null,
                task_type: taskType, reminder_time: hasReminder ? reminderTime : null, repeat_type: hasReminder ? repeatType : null,
                parent_task_id: parentTaskId
            };
            const taskId = await addTaskItem(taskObj);

            // Sync to device calendar
            try {
                const eventId = await syncTaskToCalendar({ ...taskObj, id: taskId });
                if (eventId) {
                    await updateTaskCalendarIds(taskId, eventId, null);
                }
            } catch (calErr) {
                console.error('[Calendar] Error syncing created task:', calErr);
            }

            setModalVisible(false);
            resetForm();
            loadTasks();
            setRefreshTrigger(prev => prev + 1);
        } catch (e) { Alert.alert('Error', 'Failed to create task'); }
    };

    const handleToggleTask = async (task) => {
        await toggleTaskCompletion(task.id, task.is_completed);
        
        // Sync updated state to calendar
        try {
            const updatedTask = {
                ...task,
                is_completed: task.is_completed ? 0 : 1
            };
            if (updatedTask.calendar_event_id) {
                const updatedName = updatedTask.is_completed 
                    ? `✓ [Completed] ${updatedTask.name}` 
                    : updatedTask.name.replace(/^✓ \[Completed\] /, '');
                
                await syncTaskToCalendar({
                    ...updatedTask,
                    name: updatedName
                });
            }
        } catch (calErr) {
            console.error('[Calendar] Error updating completion status in calendar:', calErr);
        }

        loadTasks();
        if (activeTask && activeTask.id === task.id) {
            const newStack = [...taskStack];
            newStack[newStack.length - 1] = {...activeTask, is_completed: task.is_completed ? 0 : 1};
            setTaskStack(newStack);
        }
    };

    return (
        <View style={{flex: 1}}>
            {activeTask ? (
                <TaskDetails 
                    task={activeTask} 
                    onBack={() => {
                        const newStack = [...taskStack];
                        newStack.pop();
                        setTaskStack(newStack);
                        loadTasks();
                    }} 
                    onCompleteToggle={handleToggleTask}
                    onSubtaskPress={(sub) => setTaskStack([...taskStack, sub])}
                    onAddSubtask={(pid) => {
                        setParentTaskId(pid);
                        resetForm();
                        setModalVisible(true);
                    }}
                    refreshTrigger={refreshTrigger}
                    onDeleteTask={(t) => {
                        Alert.alert('Delete Task', `Are you sure you want to delete "${t.name}"?`, [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Delete', style: 'destructive', onPress: async () => {
                                await deleteTaskItem(t.id, t.linked_habit_id);
                                if (t.calendar_event_id) {
                                    await deleteTaskFromCalendar(t.calendar_event_id);
                                }
                                const newStack = [...taskStack];
                                newStack.pop();
                                setTaskStack(newStack);
                                loadTasks();
                            }}
                        ]);
                    }}
                />
            ) : (
                <View style={s.container}>
            <View style={s.mainHeader}><Text style={s.mainTitle}>My Tasks</Text></View>
            <ScrollView style={s.list} contentContainerStyle={{ paddingBottom: 100 }}>
                {tasks.length === 0 ? (
                    <View style={s.emptyState}><Ionicons name="checkbox-outline" size={48} color={COLORS.textMuted} /><Text style={s.emptyText}>No tasks found.</Text></View>
                ) : (
                    tasks.map(t => (
                        <TouchableOpacity key={t.id} style={[s.card, t.is_completed && s.cardCompleted]} onPress={() => setTaskStack([t])} onLongPress={() => {
                            Alert.alert('Delete', 'Delete task?', [
                                {text:'Cancel',style:'cancel'}, 
                                {text:'Delete',style:'destructive',onPress:async()=>{
                                    await deleteTaskItem(t.id, t.linked_habit_id); 
                                    if (t.calendar_event_id) {
                                        await deleteTaskFromCalendar(t.calendar_event_id);
                                    }
                                    loadTasks();
                                }}
                            ]);
                        }}>
                            <View style={s.cardBody}>
                                <TouchableOpacity style={s.checkboxContainer} onPress={() => handleToggleTask(t)}>
                                    <Ionicons name={t.is_completed ? "checkmark-circle" : "ellipse-outline"} size={26} color={t.is_completed ? COLORS.accentGreen : COLORS.textMuted} />
                                </TouchableOpacity>
                                <View style={s.taskInfo}>
                                    <Text style={[s.taskName, t.is_completed && s.taskNameCompleted]}>{t.name}</Text>
                                    <View style={s.taskMetaRow}>
                                        <Text style={s.taskTypeBadge}>{t.task_type}</Text>
                                        <Text style={s.taskDate}>{t.start_date}</Text>
                                    </View>
                                </View>
                            </View>
                        </TouchableOpacity>
                    ))
                )}
            </ScrollView>
                </View>
            )}

            {!activeTask && (
                <TouchableOpacity style={s.fab} onPress={() => { setParentTaskId(null); resetForm(); setModalVisible(true); }}><Ionicons name="add" size={28} color="#FFF" /></TouchableOpacity>
            )}

            <Modal visible={modalVisible} animationType="slide" transparent>
                <View style={s.modalOverlay}>
                    <View style={s.modalContent}>
                        <View style={s.modalHeader}><Text style={s.modalTitle}>New Task</Text><TouchableOpacity onPress={() => setModalVisible(false)}><Ionicons name="close-circle" size={28} color={COLORS.textSecondary} /></TouchableOpacity></View>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            <Text style={s.inputLabel}>Task Name *</Text>
                            <TextInput style={s.input} value={name} onChangeText={setName} placeholderTextColor={COLORS.textMuted} />
                            <View style={s.row}><View style={s.halfInput}><Text style={s.inputLabel}>Start Date</Text><TextInput style={s.input} value={startDate} onChangeText={setStartDate} /></View><View style={s.halfInput}><Text style={s.inputLabel}>End Date</Text><TextInput style={s.input} value={endDate} onChangeText={setEndDate} placeholder="Optional" /></View></View>
                            <Text style={s.inputLabel}>Type</Text>
                            <View style={s.pickerRowGrid}>{types.map(t => <TouchableOpacity key={t} style={[s.pickerItem, taskType === t && s.pickerItemActive]} onPress={() => setTaskType(t)}><Text style={[s.pickerText, taskType === t && s.pickerTextActive]}>{t}</Text></TouchableOpacity>)}</View>
                            <View style={s.reminderToggleContainer}><Text style={s.reminderToggleLabel}>Reminder (Links Habit)</Text><Switch value={hasReminder} onValueChange={setHasReminder} trackColor={{ false: COLORS.surfaceHighlight, true: COLORS.primary }}/></View>
                            {hasReminder && (<View style={s.reminderSection}><Text style={s.inputLabel}>Time</Text><TextInput style={s.input} value={reminderTime} onChangeText={setReminderTime}/><Text style={s.inputLabel}>Frequency</Text><View style={s.pickerRowGrid}>{frequencies.map(f => (<TouchableOpacity key={f} style={[s.pickerItem, repeatType === f && s.pickerItemActive, {marginBottom:8}]} onPress={() => setRepeatType(f)}><Text style={[s.pickerText, repeatType === f && s.pickerTextActive]}>{f}</Text></TouchableOpacity>))}</View></View>)}
                            <TouchableOpacity style={s.submitBtn} onPress={handleCreateTask}><Text style={s.submitBtnText}>Save Task</Text></TouchableOpacity><View style={{height:40}}/>
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    mainHeader: { padding: SPACING.lg, minHeight: 60, justifyContent: 'center' },
    mainTitle: { fontSize: 24, fontWeight: '800', color: COLORS.textPrimary },
    list: { flex: 1, paddingHorizontal: SPACING.lg },
    emptyState: { alignItems: 'center', marginTop: 100 },
    emptyText: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary, marginTop: 16 },
    card: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
    cardCompleted: { opacity: 0.6 },
    cardBody: { padding: SPACING.lg, flexDirection: 'row', alignItems: 'center' },
    checkboxContainer: { marginRight: SPACING.md },
    taskInfo: { flex: 1 },
    taskName: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 6 },
    taskNameCompleted: { textDecorationLine: 'line-through', color: COLORS.textSecondary },
    taskMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    taskTypeBadge: { fontSize: 10, fontWeight: '700', color: COLORS.background, backgroundColor: COLORS.textSecondary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    taskDate: { fontSize: 12, color: COLORS.textSecondary },
    fab: { position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', elevation: 8 },
    
    // Details specifics
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: SPACING.lg },
    backBtn: { padding: SPACING.sm, marginLeft: -SPACING.sm },
    title: { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary, flex: 1, marginHorizontal: SPACING.md },
    detailsList: { flex: 1, paddingHorizontal: SPACING.lg },
    metaCard: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, gap: 8, marginBottom: SPACING.lg },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    metaText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: SPACING.lg, marginBottom: SPACING.sm },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary, marginTop: SPACING.lg, marginBottom: SPACING.sm },
    subCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surfaceHighlight, padding: SPACING.md, borderRadius: BORDER_RADIUS.sm, marginBottom: 8 },
    subText: { flex: 1, marginLeft: 10, color: COLORS.textPrimary, fontSize: 14 },
    subTextDone: { textDecorationLine: 'line-through', color: COLORS.textMuted },
    quickAddContainer: { flexDirection: 'row', gap: 8, marginTop: 4 },
    quickAddInput: { flex: 1, backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.sm, paddingHorizontal: SPACING.md, height: 40, color: COLORS.textPrimary, borderWidth: 1, borderColor: COLORS.border },
    quickAddBtn: { width: 40, height: 40, backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.sm, justifyContent: 'center', alignItems: 'center' },
    docCard: { backgroundColor: COLORS.surfaceHighlight, padding: SPACING.md, borderRadius: BORDER_RADIUS.md, marginBottom: 8, flexDirection: 'row', alignItems: 'center' },
    docTitle: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary },
    docSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 4 },
    textCard: { backgroundColor: COLORS.surfaceHighlight, padding: SPACING.md, borderRadius: BORDER_RADIUS.md, marginBottom: 8 },
    textContent: { color: COLORS.textPrimary, fontSize: 14, lineHeight: 20 },
    emptyHint: { color: COLORS.textMuted, fontSize: 13, fontStyle: 'italic', marginBottom: 8 },

    // Modals
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: COLORS.background, borderTopLeftRadius: BORDER_RADIUS.xxl, borderTopRightRadius: BORDER_RADIUS.xxl, padding: SPACING.xxl, maxHeight: '90%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xl },
    modalTitle: { fontSize: 22, fontWeight: '800', color: COLORS.textPrimary },
    inputLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, marginBottom: SPACING.sm, marginTop: SPACING.md },
    input: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md, padding: SPACING.lg, color: COLORS.textPrimary, fontSize: 16, borderWidth: 1, borderColor: COLORS.border },
    row: { flexDirection: 'row', gap: 12 }, halfInput: { flex: 1 },
    pickerRowGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
    pickerItem: { flex: 1, minWidth: '30%', alignItems: 'center', paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.md, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.surface },
    pickerItemActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '20' },
    pickerText: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
    pickerTextActive: { color: COLORS.primary },
    reminderToggleContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.surfaceHighlight, padding: SPACING.lg, borderRadius: BORDER_RADIUS.md, marginTop: SPACING.xl },
    reminderToggleLabel: { fontSize: 15, fontWeight: '600', color: COLORS.textPrimary },
    reminderSection: { marginTop: SPACING.sm, padding: SPACING.md, backgroundColor: COLORS.surface+ '80', borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
    submitBtn: { backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.md, paddingVertical: SPACING.lg, alignItems: 'center', marginTop: SPACING.xxl },
    submitBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
});
