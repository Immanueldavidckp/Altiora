import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import HomeScreen from './src/screens/HomeScreen';
import ExpenseTracker from './src/screens/ExpenseTracker';
import DailyRecords from './src/screens/DailyRecords';
import TasksScreen from './src/screens/TasksScreen';
import TradingTracker from './src/screens/TradingTracker';
import StockDetailScreen from './src/screens/StockDetailScreen';
import HabitTracker from './src/screens/HabitTracker';
import AppUsageTracker from './src/screens/AppUsageTracker';
import SettingsScreen from './src/screens/SettingsScreen';
import { getDatabase } from './src/db/database';

const COLORS = {
  background: '#0B0F1A',
  surface: '#141929',
  primary: '#6C5CE7',
  textPrimary: '#FFFFFF',
  textSecondary: '#8B95B0',
  textMuted: '#525D78',
  border: '#1E2640',
};

const Tab = createBottomTabNavigator();
const TradingStack = createNativeStackNavigator();
const HomeStack = createNativeStackNavigator();

const HomeStackScreen = () => (
  <HomeStack.Navigator
    screenOptions={{
      headerStyle: { backgroundColor: COLORS.background },
      headerTintColor: COLORS.textPrimary,
      headerTitleStyle: { fontWeight: '800', fontSize: 18 },
      headerShadowVisible: false,
      headerBackTitle: 'Back'
    }}
  >
    <HomeStack.Screen 
      name="HomeMain" 
      component={HomeScreen} 
      options={{ headerShown: false }} 
    />
    <HomeStack.Screen 
      name="Settings" 
      component={SettingsScreen} 
      options={{ title: 'Settings' }} 
    />
  </HomeStack.Navigator>
);

const TradingStackScreen = () => (
  <TradingStack.Navigator
    screenOptions={{
      headerStyle: { backgroundColor: COLORS.background },
      headerTintColor: COLORS.textPrimary,
      headerTitleStyle: { fontWeight: '800', fontSize: 18 },
      headerShadowVisible: false,
    }}
  >
    <TradingStack.Screen
      name="TradingMain"
      component={TradingTracker}
      options={{ headerShown: false }}
    />
    <TradingStack.Screen
      name="StockDetail"
      component={StockDetailScreen}
      options={({ route }) => ({
        title: route.params?.symbol || 'Stock Details',
        headerBackTitle: 'Back',
      })}
    />
  </TradingStack.Navigator>
);

const getTabIcon = (routeName, focused) => {
  const icons = {
    Home: focused ? 'home' : 'home-outline',
    Expenses: focused ? 'wallet' : 'wallet-outline',
    Daily: focused ? 'document-text' : 'document-text-outline',
    Tasks: focused ? 'checkbox' : 'checkbox-outline',
    Trading: focused ? 'trending-up' : 'trending-up-outline',
    Habits: focused ? 'checkmark-circle' : 'checkmark-circle-outline',
    Usage: focused ? 'phone-portrait' : 'phone-portrait-outline',
  };
  return icons[routeName] || 'ellipse';
};

export default function App() {
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    const initDb = async () => {
      try {
        await getDatabase();
        setDbReady(true);
      } catch (err) {
        console.error('DB init error:', err);
        setDbReady(true); // Still show app
      }
    };
    initDb();
  }, []);

  if (!dbReady) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Initializing...</Text>
          <StatusBar style="light" />
        </View>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <NavigationContainer>
      <StatusBar style="light" />
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused, color, size }) => {
            const iconName = getTabIcon(route.name, focused);
            return <Ionicons name={iconName} size={22} color={color} />;
          },
          tabBarActiveTintColor: COLORS.primary,
          tabBarInactiveTintColor: COLORS.textMuted,
          tabBarStyle: {
            backgroundColor: COLORS.surface,
            borderTopColor: COLORS.border,
            borderTopWidth: 1,
            height: 60,
            paddingBottom: 8,
            paddingTop: 4,
          },
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: '600',
          },
          headerStyle: {
            backgroundColor: COLORS.background,
            elevation: 0,
            shadowOpacity: 0,
            borderBottomWidth: 1,
            borderBottomColor: COLORS.border,
          },
          headerTitleStyle: {
            color: COLORS.textPrimary,
            fontSize: 18,
            fontWeight: '800',
          },
          headerTintColor: COLORS.textPrimary,
        })}
      >
        <Tab.Screen name="Home" component={HomeStackScreen} options={{ title: '🏠 Home' }} />
        <Tab.Screen name="Expenses" component={ExpenseTracker} options={{ title: '💰 Expenses' }} />
        <Tab.Screen name="Daily" component={DailyRecords} options={{ title: '📋 Daily' }} />
        <Tab.Screen name="Tasks" component={TasksScreen} options={{ title: '☑️ Tasks' }} />
        <Tab.Screen name="Trading" component={TradingStackScreen} options={{ title: '📈 Trading', headerShown: false }} />
        <Tab.Screen name="Habits" component={HabitTracker} options={{ title: '✅ Habits' }} />
        <Tab.Screen name="Usage" component={AppUsageTracker} options={{ title: '📱 Apps' }} />
      </Tab.Navigator>
    </NavigationContainer>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: COLORS.textSecondary,
    marginTop: 16,
    fontSize: 16,
    fontWeight: '600',
  },
});
