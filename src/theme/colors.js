export const COLORS = {
    // Backgrounds
    background: '#0B0F1A',
    surface: '#141929',
    surfaceLight: '#1C2237',
    surfaceHighlight: '#232A42',

    // Primary gradient
    primary: '#6C5CE7',
    primaryLight: '#A29BFE',
    primaryDark: '#4834D4',

    // Accents
    accent: '#00D2FF',
    accentGreen: '#00E676',
    accentOrange: '#FF9100',
    accentRed: '#FF5252',
    accentPink: '#FF6B9D',
    accentYellow: '#FFD600',

    // Text
    textPrimary: '#FFFFFF',
    textSecondary: '#8B95B0',
    textMuted: '#525D78',

    // Borders
    border: '#1E2640',
    borderLight: '#2A3355',

    // Cards
    cardExpense: '#1A1F35',
    cardIncome: '#0D2818',
    cardTrading: '#1A1535',
    cardHabit: '#0D1F28',

    // Payment methods
    creditCard1: '#6C5CE7',
    creditCard2: '#00B894',
    creditCard3: '#E17055',
    creditCard4: '#FDCB6E',
    debitCard: '#0984E3',
    cash: '#00E676',
    loan1: '#FF5252',
    loan2: '#FF9100',
    travelCard: '#00D2FF',

    // Shadows
    shadowColor: '#000000',
};

export const FONTS = {
    regular: 'System',
    medium: 'System',
    bold: 'System',
    sizes: {
        xs: 10,
        sm: 12,
        md: 14,
        lg: 16,
        xl: 20,
        xxl: 26,
        xxxl: 34,
    },
};

export const SPACING = {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
};

export const BORDER_RADIUS = {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
};

export const PAYMENT_METHODS = [
    { id: 'credit_card_1', label: 'Credit Card 1', color: COLORS.creditCard1, icon: 'credit-card' },
    { id: 'credit_card_2', label: 'Credit Card 2', color: COLORS.creditCard2, icon: 'credit-card' },
    { id: 'credit_card_3', label: 'Credit Card 3', color: COLORS.creditCard3, icon: 'credit-card' },
    { id: 'credit_card_4', label: 'Credit Card 4', color: COLORS.creditCard4, icon: 'credit-card' },
    { id: 'debit_card', label: 'Debit Card', color: COLORS.debitCard, icon: 'card' },
    { id: 'cash', label: 'Cash', color: COLORS.cash, icon: 'cash' },
    { id: 'loan_1', label: 'Loan 1', color: COLORS.loan1, icon: 'trending-down' },
    { id: 'loan_2', label: 'Loan 2', color: COLORS.loan2, icon: 'trending-down' },
    { id: 'travel_card', label: 'Travel Card', color: COLORS.travelCard, icon: 'airplane' },
];

export const DAILY_VARIANTS = [
    { id: 'morning', label: 'Morning', icon: 'sunny', color: COLORS.accentOrange, emoji: '🌅' },
    { id: 'travel', label: 'Travel', icon: 'car', color: COLORS.accent, emoji: '🚗' },
    { id: 'office', label: 'Office', icon: 'briefcase', color: COLORS.primary, emoji: '💼' },
    { id: 'evening', label: 'Evening', icon: 'moon', color: COLORS.accentPink, emoji: '🌙' },
];

export const HABIT_CATEGORIES = [
    { id: 'morning', label: 'Morning', color: COLORS.accentOrange, emoji: '🌅' },
    { id: 'office', label: 'Office', color: COLORS.primary, emoji: '💼' },
    { id: 'evening', label: 'Evening', color: COLORS.accentPink, emoji: '🌙' },
];
