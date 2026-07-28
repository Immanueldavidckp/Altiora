import { Platform } from 'react-native';
import * as Calendar from 'expo-calendar';

/**
 * Request permissions for both Calendar events (Android/iOS) and Reminders (iOS only).
 */
export async function requestCalendarPermissions() {
    try {
        const { status: calendarStatus } = await Calendar.requestCalendarPermissionsAsync();
        let remindersStatus = 'granted';
        
        if (Platform.OS === 'ios') {
            const res = await Calendar.requestRemindersPermissionsAsync();
            remindersStatus = res.status;
        }
        
        return calendarStatus === 'granted' && remindersStatus === 'granted';
    } catch (e) {
        console.error('[Calendar] Error requesting permissions:', e);
        return false;
    }
}

/**
 * Get iOS default calendar source.
 */
async function getDefaultCalendarSource() {
    try {
        const defaultCalendar = await Calendar.getDefaultCalendarAsync();
        return defaultCalendar.source;
    } catch (e) {
        console.error('[Calendar] Error getting default source:', e);
        return null;
    }
}

/**
 * Get or create the custom 'Altiora Tasks' calendar.
 * Attempts to bind to a Google account on Android for cloud sync.
 */
export async function getOrCreateAltioraCalendar() {
    try {
        const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
        const existing = calendars.find(c => c.title === 'Altiora Tasks');
        if (existing) {
            return existing.id;
        }

        let source = null;
        if (Platform.OS === 'android') {
            // Find a Google Calendar source to enable automatic cloud sync
            const googleCal = calendars.find(c => c.source && (c.source.type === 'com.google' || c.source.name?.includes('@gmail.com')));
            if (googleCal && googleCal.source) {
                source = googleCal.source;
            } else {
                source = { isLocalAccount: true, name: 'Altiora Tasks', type: 'LOCAL' };
            }
        } else {
            // iOS default source
            source = await getDefaultCalendarSource();
        }

        const details = {
            title: 'Altiora Tasks',
            color: '#6C5CE7',
            entityType: Calendar.EntityTypes.EVENT,
            name: 'altiora_tasks',
            ownerAccount: 'personal',
            accessLevel: Calendar.CalendarAccessLevel.OWNER,
        };

        if (Platform.OS === 'ios' && source) {
            details.sourceId = source.id;
        } else if (Platform.OS === 'android' && source) {
            details.source = source;
        }

        const newCalendarId = await Calendar.createCalendarAsync(details);
        return newCalendarId;
    } catch (e) {
        console.error('[Calendar] Error getting/creating Altiora calendar:', e);
        return null;
    }
}

/**
 * Parse start/end dates and times into a valid Date object.
 */
function parseTaskDateTime(dateStr, timeStr) {
    if (!dateStr) return new Date();
    const [year, month, day] = dateStr.split('-').map(Number);
    let hours = 9;
    let minutes = 0;
    
    if (timeStr) {
        const [h, m] = timeStr.split(':').map(Number);
        hours = h;
        minutes = m;
    }
    
    return new Date(year, month - 1, day, hours, minutes);
}

/**
 * Sync a task to the native calendar.
 * Returns the calendarEventId.
 */
export async function syncTaskToCalendar(task) {
    try {
        const hasPermission = await requestCalendarPermissions();
        if (!hasPermission) {
            console.log('[Calendar] Calendar permission not granted.');
            return null;
        }

        const calendarId = await getOrCreateAltioraCalendar();
        if (!calendarId) {
            console.log('[Calendar] Altiora calendar could not be created/found.');
            return null;
        }

        const startDate = parseTaskDateTime(task.start_date, task.reminder_time);
        const endDate = task.end_date 
            ? parseTaskDateTime(task.end_date, task.reminder_time || '10:00')
            : new Date(startDate.getTime() + 60 * 60 * 1000); // Default to 1 hour duration

        // Recurrence rule configuration
        let recurrenceRule = undefined;
        if (task.repeat_type && task.repeat_type !== 'Once') {
            let frequency = Calendar.RecurrenceFrequency.DAILY;
            if (task.repeat_type === 'Weekly') {
                frequency = Calendar.RecurrenceFrequency.WEEKLY;
            } else if (task.repeat_type === 'Monthly') {
                frequency = Calendar.RecurrenceFrequency.MONTHLY;
            }
            recurrenceRule = {
                frequency,
                interval: 1,
            };
        }

        // Alarms/Reminders configuration
        const alarms = task.reminder_time ? [{
            relativeOffset: 0, // Alert at the exact time
            method: Calendar.AlarmMethod.ALERT,
        }] : [];

        const eventDetails = {
            title: task.name,
            startDate,
            endDate,
            timeZone: 'GMT', // Will default to device timezone automatically
            recurrenceRule,
            alarms,
            notes: `Task Type: ${task.task_type || 'General'}\nSynced from Altiora.`,
        };

        if (task.calendar_event_id) {
            // Update existing event
            try {
                await Calendar.updateEventAsync(task.calendar_event_id, eventDetails);
                return task.calendar_event_id;
            } catch (updateError) {
                console.log('[Calendar] Update event failed, creating a new one instead:', updateError);
                // If the event was deleted on the calendar app directly, create it again
                return await Calendar.createEventAsync(calendarId, eventDetails);
            }
        } else {
            // Create new event
            return await Calendar.createEventAsync(calendarId, eventDetails);
        }
    } catch (e) {
        console.error('[Calendar] Error syncing task to calendar:', e);
        return null;
    }
}

/**
 * Remove an event from the calendar.
 */
export async function deleteTaskFromCalendar(calendarEventId) {
    if (!calendarEventId) return;
    try {
        const hasPermission = await requestCalendarPermissions();
        if (!hasPermission) return;
        
        await Calendar.deleteEventAsync(calendarEventId);
        console.log(`[Calendar] Event ${calendarEventId} deleted.`);
    } catch (e) {
        console.error('[Calendar] Error deleting event from calendar:', e);
    }
}
