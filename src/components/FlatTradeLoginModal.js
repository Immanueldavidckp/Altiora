import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, BORDER_RADIUS, SPACING } from '../theme/colors';
import { buildAuthUrl } from '../api/FlatTradeApi';

// Extract the ?code=... value (the request_code) from a redirect URL.
const extractCode = (url) => {
    try {
        const match = url.match(/[?&]code=([^&#]+)/);
        return match ? decodeURIComponent(match[1]) : null;
    } catch (e) {
        return null;
    }
};

// Opens FlatTrade's hosted login in a WebView and captures the request code
// from the redirect back to your registered Redirect URL.
const FlatTradeLoginModal = ({ visible, apiKey, onCode, onClose }) => {
    const handled = React.useRef(false);

    React.useEffect(() => {
        if (visible) handled.current = false;
    }, [visible]);

    // Intercept navigation; once FlatTrade redirects with ?code=, grab it and
    // stop the WebView from actually loading your (possibly unreachable) site.
    const onNavChange = (navState) => {
        const url = navState.url || '';
        if (handled.current) return;
        // The auth host itself may carry params; only treat as redirect when it
        // leaves auth.flattrade.in and carries a code.
        if (url.includes('code=') && !url.includes('auth.flattrade.in')) {
            const code = extractCode(url);
            if (code) {
                handled.current = true;
                onCode(code);
            }
        }
    };

    const onShouldStart = (req) => {
        const url = req.url || '';
        if (!handled.current && url.includes('code=') && !url.includes('auth.flattrade.in')) {
            const code = extractCode(url);
            if (code) {
                handled.current = true;
                onCode(code);
                return false; // block the redirect from loading
            }
        }
        return true;
    };

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
            <View style={s.container}>
                <View style={s.header}>
                    <Text style={s.title}>FlatTrade Login</Text>
                    <TouchableOpacity onPress={onClose}>
                        <Ionicons name="close" size={26} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                </View>
                {apiKey ? (
                    <WebView
                        source={{ uri: buildAuthUrl(apiKey) }}
                        onNavigationStateChange={onNavChange}
                        onShouldStartLoadWithRequest={onShouldStart}
                        startInLoadingState
                        incognito
                        renderLoading={() => (
                            <View style={s.loading}>
                                <ActivityIndicator size="large" color={COLORS.primary} />
                            </View>
                        )}
                        style={{ flex: 1, backgroundColor: COLORS.background }}
                    />
                ) : (
                    <View style={s.loading}>
                        <Text style={s.errText}>Set your API Key in config first.</Text>
                    </View>
                )}
            </View>
        </Modal>
    );
};

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SPACING.lg, paddingTop: SPACING.xxl, borderBottomWidth: 1, borderBottomColor: COLORS.border },
    title: { fontSize: 18, fontWeight: '800', color: COLORS.textPrimary },
    loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
    errText: { color: COLORS.textSecondary, fontWeight: '600' },
});

export default FlatTradeLoginModal;
