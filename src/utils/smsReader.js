import { NativeModules, PermissionsAndroid, Platform, Alert } from 'react-native';

const { SmsModule } = NativeModules;

/**
 * Request SMS read permission from the user
 */
export const requestSmsPermission = async () => {
    if (Platform.OS !== 'android') {
        return false;
    }

    try {
        const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.READ_SMS,
            {
                title: 'SMS Permission',
                message:
                    'Altiora needs access to your SMS messages to automatically track your spending from bank notifications.',
                buttonNeutral: 'Ask Me Later',
                buttonNegative: 'Cancel',
                buttonPositive: 'Allow',
            }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (err) {
        console.warn('SMS permission request failed:', err);
        return false;
    }
};

/**
 * Check if SMS permission is already granted
 */
export const checkSmsPermission = async () => {
    if (Platform.OS !== 'android') return false;
    try {
        if (SmsModule) {
            return await SmsModule.hasPermission();
        }
        return await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS);
    } catch {
        return false;
    }
};

/**
 * Get all SMS messages (most recent first)
 */
export const getAllSmsMessages = async (count = 50) => {
    if (Platform.OS !== 'android' || !SmsModule) {
        return [];
    }
    try {
        const messages = await SmsModule.getAllMessages(count);
        return messages.map(formatMessage);
    } catch (err) {
        console.error('Failed to get SMS messages:', err);
        return [];
    }
};

/**
 * Get only transaction-related SMS messages
 */
export const getTransactionSms = async (count = 100) => {
    if (Platform.OS !== 'android' || !SmsModule) {
        return [];
    }
    try {
        const messages = await SmsModule.getTransactionMessages(count);
        return messages.map(formatMessage);
    } catch (err) {
        console.error('Failed to get transaction SMS:', err);
        return [];
    }
};

/**
 * Get SMS from a specific sender
 */
export const getSmsBySender = async (sender, count = 50) => {
    if (Platform.OS !== 'android' || !SmsModule) {
        return [];
    }
    try {
        const messages = await SmsModule.getMessages(count, sender);
        return messages.map(formatMessage);
    } catch (err) {
        console.error('Failed to get SMS by sender:', err);
        return [];
    }
};

/**
 * Format a raw SMS message object into a cleaner structure
 */
const formatMessage = (msg) => {
    const date = new Date(msg.date);
    return {
        id: msg.id,
        sender: msg.address || 'Unknown',
        body: msg.body || '',
        timestamp: msg.date,
        date: formatDateStr(date),
        time: formatTimeStr(date),
        dateKey: formatDateKey(date),
        isRead: msg.read,
        parsed: parseTransactionFromSms(msg.body || ''),
    };
};

const formatDateStr = (d) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
};

const formatTimeStr = (d) => {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const formatDateKey = (d) => {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Parse a transaction SMS to extract amount, type, and merchant info.
 * Works with Indian bank SMS patterns.
 */
export const parseTransactionFromSms = (body) => {
    if (!body) return null;

    const lower = body.toLowerCase();
    const result = {
        amount: null,
        type: null, // 'debit' or 'credit'
        merchant: null,
        account: null,
        balance: null,
        upiRef: null,
    };

    // ---- Determine type ----
    if (lower.includes('debited') || lower.includes('debit') || lower.includes('spent') || 
        lower.includes('withdrawn') || lower.includes('purchase') || lower.includes('paid')) {
        result.type = 'debit';
    } else if (lower.includes('credited') || lower.includes('credit') || lower.includes('received') || 
               lower.includes('deposited') || lower.includes('refund')) {
        result.type = 'credit';
    }

    // ---- Extract amount ----
    // Patterns: Rs.1234.56, Rs 1234.56, INR 1234.56, Rs.1,234.56, Rs 1,23,456.78
    const amountPatterns = [
        /(?:rs\.?|inr|rupees)\s*([0-9,]+(?:\.\d{1,2})?)/i,
        /(?:amount|amt)\s*(?:of)?\s*(?:rs\.?|inr)?\s*([0-9,]+(?:\.\d{1,2})?)/i,
        /([0-9,]+(?:\.\d{1,2})?)\s*(?:has been|was|is)\s*(?:debited|credited)/i,
        /(?:debited|credited)\s*(?:for|with|by)?\s*(?:rs\.?|inr)?\s*([0-9,]+(?:\.\d{1,2})?)/i,
    ];

    for (const pattern of amountPatterns) {
        const match = body.match(pattern);
        if (match && match[1]) {
            const cleaned = match[1].replace(/,/g, '');
            const parsed = parseFloat(cleaned);
            if (!isNaN(parsed) && parsed > 0) {
                result.amount = parsed;
                break;
            }
        }
    }

    // ---- Extract account ----
    // Patterns: a/c XX1234, account XX1234, card ending 1234
    const accountPatterns = [
        /(?:a\/c|acct?|account)\s*(?:no\.?\s*)?(?:xx|x+|ending\s*)?(\d{3,})/i,
        /card\s*ending\s*(\d{4})/i,
        /(?:a\/c|acct?)\s*(\*+\d{3,})/i,
    ];

    for (const pattern of accountPatterns) {
        const match = body.match(pattern);
        if (match && match[1]) {
            result.account = match[1];
            break;
        }
    }

    // ---- Extract balance ----
    const balancePatterns = [
        /(?:bal|balance|avl\s*bal)[:\s]*(?:rs\.?|inr)?\s*([0-9,]+(?:\.\d{1,2})?)/i,
        /(?:available|avail)\s*(?:bal|balance)[:\s]*(?:rs\.?|inr)?\s*([0-9,]+(?:\.\d{1,2})?)/i,
    ];

    for (const pattern of balancePatterns) {
        const match = body.match(pattern);
        if (match && match[1]) {
            const cleaned = match[1].replace(/,/g, '');
            result.balance = parseFloat(cleaned);
            break;
        }
    }

    // ---- Extract merchant/receiver ----
    const merchantPatterns = [
        /(?:at|to|from|trf\s*to|paid\s*to)\s+([A-Za-z0-9\s@._-]{3,40})(?:\s+(?:on|ref|upi))/i,
        /(?:at|to|from)\s+([A-Za-z][A-Za-z0-9\s._-]{2,25})/i,
        /VPA\s+([a-zA-Z0-9._@-]+)/i,
    ];

    for (const pattern of merchantPatterns) {
        const match = body.match(pattern);
        if (match && match[1]) {
            result.merchant = match[1].trim();
            break;
        }
    }

    // ---- Extract UPI reference ----
    const upiMatch = body.match(/(?:upi\s*ref|ref\s*no|txn\s*id|transaction\s*id)[:\s]*(\d+)/i);
    if (upiMatch) {
        result.upiRef = upiMatch[1];
    }

    // Only return parsed info if we found at least an amount or type
    if (result.amount || result.type) {
        return result;
    }

    return null;
};

/**
 * Categorize a transaction SMS body using keywords
 */
export const categorizeSms = (body) => {
    if (!body) return 'Other';
    const lower = body.toLowerCase();

    const categories = {
        'Food': ['swiggy', 'zomato', 'restaurant', 'food', 'eat', 'dominos', 'pizza', 'uber eats', 'mcdonald', 'kfc', 'cafe', 'canteen', 'dining'],
        'Shopping': ['amazon', 'flipkart', 'myntra', 'ajio', 'shopping', 'mall', 'store', 'mart', 'retail', 'purchase'],
        'Travel': ['uber', 'ola', 'rapido', 'train', 'irctc', 'flight', 'airline', 'bus', 'metro', 'cab', 'taxi', 'travel', 'petrol', 'fuel', 'diesel'],
        'Bills': ['electricity', 'water', 'gas', 'internet', 'broadband', 'recharge', 'mobile', 'dth', 'bill', 'airtel', 'jio', 'vi ', 'vodafone', 'bsnl'],
        'Entertainment': ['netflix', 'prime', 'hotstar', 'disney', 'spotify', 'movie', 'cinema', 'pvr', 'inox'],
        'Health': ['pharmacy', 'medical', 'hospital', 'doctor', 'clinic', 'medicine', 'health', 'apollo', 'pharma'],
        'Education': ['course', 'udemy', 'coursera', 'book', 'school', 'college', 'tuition', 'education'],
        'EMI': ['emi', 'loan', 'installment'],
        'Transfer': ['transfer', 'neft', 'imps', 'upi', 'trf'],
        'ATM': ['atm', 'cash withdrawal', 'withdrawn'],
    };

    for (const [category, keywords] of Object.entries(categories)) {
        if (keywords.some(kw => lower.includes(kw))) {
            return category;
        }
    }

    return 'Other';
};
