import { format, parseISO, isToday, isYesterday, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';

export const formatDate = (date) => format(new Date(date), 'MMM dd, yyyy');
export const formatTime = (date) => format(new Date(date), 'hh:mm a');
export const formatDateTime = (date) => format(new Date(date), 'MMM dd, hh:mm a');
export const formatDateKey = (date) => format(new Date(date), 'yyyy-MM-dd');
export const getTodayKey = () => formatDateKey(new Date());

export const formatCurrency = (amount) => {
    if (amount === null || amount === undefined) return '₹0';
    return '₹' + Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

export const getRelativeDate = (dateStr) => {
    const date = new Date(dateStr);
    if (isToday(date)) return 'Today';
    if (isYesterday(date)) return 'Yesterday';
    return formatDate(date);
};

export const getWeekRange = () => {
    const now = new Date();
    return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
};

export const getMonthRange = () => {
    const now = new Date();
    return { start: startOfMonth(now), end: endOfMonth(now) };
};

export const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

export const getTimeDifference = (scheduledTime, actualTime) => {
    if (!scheduledTime || !actualTime) return null;
    const [sh, sm] = scheduledTime.split(':').map(Number);
    const [ah, am] = actualTime.split(':').map(Number);
    const diff = (ah * 60 + am) - (sh * 60 + sm);
    if (diff <= 0) return { late: false, minutes: Math.abs(diff) };
    return { late: true, minutes: diff };
};
