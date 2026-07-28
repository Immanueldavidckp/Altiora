import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
    Modal, Alert, RefreshControl, ActivityIndicator, Dimensions, FlatList
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, BORDER_RADIUS, SPACING } from '../theme/colors';
import { Card, EmptyState, SectionHeader } from '../components/Card';
import { formatCurrency } from '../utils/helpers';
import {
    getShoonyaConfig, saveShoonyaConfig,
    getWatchlists, addWatchlist, deleteWatchlist,
    getWatchlistStocks, addWatchlistStock, removeWatchlistStock
} from '../db/database';
import ShoonyaApi from '../api/ShoonyaApi';

const { width } = Dimensions.get('window');

const TradingTracker = ({ navigation }) => {
    // Connection state
    const [config, setConfig] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const [connecting, setConnecting] = useState(false);
    const [margin, setMargin] = useState(null);

    // Config form
    const [showConfigModal, setShowConfigModal] = useState(false);
    const [userId, setUserId] = useState('FA153046');
    const [password, setPassword] = useState('Emo*1211');
    const [apiKey, setApiKey] = useState('15d2af62a7df5229f950800379749c40');
    const [vendorCode, setVendorCode] = useState('FA153046_U');
    const [totpSecret, setTotpSecret] = useState('RN25LW2255234G34S7ET2324235G4DL6');
    const [imei, setImei] = useState('abc1234');

    // Search
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [searchExchange, setSearchExchange] = useState('NSE');

    // Watchlists
    const [watchlists, setWatchlists] = useState([]);
    const [activeWatchlistId, setActiveWatchlistId] = useState(null);
    const [watchlistStocks, setWatchlistStocks] = useState([]);
    const [stockQuotes, setStockQuotes] = useState({});
    const [loadingQuotes, setLoadingQuotes] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    // Add watchlist modal
    const [showAddWatchlistModal, setShowAddWatchlistModal] = useState(false);
    const [newWatchlistName, setNewWatchlistName] = useState('');

    // Add stock to watchlist modal
    const [showAddStockModal, setShowAddStockModal] = useState(false);
    const [addStockSearchQuery, setAddStockSearchQuery] = useState('');
    const [addStockResults, setAddStockResults] = useState([]);
    const [addStockSearching, setAddStockSearching] = useState(false);

    const loadConfig = useCallback(async () => {
        try {
            const cfg = await getShoonyaConfig();
            setConfig(cfg);
            if (cfg) {
                setUserId(cfg.user_id || 'FA153046');
                setApiKey(cfg.api_key || '15d2af62a7df5229f950800379749c40');
                setVendorCode(cfg.vendor_code || 'FA153046_U');
                setTotpSecret(cfg.totp_secret || 'RN25LW2255234G34S7ET2324235G4DL6');
                setImei(cfg.imei || 'abc1234');
            }
        } catch (e) { console.error(e); }
    }, []);

    const loadWatchlists = useCallback(async () => {
        try {
            const wls = await getWatchlists();
            setWatchlists(wls);
            if (wls.length > 0 && !activeWatchlistId) {
                setActiveWatchlistId(wls[0].id);
            }
            // If active watchlist was deleted
            if (activeWatchlistId && !wls.find(w => w.id === activeWatchlistId)) {
                setActiveWatchlistId(wls.length > 0 ? wls[0].id : null);
            }
        } catch (e) { console.error(e); }
    }, [activeWatchlistId]);

    const loadWatchlistStocks = useCallback(async () => {
        if (!activeWatchlistId) { setWatchlistStocks([]); return; }
        try {
            const stocks = await getWatchlistStocks(activeWatchlistId);
            setWatchlistStocks(stocks);
        } catch (e) { console.error(e); }
    }, [activeWatchlistId]);

    const fetchQuotes = useCallback(async (stocks) => {
        if (!isConnected || stocks.length === 0) return;
        setLoadingQuotes(true);
        const quotes = {};
        for (const stock of stocks) {
            try {
                if (stock.token) {
                    const res = await ShoonyaApi.getQuotes(stock.exchange || 'NSE', stock.token);
                    if (res && res.stat === 'Ok') {
                        quotes[stock.symbol] = res;
                    }
                }
            } catch (e) {
                // skip
            }
        }
        setStockQuotes(quotes);
        setLoadingQuotes(false);
    }, [isConnected]);

    useEffect(() => { loadConfig(); loadWatchlists(); }, []);
    useEffect(() => { loadWatchlistStocks(); }, [activeWatchlistId, loadWatchlistStocks]);
    useEffect(() => {
        if (watchlistStocks.length > 0 && isConnected) {
            fetchQuotes(watchlistStocks);
        }
    }, [watchlistStocks, isConnected]);

    const handleConnect = async () => {
        if (!config) { setShowConfigModal(true); return; }
        setConnecting(true);
        try {
            const res = await ShoonyaApi.login({
                userId: config.user_id,
                password: config.password,
                apiKey: config.api_key,
                vendorCode: config.vendor_code,
                totpSecret: config.totp_secret,
                imei: config.imei,
                actid: config.actid || config.user_id
            });
            if (res.success) {
                setIsConnected(true);
                const limits = await ShoonyaApi.getLimits();
                setMargin(limits);
            } else {
                Alert.alert('Connection Failed', res.message);
            }
        } catch (e) {
            console.error('Shoonya Connect Error:', e);
            Alert.alert('Error', 'Connection Error: ' + (e.message || 'Ensure credentials are correct.'));
        } finally {
            setConnecting(false);
        }
    };

    const saveConfig = async () => {
        if (!userId || !password || !apiKey || !totpSecret) { Alert.alert('Error', 'Fill all fields'); return; }
        await saveShoonyaConfig({ 
            user_id: userId, 
            password, 
            api_key: apiKey, 
            vendor_code: vendorCode, 
            totp_secret: totpSecret,
            imei: imei
        });
        setShowConfigModal(false);
        loadConfig();
    };

    const handleSearch = async () => {
        if (!isConnected) { Alert.alert('Not Connected', 'Connect to Shoonya first'); return; }
        if (!searchQuery.trim()) return;
        setSearching(true);
        try {
            const res = await ShoonyaApi.searchScrip(searchQuery.toUpperCase(), searchExchange);
            if (res && res.stat === 'Ok' && res.values) {
                setSearchResults(res.values.slice(0, 15));
            } else {
                setSearchResults([]);
            }
        } catch (e) {
            console.error('Search error:', e);
        } finally {
            setSearching(false);
        }
    };

    const handleStockPress = (stock) => {
        setSearchResults([]);
        setSearchQuery('');
        navigation.navigate('StockDetail', {
            symbol: stock.tsym || stock.symbol,
            exchange: stock.exch || stock.exchange || 'NSE',
            token: stock.token,
            companyName: stock.cname || stock.company_name || '',
            isConnected
        });
    };

    const handleWatchlistStockPress = (stock) => {
        navigation.navigate('StockDetail', {
            symbol: stock.symbol,
            exchange: stock.exchange || 'NSE',
            token: stock.token,
            companyName: stock.company_name || '',
            isConnected
        });
    };

    const handleAddWatchlist = async () => {
        if (!newWatchlistName.trim()) return;
        await addWatchlist(newWatchlistName.trim());
        setNewWatchlistName('');
        setShowAddWatchlistModal(false);
        loadWatchlists();
    };

    const handleDeleteWatchlist = (id, name) => {
        Alert.alert('Delete Watchlist', `Delete "${name}" and all its stocks?`, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete', style: 'destructive', onPress: async () => {
                    await deleteWatchlist(id);
                    loadWatchlists();
                }
            }
        ]);
    };

    const handleSearchAddStock = async () => {
        if (!isConnected) { Alert.alert('Not Connected', 'Connect to Shoonya first'); return; }
        if (!addStockSearchQuery.trim()) return;
        setAddStockSearching(true);
        try {
            const res = await ShoonyaApi.searchScrip(addStockSearchQuery.toUpperCase(), searchExchange);
            if (res && res.stat === 'Ok' && res.values) {
                setAddStockResults(res.values.slice(0, 15));
            } else {
                setAddStockResults([]);
            }
        } catch (e) { console.error(e); }
        finally { setAddStockSearching(false); }
    };

    const handleAddStockToWatchlist = async (stock) => {
        if (!activeWatchlistId) return;
        await addWatchlistStock(activeWatchlistId, {
            symbol: stock.tsym,
            exchange: stock.exch || 'NSE',
            token: stock.token,
            company_name: stock.cname || stock.instname || ''
        });
        setShowAddStockModal(false);
        setAddStockSearchQuery('');
        setAddStockResults([]);
        loadWatchlistStocks();
    };

    const handleRemoveStock = (id, symbol) => {
        Alert.alert('Remove Stock', `Remove ${symbol} from watchlist?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Remove', style: 'destructive', onPress: async () => { await removeWatchlistStock(id); loadWatchlistStocks(); } }
        ]);
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await loadWatchlists();
        await loadWatchlistStocks();
        if (isConnected && watchlistStocks.length > 0) {
            await fetchQuotes(watchlistStocks);
        }
        setRefreshing(false);
    };

    const getPriceChange = (quote) => {
        if (!quote) return null;
        const lp = parseFloat(quote.lp || quote.ltp || 0);
        const pc = parseFloat(quote.c || quote.pc || 0);
        if (pc === 0) return null;
        const change = lp - pc;
        const changePct = (change / pc) * 100;
        return { change, changePct, isUp: change >= 0 };
    };

    return (
        <View style={s.container}>
            {/* Shoonya Connection Bar */}
            <View style={[s.shoonyaBar, isConnected && s.shoonyaBarConnected]}>
                <View style={s.shoonyaInfo}>
                    <View style={[s.statusDot, { backgroundColor: isConnected ? COLORS.accentGreen : COLORS.textMuted }]} />
                    <View style={{ flex: 1 }}>
                        <Text style={s.shoonyaStatus}>{isConnected ? 'Connected' : 'Offline'}</Text>
                        {isConnected && margin && (
                            <Text style={s.shoonyaBalance}>Balance: {formatCurrency(parseFloat(margin.cash) || 0)}</Text>
                        )}
                    </View>
                </View>
                <TouchableOpacity style={[s.connectBtn, isConnected && { backgroundColor: COLORS.accentRed + '30' }]}
                    onPress={() => isConnected ? setIsConnected(false) : handleConnect()}>
                    {connecting ? <ActivityIndicator size="small" color="#FFF" /> :
                        <Text style={[s.connectBtnText, isConnected && { color: COLORS.accentRed }]}>{isConnected ? 'Disconnect' : 'Connect'}</Text>
                    }
                </TouchableOpacity>
                <TouchableOpacity style={s.settingsIcon} onPress={() => setShowConfigModal(true)}>
                    <Ionicons name="settings-outline" size={20} color={COLORS.textSecondary} />
                </TouchableOpacity>
            </View>

            {/* Search Bar */}
            <View style={s.searchSection}>
                <View style={s.searchBar}>
                    <Ionicons name="search" size={18} color={COLORS.textMuted} style={{ marginRight: 8 }} />
                    <TextInput
                        style={s.searchInput}
                        placeholder="Search stocks (e.g. RELIANCE, NIFTY)"
                        placeholderTextColor={COLORS.textMuted}
                        value={searchQuery}
                        onChangeText={(text) => { setSearchQuery(text); if (!text.trim()) setSearchResults([]); }}
                        onSubmitEditing={handleSearch}
                        returnKeyType="search"
                    />
                    {searching && <ActivityIndicator size="small" color={COLORS.primary} />}
                    {searchQuery.length > 0 && !searching && (
                        <TouchableOpacity onPress={handleSearch} style={s.searchGoBtn}>
                            <Ionicons name="arrow-forward" size={18} color="#FFF" />
                        </TouchableOpacity>
                    )}
                </View>
                {/* Exchange Toggle */}
                <View style={s.exchToggle}>
                    {['NSE', 'NFO', 'BSE', 'MCX'].map(ex => (
                        <TouchableOpacity
                            key={ex}
                            style={[s.exchBtn, searchExchange === ex && s.exchBtnActive]}
                            onPress={() => setSearchExchange(ex)}
                        >
                            <Text style={[s.exchBtnText, searchExchange === ex && s.exchBtnTextActive]}>{ex}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            {/* Search Results Dropdown */}
            {searchResults.length > 0 && (
                <View style={s.searchResultsContainer}>
                    <ScrollView style={s.searchResults} nestedScrollEnabled>
                        {searchResults.map((item, index) => (
                            <TouchableOpacity key={index} style={s.searchResultItem} onPress={() => handleStockPress(item)}>
                                <View style={{ flex: 1 }}>
                                    <Text style={s.searchResultSymbol}>{item.tsym}</Text>
                                    <Text style={s.searchResultName} numberOfLines={1}>{item.cname || item.instname || ''}</Text>
                                </View>
                                <View style={s.searchResultExch}>
                                    <Text style={s.searchResultExchText}>{item.exch}</Text>
                                </View>
                                <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                    <TouchableOpacity style={s.closeSearchBtn} onPress={() => setSearchResults([])}>
                        <Text style={s.closeSearchText}>Close</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Watchlist Tabs */}
            <View style={s.watchlistTabsContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.watchlistTabs}>
                    {watchlists.map((wl) => (
                        <TouchableOpacity
                            key={wl.id}
                            style={[s.watchlistTab, activeWatchlistId === wl.id && s.watchlistTabActive]}
                            onPress={() => setActiveWatchlistId(wl.id)}
                            onLongPress={() => handleDeleteWatchlist(wl.id, wl.name)}
                        >
                            <Text style={[s.watchlistTabText, activeWatchlistId === wl.id && s.watchlistTabTextActive]}>
                                {wl.name}
                            </Text>
                        </TouchableOpacity>
                    ))}
                    <TouchableOpacity style={s.addWatchlistBtn} onPress={() => setShowAddWatchlistModal(true)}>
                        <Ionicons name="add" size={18} color={COLORS.primary} />
                    </TouchableOpacity>
                </ScrollView>
            </View>

            {/* Watchlist Stocks */}
            <ScrollView
                style={s.stockList}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
            >
                {watchlistStocks.length === 0 ? (
                    <EmptyState
                        title={activeWatchlistId ? "No stocks yet" : "Create a watchlist"}
                        subtitle={activeWatchlistId ? "Tap + to add stocks to this watchlist" : "Tap + above to create your first watchlist"}
                        emoji="📊"
                    />
                ) : (
                    watchlistStocks.map((stock) => {
                        const quote = stockQuotes[stock.symbol];
                        const priceInfo = getPriceChange(quote);
                        return (
                            <TouchableOpacity key={stock.id} style={s.stockCard} onPress={() => handleWatchlistStockPress(stock)}
                                onLongPress={() => handleRemoveStock(stock.id, stock.symbol)} activeOpacity={0.7}>
                                <View style={s.stockInfo}>
                                    <Text style={s.stockSymbol}>{stock.symbol}</Text>
                                    <Text style={s.stockCompany} numberOfLines={1}>{stock.company_name || stock.exchange}</Text>
                                </View>
                                <View style={s.stockPrice}>
                                    {quote ? (
                                        <>
                                            <Text style={s.stockLtp}>₹{quote.lp || quote.ltp || '--'}</Text>
                                            {priceInfo && (
                                                <View style={[s.changeBadge, { backgroundColor: priceInfo.isUp ? COLORS.accentGreen + '15' : COLORS.accentRed + '15' }]}>
                                                    <Ionicons name={priceInfo.isUp ? 'caret-up' : 'caret-down'} size={10} color={priceInfo.isUp ? COLORS.accentGreen : COLORS.accentRed} />
                                                    <Text style={[s.changeText, { color: priceInfo.isUp ? COLORS.accentGreen : COLORS.accentRed }]}>
                                                        {priceInfo.changePct.toFixed(2)}%
                                                    </Text>
                                                </View>
                                            )}
                                        </>
                                    ) : (
                                        <Text style={s.stockNoData}>{isConnected && loadingQuotes ? '...' : '--'}</Text>
                                    )}
                                </View>
                                <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
                            </TouchableOpacity>
                        );
                    })
                )}
                <View style={{ height: 100 }} />
            </ScrollView>

            {/* FAB - Add Stock to Watchlist */}
            {activeWatchlistId && (
                <TouchableOpacity style={s.fab} onPress={() => setShowAddStockModal(true)} activeOpacity={0.8}>
                    <Ionicons name="add" size={28} color="#FFF" />
                </TouchableOpacity>
            )}

            {/* Config Modal */}
            <Modal visible={showConfigModal} animationType="fade" transparent>
                <View style={s.modalOverlay}>
                    <View style={s.modalContent}>
                        <View style={s.modalHeader}>
                            <Text style={s.modalTitle}>Shoonya API Config</Text>
                            <TouchableOpacity onPress={() => setShowConfigModal(false)}><Ionicons name="close" size={24} color={COLORS.textSecondary} /></TouchableOpacity>
                        </View>
                        <TextInput style={s.input} value={userId} onChangeText={setUserId} placeholder="User ID" placeholderTextColor={COLORS.textMuted} />
                        <TextInput style={s.input} value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry placeholderTextColor={COLORS.textMuted} />
                        <TextInput style={s.input} value={apiKey} onChangeText={setApiKey} placeholder="API Key" placeholderTextColor={COLORS.textMuted} />
                        <TextInput style={s.input} value={totpSecret} onChangeText={setTotpSecret} placeholder="TOTP Secret" placeholderTextColor={COLORS.textMuted} />
                        <TextInput style={s.input} value={vendorCode} onChangeText={setVendorCode} placeholder="Vendor Code" placeholderTextColor={COLORS.textMuted} />
                        <TextInput style={s.input} value={imei} onChangeText={setImei} placeholder="IMEI" placeholderTextColor={COLORS.textMuted} />
                        <TouchableOpacity style={s.submitBtn} onPress={saveConfig}><Text style={s.submitBtnText}>Save Config</Text></TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Add Watchlist Modal */}
            <Modal visible={showAddWatchlistModal} animationType="fade" transparent>
                <View style={s.modalOverlay}>
                    <View style={s.modalContent}>
                        <View style={s.modalHeader}>
                            <Text style={s.modalTitle}>New Watchlist</Text>
                            <TouchableOpacity onPress={() => setShowAddWatchlistModal(false)}><Ionicons name="close" size={24} color={COLORS.textSecondary} /></TouchableOpacity>
                        </View>
                        <TextInput style={s.input} value={newWatchlistName} onChangeText={setNewWatchlistName}
                            placeholder="Watchlist Name (e.g. NIFTY 50)" placeholderTextColor={COLORS.textMuted} autoFocus />
                        <TouchableOpacity style={s.submitBtn} onPress={handleAddWatchlist}><Text style={s.submitBtnText}>Create Watchlist</Text></TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Add Stock Modal */}
            <Modal visible={showAddStockModal} animationType="slide" transparent>
                <View style={s.modalOverlay}>
                    <View style={[s.modalContent, { maxHeight: '80%' }]}>
                        <View style={s.modalHeader}>
                            <Text style={s.modalTitle}>Add Stock</Text>
                            <TouchableOpacity onPress={() => { setShowAddStockModal(false); setAddStockResults([]); setAddStockSearchQuery(''); }}>
                                <Ionicons name="close" size={24} color={COLORS.textSecondary} />
                            </TouchableOpacity>
                        </View>
                        <View style={s.searchBar}>
                            <Ionicons name="search" size={18} color={COLORS.textMuted} style={{ marginRight: 8 }} />
                            <TextInput
                                style={s.searchInput}
                                placeholder="Search stock symbol..."
                                placeholderTextColor={COLORS.textMuted}
                                value={addStockSearchQuery}
                                onChangeText={setAddStockSearchQuery}
                                onSubmitEditing={handleSearchAddStock}
                                autoFocus
                            />
                            {addStockSearching && <ActivityIndicator size="small" color={COLORS.primary} />}
                        </View>
                        <ScrollView style={{ flex: 1, marginTop: 8 }}>
                            {addStockResults.map((item, index) => (
                                <TouchableOpacity key={index} style={s.searchResultItem}
                                    onPress={() => handleAddStockToWatchlist(item)}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.searchResultSymbol}>{item.tsym}</Text>
                                        <Text style={s.searchResultName} numberOfLines={1}>{item.cname || item.instname || ''}</Text>
                                    </View>
                                    <Ionicons name="add-circle" size={24} color={COLORS.accentGreen} />
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background, paddingHorizontal: SPACING.lg },
    // Connection bar
    shoonyaBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md, padding: 12, marginTop: 8, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
    shoonyaBarConnected: { borderColor: COLORS.accentGreen + '40' },
    shoonyaInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
    statusDot: { width: 8, height: 8, borderRadius: 4 },
    shoonyaStatus: { fontSize: 13, fontWeight: '700', color: COLORS.textPrimary },
    shoonyaBalance: { fontSize: 11, color: COLORS.accentGreen, fontWeight: '600', marginTop: 2 },
    connectBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 6 },
    connectBtnText: { fontSize: 11, fontWeight: '800', color: '#FFF' },
    settingsIcon: { marginLeft: 12 },
    // Search
    searchSection: { marginBottom: SPACING.sm },
    searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md, paddingHorizontal: 14, height: 48, borderWidth: 1, borderColor: COLORS.border },
    searchInput: { flex: 1, color: COLORS.textPrimary, fontSize: 14, paddingVertical: 0 },
    searchGoBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' },
    exchToggle: { flexDirection: 'row', gap: 6, marginTop: 8 },
    exchBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
    exchBtnActive: { backgroundColor: COLORS.primary + '25', borderColor: COLORS.primary },
    exchBtnText: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted },
    exchBtnTextActive: { color: COLORS.primary },
    // Search results
    searchResultsContainer: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md, marginBottom: SPACING.md, maxHeight: 300, borderWidth: 1, borderColor: COLORS.primary + '40', overflow: 'hidden' },
    searchResults: {},
    searchResultItem: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 10 },
    searchResultSymbol: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
    searchResultName: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
    searchResultExch: { backgroundColor: COLORS.background, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    searchResultExchText: { fontSize: 9, fontWeight: '700', color: COLORS.textMuted },
    closeSearchBtn: { padding: 10, alignItems: 'center', borderTopWidth: 1, borderTopColor: COLORS.border },
    closeSearchText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
    // Watchlist tabs
    watchlistTabsContainer: { marginBottom: SPACING.sm },
    watchlistTabs: { gap: 8, paddingVertical: 4 },
    watchlistTab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
    watchlistTabActive: { backgroundColor: COLORS.primary + '20', borderColor: COLORS.primary },
    watchlistTabText: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary },
    watchlistTabTextActive: { color: COLORS.primary },
    addWatchlistBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: COLORS.primary + '60', justifyContent: 'center', alignItems: 'center' },
    // Stock list
    stockList: { flex: 1 },
    stockCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border, gap: 12 },
    stockInfo: { flex: 1 },
    stockSymbol: { fontSize: 15, fontWeight: '800', color: COLORS.textPrimary },
    stockCompany: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
    stockPrice: { alignItems: 'flex-end' },
    stockLtp: { fontSize: 16, fontWeight: '800', color: COLORS.textPrimary },
    changeBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 4, gap: 3 },
    changeText: { fontSize: 11, fontWeight: '700' },
    stockNoData: { fontSize: 14, color: COLORS.textMuted },
    // FAB
    fab: { position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8 },
    // Modals
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', padding: 20 },
    modalContent: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl, padding: SPACING.xl, borderWidth: 1, borderColor: COLORS.border },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xl },
    modalTitle: { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary },
    input: { backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.md, padding: 14, color: COLORS.textPrimary, fontSize: 14, borderWidth: 1, borderColor: COLORS.border, marginBottom: 12 },
    submitBtn: { backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.md, paddingVertical: 14, alignItems: 'center', marginTop: 10 },
    submitBtnText: { fontSize: 15, fontWeight: '800', color: '#FFF' },
});

export default TradingTracker;
