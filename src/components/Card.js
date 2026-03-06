import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, BORDER_RADIUS, SPACING } from '../theme/colors';

export const Card = ({ children, style, onPress }) => {
    const Wrapper = onPress ? TouchableOpacity : View;
    return (
        <Wrapper style={[styles.card, style]} onPress={onPress} activeOpacity={0.7}>
            {children}
        </Wrapper>
    );
};

export const StatCard = ({ title, value, subtitle, color, icon }) => (
    <View style={[styles.statCard, { borderLeftColor: color || COLORS.primary }]}>
        <Text style={styles.statTitle}>{title}</Text>
        <Text style={[styles.statValue, { color: color || COLORS.primary }]}>{value}</Text>
        {subtitle && <Text style={styles.statSubtitle}>{subtitle}</Text>}
    </View>
);

export const Badge = ({ label, color }) => (
    <View style={[styles.badge, { backgroundColor: (color || COLORS.primary) + '20' }]}>
        <Text style={[styles.badgeText, { color: color || COLORS.primary }]}>{label}</Text>
    </View>
);

export const Divider = () => <View style={styles.divider} />;

export const EmptyState = ({ title, subtitle, emoji }) => (
    <View style={styles.emptyState}>
        <Text style={styles.emptyEmoji}>{emoji || '📋'}</Text>
        <Text style={styles.emptyTitle}>{title || 'No data yet'}</Text>
        <Text style={styles.emptySubtitle}>{subtitle || 'Tap + to add your first entry'}</Text>
    </View>
);

export const SectionHeader = ({ title, rightText, onRightPress }) => (
    <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {rightText && (
            <TouchableOpacity onPress={onRightPress}>
                <Text style={styles.sectionRight}>{rightText}</Text>
            </TouchableOpacity>
        )}
    </View>
);

const styles = StyleSheet.create({
    card: {
        backgroundColor: COLORS.surface,
        borderRadius: BORDER_RADIUS.lg,
        padding: SPACING.lg,
        marginBottom: SPACING.md,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    statCard: {
        backgroundColor: COLORS.surface,
        borderRadius: BORDER_RADIUS.md,
        padding: SPACING.lg,
        flex: 1,
        marginHorizontal: SPACING.xs,
        borderLeftWidth: 3,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    statTitle: {
        fontSize: 11,
        color: COLORS.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        fontWeight: '600',
    },
    statValue: {
        fontSize: 22,
        fontWeight: '800',
        marginTop: 4,
    },
    statSubtitle: {
        fontSize: 11,
        color: COLORS.textMuted,
        marginTop: 2,
    },
    badge: {
        paddingHorizontal: SPACING.sm,
        paddingVertical: 3,
        borderRadius: BORDER_RADIUS.sm,
        alignSelf: 'flex-start',
    },
    badgeText: {
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.3,
    },
    divider: {
        height: 1,
        backgroundColor: COLORS.border,
        marginVertical: SPACING.md,
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
    },
    emptyEmoji: {
        fontSize: 48,
        marginBottom: SPACING.md,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: COLORS.textPrimary,
    },
    emptySubtitle: {
        fontSize: 14,
        color: COLORS.textSecondary,
        marginTop: SPACING.xs,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.md,
        marginTop: SPACING.lg,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: COLORS.textPrimary,
    },
    sectionRight: {
        fontSize: 13,
        color: COLORS.primary,
        fontWeight: '600',
    },
});
