import { NativeModules, Platform, Alert } from 'react-native';

const { AppUsageModule } = NativeModules;

/**
 * Check if Usage Stats permission is granted
 */
export const checkUsagePermission = async () => {
    if (Platform.OS !== 'android' || !AppUsageModule) return false;
    try {
        return await AppUsageModule.hasUsagePermission();
    } catch {
        return false;
    }
};

/**
 * Open Usage Access settings
 */
export const requestUsagePermission = () => {
    if (Platform.OS === 'android' && AppUsageModule) {
        AppUsageModule.requestUsagePermission();
    }
};

/**
 * Get app usage for a specific date (defaults to today)
 * @param dateKey String in 'YYYY-MM-DD' format
 */
export const getAutoAppUsage = async (dateKey) => {
    if (Platform.OS !== 'android' || !AppUsageModule) {
        return [];
    }

    try {
        const hasPermission = await AppUsageModule.hasUsagePermission();
        if (!hasPermission) {
            return { error: 'PERMISSION_REQUIRED' };
        }

        // Calculate start and end of the target day
        const targetDate = new Date(dateKey);
        targetDate.setHours(0, 0, 0, 0);
        const startTime = targetDate.getTime();
        
        const endDate = new Date(dateKey);
        endDate.setHours(23, 59, 59, 999);
        const endTime = endDate.getTime();

        const stats = await AppUsageModule.getAppUsage(startTime, endTime);
        
        // Sort by total time descending
        return stats.sort((a, b) => b.totalTimeMs - a.totalTimeMs);
    } catch (err) {
        console.error('Failed to get auto app usage:', err);
        return [];
    }
};

/**
 * Formats milliseconds into a readable HR:MIN format
 */
export const formatDuration = (ms) => {
    const minutes = Math.floor(ms / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    if (hours > 0) {
        return `${hours}h ${remainingMinutes}m`;
    }
    return `${remainingMinutes}m`;
};
