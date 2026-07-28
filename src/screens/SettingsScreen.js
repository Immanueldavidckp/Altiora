import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { COLORS, SPACING } from '../theme/colors';
import { getAllDataForBackup, restoreDataFromBackup, getUnsyncedTasks, updateTaskCalendarIds } from '../db/database';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { Download, Upload, Shield, Clock, FileText, Database, Calendar } from 'lucide-react-native';
import { requestCalendarPermissions, syncTaskToCalendar } from '../utils/calendar';

const SettingsScreen = () => {
    const [loading, setLoading] = useState(false);

    const handleExport = async () => {
        setLoading(true);
        try {
            const data = await getAllDataForBackup();
            const json = JSON.stringify(data, null, 2);
            
            const fileName = `Altiora_Backup_${new Date().toISOString().split('T')[0]}_${Date.now()}.json`;
            const fileUri = `${FileSystem.documentDirectory}${fileName}`;
            
            await FileSystem.writeAsStringAsync(fileUri, json, { encoding: FileSystem.EncodingType.UTF8 });
            
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(fileUri);
            } else {
                Alert.alert('Success', `Backup saved to: ${fileUri}`);
            }
        } catch (e) {
            console.error(e);
            Alert.alert('Error', 'Failed to create backup: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleImport = async () => {
        Alert.alert(
            'Import Data',
            'This will REPLACED all existing data in the app with the data from the backup file. This cannot be undone. Are you sure?',
            [
                { text: 'Cancel', style: 'cancel' },
                { 
                    text: 'Import', 
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const result = await DocumentPicker.getDocumentAsync({
                                type: 'application/json',
                                copyToCacheDirectory: true
                            });

                            if (result.canceled) return;

                            setLoading(true);
                            const fileContent = await FileSystem.readAsStringAsync(result.assets[0].uri);
                            const backup = JSON.parse(fileContent);

                            const res = await restoreDataFromBackup(backup);
                            if (res.success) {
                                Alert.alert('Success', 'Data restored successfully. Please restart the app for all changes to take effect.');
                            } else {
                                throw new Error(res.error);
                            }
                        } catch (e) {
                            console.error(e);
                            Alert.alert('Error', 'Failed to restore backup: ' + e.message);
                        } finally {
                            setLoading(false);
                        }
                    }
                }
            ]
        );
    };

    const handleSyncTasks = async () => {
        setLoading(true);
        try {
            const hasPermission = await requestCalendarPermissions();
            if (!hasPermission) {
                Alert.alert('Permission Denied', 'Calendar access permission is required to sync tasks.');
                return;
            }

            const unsyncedTasks = await getUnsyncedTasks();
            if (unsyncedTasks.length === 0) {
                Alert.alert('Synced', 'All your tasks are already synced to your calendar!');
                return;
            }

            let syncCount = 0;
            for (const task of unsyncedTasks) {
                try {
                    const eventId = await syncTaskToCalendar(task);
                    if (eventId) {
                        await updateTaskCalendarIds(task.id, eventId, null);
                        syncCount++;
                    }
                } catch (taskErr) {
                    console.error(`Failed to sync task ${task.id}:`, taskErr);
                }
            }

            Alert.alert(
                'Sync Complete',
                `Successfully synced ${syncCount} task(s) to your device calendar!`
            );
        } catch (e) {
            console.error(e);
            Alert.alert('Error', 'Failed to sync tasks: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    const SettingItem = ({ title, description, icon: Icon, onPress, color = COLORS.primary }) => (
        <TouchableOpacity style={s.item} onPress={onPress}>
            <View style={[s.iconBg, { backgroundColor: `${color}20` }]}>
                <Icon size={24} color={color} />
            </View>
            <View style={s.itemContent}>
                <Text style={s.itemTitle}>{title}</Text>
                <Text style={s.itemDescription}>{description}</Text>
            </View>
        </TouchableOpacity>
    );

    return (
        <ScrollView style={s.container}>
            <View style={s.header}>
                <Database size={48} color={COLORS.primary} strokeWidth={1.5} />
                <Text style={s.title}>Data Management</Text>
                <Text style={s.subtitle}>Secure your data and sync across devices</Text>
            </View>

            <View style={s.section}>
                <Text style={s.sectionTitle}>Backup & Restore</Text>
                <SettingItem 
                    title="Export Backup"
                    description="Save all your expenses, habits, and records to a JSON file."
                    icon={Download}
                    onPress={handleExport}
                />
                <SettingItem 
                    title="Import Backup"
                    description="Restore your data from a previously exported Altiora backup file."
                    icon={Upload}
                    onPress={handleImport}
                    color="#F59E0B"
                />
            </View>

            <View style={s.section}>
                <Text style={s.sectionTitle}>Integrations</Text>
                <SettingItem 
                    title="Sync Tasks to Calendar"
                    description="Sync all existing offline tasks to your device's Google Calendar / Apple Calendar."
                    icon={Calendar}
                    onPress={handleSyncTasks}
                    color="#10B981"
                />
            </View>

            <View style={s.infoCard}>
                <View style={s.infoRow}>
                    <Shield size={20} color={COLORS.primary} />
                    <Text style={s.infoText}>All data is stored locally on your device.</Text>
                </View>
                <View style={[s.infoRow, { marginTop: 12 }]}>
                    <Clock size={20} color={COLORS.primary} />
                    <Text style={s.infoText}>Backups include precise timestamps for every entry.</Text>
                </View>
                <View style={[s.infoRow, { marginTop: 12 }]}>
                    <FileText size={20} color={COLORS.primary} />
                    <Text style={s.infoText}>Backup format: JSON (Human readable)</Text>
                </View>
            </View>

            {loading && (
                <View style={s.overlay}>
                    <ActivityIndicator size="large" color={COLORS.primary} />
                    <Text style={s.overlayText}>Processing...</Text>
                </View>
            )}
            
            <View style={{ height: 100 }} />
        </ScrollView>
    );
};

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background, padding: SPACING.lg },
    header: { alignItems: 'center', marginTop: 20, marginBottom: 40 },
    title: { fontSize: 24, fontWeight: '900', color: COLORS.textPrimary, marginTop: 16 },
    subtitle: { fontSize: 14, color: COLORS.textSecondary, marginTop: 8, textAlign: 'center' },
    section: { marginBottom: 30 },
    sectionTitle: { fontSize: 13, fontWeight: '800', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 16, marginLeft: 4 },
    item: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        backgroundColor: COLORS.surface, 
        padding: 16, 
        borderRadius: 16, 
        marginBottom: 12,
        borderWidth: 1,
        borderColor: COLORS.border
    },
    iconBg: { width: 48, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    itemContent: { flex: 1, marginLeft: 16 },
    itemTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
    itemDescription: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
    infoCard: { backgroundColor: `${COLORS.primary}08`, padding: 20, borderRadius: 20, borderWidth: 1, borderColor: `${COLORS.primary}20` },
    infoRow: { flexDirection: 'row', alignItems: 'center' },
    infoText: { fontSize: 13, color: COLORS.textSecondary, marginLeft: 12, fontWeight: '500' },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(11, 15, 26, 0.8)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000
    },
    overlayText: { color: COLORS.textPrimary, marginTop: 16, fontSize: 16, fontWeight: '600' }
});

export default SettingsScreen;
