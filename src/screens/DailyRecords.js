import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, BORDER_RADIUS, SPACING } from '../theme/colors';
import { getNotebooks, addNotebook, deleteNotebook, getSessions, addSession, updateSessionContent, deleteSession, getIncompleteTasksForDailyLog, getHabits } from '../db/database';
import { formatDate } from '../utils/helpers';

export default function DailyRecords() {
    const [notebooks, setNotebooks] = useState([]);
    const [activeNotebook, setActiveNotebook] = useState(null);
    
    const [sessions, setSessions] = useState([]);
    const [activeSession, setActiveSession] = useState(null);

    // Modals
    const [nbModalVisible, setNbModalVisible] = useState(false);
    const [newNbName, setNewNbName] = useState('');
    
    const [sessionModalVisible, setSessionModalVisible] = useState(false);
    const [newSessionName, setNewSessionName] = useState('');

    const loadNotebooks = async () => {
        try {
            const data = await getNotebooks();
            setNotebooks(data);
        } catch (e) {
            console.error(e);
        }
    };

    const loadSessions = async (nbId) => {
        try {
            const data = await getSessions(nbId);
            setSessions(data);
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        loadNotebooks();
    }, []);

    // NOTEBOOK CRUD
    const handleAddNotebook = async () => {
        if (!newNbName.trim()) {
            setNbModalVisible(false);
            return;
        }
        try {
            await addNotebook(newNbName.trim());
            setNbModalVisible(false);
            setNewNbName('');
            loadNotebooks();
        } catch (e) {
            Alert.alert('Error', 'Failed to create notebook');
        }
    };

    const handleDeleteNotebook = (nb) => {
        Alert.alert('Delete Notebook', `Are you sure you want to delete "${nb.name}"? This will delete all notes inside it.`, [
            { text: 'Cancel', style: 'cancel' },
            { 
                text: 'Delete', 
                style: 'destructive', 
                onPress: async () => {
                    await deleteNotebook(nb.id);
                    loadNotebooks();
                }
            }
        ]);
    };

    // SESSION CRUD
    const handleFabSession = async () => {
        if (activeNotebook.is_daily_log) {
            // Auto generate daily session
            const dateStr = formatDate(new Date().toISOString().split('T')[0]);
            
            const existing = sessions.find(s => s.name === dateStr);
            if (existing) {
                setActiveSession(existing);
                return;
            }

            try {
                const id = await addSession(activeNotebook.id, dateStr);
                const newlyCreated = { id, notebook_id: activeNotebook.id, name: dateStr, content: '' };
                loadSessions(activeNotebook.id);
                setActiveSession(newlyCreated);
            } catch (e) {
                console.error(e);
            }
        } else {
            setNewSessionName('');
            setSessionModalVisible(true);
        }
    };

    const handleAddSession = async () => {
        if (!newSessionName.trim()) {
            setSessionModalVisible(false);
            return;
        }
        try {
            const id = await addSession(activeNotebook.id, newSessionName.trim());
            const newlyCreated = { id, notebook_id: activeNotebook.id, name: newSessionName.trim(), content: '' };
            setSessionModalVisible(false);
            loadSessions(activeNotebook.id);
            setActiveSession(newlyCreated);
        } catch (e) {
            Alert.alert('Error', 'Failed to create note');
        }
    };

    const handleDeleteSession = (session) => {
        Alert.alert('Delete Note', `Are you sure you want to delete "${session.name}"?`, [
            { text: 'Cancel', style: 'cancel' },
            { 
                text: 'Delete', 
                style: 'destructive', 
                onPress: async () => {
                    await deleteSession(session.id);
                    loadSessions(activeNotebook.id);
                }
            }
        ]);
    };

    // ------ VIEWS ------

    if (activeSession) {
        if (activeNotebook && activeNotebook.is_daily_log === 1) {
            return <DailyLogEditor 
                session={activeSession} 
                onBack={() => {
                    setActiveSession(null);
                    loadSessions(activeNotebook.id);
                }} 
            />;
        } else {
            return <StandardEditor 
                session={activeSession} 
                onBack={() => {
                    setActiveSession(null);
                    loadSessions(activeNotebook.id);
                }} 
            />;
        }
    }

    if (activeNotebook) {
        return (
            <View style={s.container}>
                <View style={s.header}>
                    <TouchableOpacity onPress={() => setActiveNotebook(null)} style={s.backBtn}>
                        <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
                    </TouchableOpacity>
                    <Text style={s.title}>{activeNotebook.name}</Text>
                    <View style={{ width: 40 }} />
                </View>

                <ScrollView style={s.list} contentContainerStyle={{ paddingBottom: 100 }}>
                    {sessions.length === 0 ? (
                        <View style={s.emptyState}>
                            <Ionicons name="document-text-outline" size={48} color={COLORS.textMuted} />
                            <Text style={s.emptyText}>No notes here yet.</Text>
                            <Text style={s.emptySub}>Tap + to start writing.</Text>
                        </View>
                    ) : (
                        sessions.map(sess => (
                            <TouchableOpacity 
                                key={sess.id} 
                                style={s.card} 
                                onPress={() => setActiveSession(sess)}
                                onLongPress={() => handleDeleteSession(sess)}
                                delayLongPress={400}
                            >
                                <View style={s.cardBody}>
                                    <View>
                                        <Text style={s.cardTitle}>{sess.name}</Text>
                                        <Text style={s.cardSub} numberOfLines={2}>
                                            {(() => {
                                                if (!sess.content) return 'Empty note';
                                                try {
                                                    const parsed = JSON.parse(sess.content);
                                                    const keys = Object.keys(parsed);
                                                    if (keys.length === 0) return 'Empty note';
                                                    return Object.values(parsed).join(' • ').replace(/\n/g, ' ').substring(0, 100);
                                                } catch {
                                                    return sess.content.substring(0, 100).replace(/\n/g, ' ');
                                                }
                                            })()}
                                        </Text>
                                    </View>
                                    <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
                                </View>
                            </TouchableOpacity>
                        ))
                    )}
                </ScrollView>

                <TouchableOpacity style={s.fab} onPress={handleFabSession}>
                    <Ionicons name="add" size={28} color="#FFF" />
                </TouchableOpacity>

                {/* Session Modal */}
                <Modal visible={sessionModalVisible} animationType="slide" transparent>
                    <View style={s.modalOverlay}>
                        <View style={s.modalContent}>
                            <Text style={s.modalTitle}>New Note</Text>
                            <TextInput 
                                style={s.input} 
                                value={newSessionName} 
                                onChangeText={setNewSessionName} 
                                placeholder="Name of your note..." 
                                placeholderTextColor={COLORS.textMuted}
                                autoFocus
                                onSubmitEditing={handleAddSession}
                            />
                            <View style={s.modalBtns}>
                                <TouchableOpacity style={[s.modalBtn, s.btnCancel]} onPress={() => setSessionModalVisible(false)}>
                                    <Text style={s.btnTextCancel}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[s.modalBtn, s.btnSubmit]} onPress={handleAddSession}>
                                    <Text style={s.btnTextSubmit}>Create</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>
            </View>
        );
    }

    return (
        <View style={s.container}>
            <View style={s.header}>
                <Text style={[s.title, { marginLeft: SPACING.md }]}>Notebooks</Text>
            </View>

            <ScrollView style={s.list} contentContainerStyle={{ paddingBottom: 100 }}>
                {notebooks.map(nb => (
                    <TouchableOpacity 
                        key={nb.id} 
                        style={s.card}
                        onPress={() => {
                            setActiveNotebook(nb);
                            loadSessions(nb.id);
                        }}
                        onLongPress={() => !nb.is_daily_log && handleDeleteNotebook(nb)}
                        delayLongPress={400}
                    >
                        <View style={s.cardBody}>
                            <View style={{flexDirection: 'row', alignItems: 'center'}}>
                                <Text style={{fontSize: 24, marginRight: 12}}>{nb.is_daily_log ? '📅' : '📓'}</Text>
                                <Text style={s.cardTitle}>{nb.name}</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
                        </View>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            <TouchableOpacity style={s.fab} onPress={() => { setNewNbName(''); setNbModalVisible(true); }}>
                <Ionicons name="add" size={28} color="#FFF" />
            </TouchableOpacity>

            {/* Notebook Modal */}
            <Modal visible={nbModalVisible} animationType="slide" transparent>
                <View style={s.modalOverlay}>
                    <View style={s.modalContent}>
                        <Text style={s.modalTitle}>New Notebook</Text>
                        <TextInput 
                            style={s.input} 
                            value={newNbName} 
                            onChangeText={setNewNbName} 
                            placeholder="Name your notebook..." 
                            placeholderTextColor={COLORS.textMuted}
                            autoFocus
                            onSubmitEditing={handleAddNotebook}
                        />
                        <View style={s.modalBtns}>
                            <TouchableOpacity style={[s.modalBtn, s.btnCancel]} onPress={() => setNbModalVisible(false)}>
                                <Text style={s.btnTextCancel}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[s.modalBtn, s.btnSubmit]} onPress={handleAddNotebook}>
                                <Text style={s.btnTextSubmit}>Create</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

// EDITOR COMPONENT (DAILY LOGS)
const DailyLogEditor = ({ session, onBack }) => {
    const [sectionsData, setSectionsData] = useState(() => {
        try {
            const parsed = JSON.parse(session.content || '{}');
            return typeof parsed === 'object' && parsed !== null ? parsed : {};
        } catch {
            return session.content ? { 'General Notes': session.content } : {};
        }
    });

    const [tasks, setTasks] = useState([]);
    const [habits, setHabits] = useState([]);
    const [expanded, setExpanded] = useState({'General Notes': true});
    const saveTimeout = useRef(null);

    useEffect(() => {
        const loadRefs = async () => {
            setTasks(await getIncompleteTasksForDailyLog());
            setHabits(await getHabits());
        };
        loadRefs();
    }, []);

    const handleTextChange = (key, val) => {
        // Auto bullet format
        if (val && !val.startsWith('• ') && val.length > 0) {
            if (val.trim() === '•' || val.trim() === '') val = '';
            else val = '• ' + val;
        }
        val = val.replace(/\n([^•\n])/g, '\n• $1');

        setSectionsData(prev => ({...prev, [key]: val}));
    };

    const toggle = (key) => setExpanded(prev => ({...prev, [key]: !prev[key]}));

    // Save
    useEffect(() => {
        if (saveTimeout.current) clearTimeout(saveTimeout.current);
        saveTimeout.current = setTimeout(() => {
            // Cleanup empty sections to save space
            const toSave = {};
            for (const [k, v] of Object.entries(sectionsData)) {
                if (v && v.trim()) toSave[k] = v;
            }
            updateSessionContent(session.id, Object.keys(toSave).length > 0 ? JSON.stringify(toSave) : '');
        }, 800);
        
        return () => {
            if (saveTimeout.current) clearTimeout(saveTimeout.current);
        };
    }, [sectionsData]);

    const renderAccordion = (title, icon, color) => {
        const text = sectionsData[title] || '';
        const isExp = !!expanded[title];
        return (
            <View key={title} style={s.accordionCard}>
                <TouchableOpacity onPress={() => toggle(title)} style={s.accordionHeader}>
                    <View style={{flexDirection: 'row', alignItems: 'center', flex: 1}}>
                        <Ionicons name={icon} size={20} color={color} style={{marginRight: 10}}/>
                        <Text style={s.accordionTitle} numberOfLines={1}>{title}</Text>
                        {text.length > 0 && <View style={s.hasContentDot} />}
                    </View>
                    <Ionicons name={isExp ? 'chevron-up' : 'chevron-down'} size={20} color={COLORS.textMuted}/>
                </TouchableOpacity>
                {isExp && (
                    <View style={s.accordionBody}>
                        <TextInput 
                            style={s.accordionInput}
                            multiline
                            textAlignVertical="top"
                            placeholder={`Points for ${title}...`}
                            placeholderTextColor={COLORS.textMuted}
                            value={text}
                            onChangeText={(v) => handleTextChange(title, v)}
                        />
                    </View>
                )}
            </View>
        );
    };

    return (
        <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={s.header}>
                <TouchableOpacity onPress={onBack} style={s.backBtn}>
                    <Ionicons name="chevron-back" size={28} color={COLORS.primary} />
                </TouchableOpacity>
                <Text style={[s.title, {fontSize: 18, flex: 1}]} numberOfLines={1}>{session.name}</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{padding: SPACING.lg, paddingBottom: 100}}>
                {renderAccordion('General Notes', 'document-text', COLORS.textSecondary)}
                
                {tasks.length > 0 && <Text style={s.sectionDivider}>TASKS & SUBTASKS</Text>}
                {tasks.map(t => renderAccordion(t.displayName, 'checkbox', COLORS.primary))}

                {habits.length > 0 && <Text style={s.sectionDivider}>HABITS</Text>}
                {habits.map(h => renderAccordion(h.name, 'sync', COLORS.accentGreen))}
            </ScrollView>
        </KeyboardAvoidingView>
    );
};

// EDITOR COMPONENT (STANDARD NOTES)
const StandardEditor = ({ session, onBack }) => {
    const [sectionsData, setSectionsData] = useState(() => {
        try {
            const parsed = JSON.parse(session.content || '{}');
            if (typeof parsed === 'object' && parsed !== null && Object.keys(parsed).length > 0) return parsed;
        } catch {}
        // Migrate old plain-text content
        const plain = session.content || '';
        return plain.trim() ? { 'General Notes': plain } : { 'General Notes': '' };
    });
    const [expanded, setExpanded] = useState({ 'General Notes': true });
    const [tasks, setTasks] = useState([]);
    const [habits, setHabits] = useState([]);
    const [addMenuVisible, setAddMenuVisible] = useState(false);
    const [activeList, setActiveList] = useState(null); // 'tasks' or 'habits'
    const saveTimeout = useRef(null);

    useEffect(() => {
        const loadRefs = async () => {
            setTasks(await getIncompleteTasksForDailyLog());
            setHabits(await getHabits());
        };
        loadRefs();
    }, []);

    // Auto-save on change
    useEffect(() => {
        if (saveTimeout.current) clearTimeout(saveTimeout.current);
        saveTimeout.current = setTimeout(() => {
            const toSave = {};
            for (const [k, v] of Object.entries(sectionsData)) {
                if (v && v.trim()) toSave[k] = v;
            }
            updateSessionContent(session.id, Object.keys(toSave).length > 0 ? JSON.stringify(toSave) : '');
        }, 800);
        return () => { if (saveTimeout.current) clearTimeout(saveTimeout.current); };
    }, [sectionsData]);

    const handleTextChange = (key, val) => {
        setSectionsData(prev => ({ ...prev, [key]: val }));
    };

    const toggle = (key) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

    const addSection = (name) => {
        if (sectionsData.hasOwnProperty(name)) {
            // Already exists — just expand it
            setExpanded(prev => ({ ...prev, [name]: true }));
        } else {
            setSectionsData(prev => ({ ...prev, [name]: '' }));
            setExpanded(prev => ({ ...prev, [name]: true }));
        }
    };

    const removeSection = (key) => {
        if (key === 'General Notes') return; // Can't remove the default
        setSectionsData(prev => {
            const copy = { ...prev };
            delete copy[key];
            return copy;
        });
    };

    const renderAccordion = (title, icon, color) => {
        const text = sectionsData[title] || '';
        const isExp = !!expanded[title];
        return (
            <View key={title} style={s.accordionCard}>
                <TouchableOpacity onPress={() => toggle(title)} style={s.accordionHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                        <Ionicons name={icon} size={18} color={color} style={{ marginRight: 10 }} />
                        <Text style={s.accordionTitle} numberOfLines={1}>{title}</Text>
                        {text.length > 0 && <View style={s.hasContentDot} />}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        {title !== 'General Notes' && (
                            <TouchableOpacity onPress={() => removeSection(title)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
                            </TouchableOpacity>
                        )}
                        <Ionicons name={isExp ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.textMuted} />
                    </View>
                </TouchableOpacity>
                {isExp && (
                    <View style={s.accordionBody}>
                        <TextInput
                            style={s.accordionInput}
                            multiline
                            textAlignVertical="top"
                            placeholder={`Write about ${title}...`}
                            placeholderTextColor={COLORS.textMuted}
                            value={text}
                            onChangeText={(v) => handleTextChange(title, v)}
                        />
                    </View>
                )}
            </View>
        );
    };

    return (
        <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={s.header}>
                <TouchableOpacity onPress={onBack} style={s.backBtn}>
                    <Ionicons name="chevron-back" size={28} color={COLORS.primary} />
                </TouchableOpacity>
                <Text style={[s.title, { fontSize: 18, flex: 1 }]} numberOfLines={1}>{session.name}</Text>
                <TouchableOpacity onPress={() => setAddMenuVisible(true)}>
                    <Ionicons name="add" size={32} color={COLORS.primary} />
                </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 100 }}>
                {Object.keys(sectionsData).map(title => {
                    const isTask = tasks.some(t => t.displayName === title);
                    const isHabit = habits.some(h => h.name === title);
                    const icon = isTask ? 'checkbox' : isHabit ? 'sync' : 'document-text';
                    const color = isTask ? COLORS.primary : isHabit ? COLORS.accentGreen : COLORS.textSecondary;
                    return renderAccordion(title, icon, color);
                })}
            </ScrollView>

            {/* Add Menu */}
            <Modal visible={addMenuVisible} transparent animationType="fade">
                <TouchableOpacity style={s.modalOverlay} onPress={() => setAddMenuVisible(false)} activeOpacity={1}>
                    <View style={[s.modalContent, { marginTop: 'auto', marginBottom: 0, paddingBottom: 40, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }]}>
                        <Text style={s.modalTitle}>Add Section</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 10 }}>
                            <TouchableOpacity style={s.addMenuItem} onPress={() => { setAddMenuVisible(false); Alert.alert('Gallery', 'Feature coming soon!'); }}>
                                <View style={[s.addIconBox, { backgroundColor: 'rgba(59, 130, 246, 0.1)' }]}><Ionicons name="image" size={24} color={COLORS.primary} /></View>
                                <Text style={s.addMenuText}>Image</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={s.addMenuItem} onPress={() => { setAddMenuVisible(false); Alert.alert('Stickers', 'Feature coming soon!'); }}>
                                <View style={[s.addIconBox, { backgroundColor: 'rgba(139, 92, 246, 0.1)' }]}><Ionicons name="happy" size={24} color={COLORS.accentPurple} /></View>
                                <Text style={s.addMenuText}>Sticker</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={s.addMenuItem} onPress={() => { setAddMenuVisible(false); setActiveList('tasks'); }}>
                                <View style={[s.addIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}><Ionicons name="checkbox" size={24} color={COLORS.accentGreen} /></View>
                                <Text style={s.addMenuText}>Task</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={s.addMenuItem} onPress={() => { setAddMenuVisible(false); setActiveList('habits'); }}>
                                <View style={[s.addIconBox, { backgroundColor: 'rgba(245, 158, 11, 0.1)' }]}><Ionicons name="sync" size={24} color={COLORS.accentYellow} /></View>
                                <Text style={s.addMenuText}>Habit</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </TouchableOpacity>
            </Modal>

            {/* Task / Habit picker */}
            <Modal visible={activeList !== null} transparent animationType="slide">
                <View style={s.modalOverlay}>
                    <View style={[s.modalContent, { maxHeight: '80%' }]}>
                        <View style={s.modalHeader}>
                            <Text style={s.modalTitle}>{activeList === 'tasks' ? 'Select Task' : 'Select Habit'}</Text>
                            <TouchableOpacity onPress={() => setActiveList(null)}><Ionicons name="close-circle" size={28} color={COLORS.textSecondary} /></TouchableOpacity>
                        </View>
                        <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 10 }}>
                            {activeList === 'tasks' && tasks.map(t => (
                                <TouchableOpacity key={t.id} style={s.listItem} onPress={() => { addSection(t.displayName); setActiveList(null); }}>
                                    <Ionicons name="checkbox-outline" size={20} color={COLORS.primary} style={{ marginRight: 10 }} />
                                    <Text style={s.listText}>{t.displayName}</Text>
                                    <Ionicons name="add" size={20} color={COLORS.textMuted} />
                                </TouchableOpacity>
                            ))}
                            {activeList === 'habits' && habits.map(h => (
                                <TouchableOpacity key={h.id} style={s.listItem} onPress={() => { addSection(h.name); setActiveList(null); }}>
                                    <Ionicons name="sync-outline" size={20} color={COLORS.accentGreen} style={{ marginRight: 10 }} />
                                    <Text style={s.listText}>{h.name}</Text>
                                    <Ionicons name="add" size={20} color={COLORS.textMuted} />
                                </TouchableOpacity>
                            ))}
                            {((activeList === 'tasks' && tasks.length === 0) || (activeList === 'habits' && habits.length === 0)) && (
                                <Text style={{ color: COLORS.textMuted, textAlign: 'center', marginVertical: 30 }}>No items found.</Text>
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </KeyboardAvoidingView>
    );
};

// STYLES
const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: SPACING.lg, minHeight: 60 },
    backBtn: { padding: SPACING.sm, marginLeft: -SPACING.sm },
    title: { fontSize: 22, fontWeight: '800', color: COLORS.textPrimary },
    list: { flex: 1, paddingHorizontal: SPACING.lg },
    
    card: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
    cardBody: { padding: SPACING.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardTitle: { fontSize: 17, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 4 },
    cardSub: { fontSize: 13, color: COLORS.textSecondary, maxWidth: '90%' },
    
    fab: { position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8 },
    
    emptyState: { alignItems: 'center', marginTop: 100 },
    emptyText: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary, marginTop: 16 },
    emptySub: { fontSize: 14, color: COLORS.textSecondary, marginTop: 8 },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: SPACING.xl },
    modalContent: { backgroundColor: COLORS.surfaceLight, borderRadius: BORDER_RADIUS.lg, padding: SPACING.xl, width: '100%', borderWidth: 1, borderColor: COLORS.borderLight },
    modalTitle: { fontSize: 18, fontWeight: '800', color: COLORS.textPrimary, marginBottom: SPACING.lg },
    input: { backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.sm, padding: SPACING.lg, color: COLORS.textPrimary, fontSize: 16, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.xl },
    modalBtns: { flexDirection: 'row', gap: SPACING.md },
    modalBtn: { flex: 1, paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.sm, alignItems: 'center', justifyContent: 'center' },
    btnCancel: { backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.border },
    btnSubmit: { backgroundColor: COLORS.primary },
    btnTextCancel: { color: COLORS.textSecondary, fontWeight: '600' },
    btnTextSubmit: { color: '#FFF', fontWeight: '700' },

    // Editor 
    sectionDivider: { fontSize: 11, fontWeight: '800', color: COLORS.textSecondary, letterSpacing: 1, marginTop: SPACING.xl, marginBottom: SPACING.sm, marginLeft: 4 },
    accordionCard: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
    accordionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: SPACING.md },
    accordionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary, flex: 1 },
    hasContentDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary, marginLeft: 8 },
    accordionBody: { padding: SPACING.md, paddingTop: 0, backgroundColor: COLORS.surface },
    accordionInput: { color: COLORS.textPrimary, fontSize: 15, lineHeight: 24, minHeight: 80 },

    // Standard Editor
    editorInput: { flex: 1, fontSize: 18, color: COLORS.textPrimary, padding: SPACING.lg, paddingTop: SPACING.xs, lineHeight: 28 },
    addMenuItem: { width: '48%', backgroundColor: COLORS.surfaceHighlight, padding: SPACING.lg, borderRadius: BORDER_RADIUS.md, alignItems: 'center', marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
    addIconBox: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    addMenuText: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
    listItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
    listText: { fontSize: 16, color: COLORS.textPrimary, flex: 1, fontWeight: '500' }
});
