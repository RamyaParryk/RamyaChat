import React, { useEffect, useState } from 'react';
import { Platform, View } from 'react-native'; 
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';

import LoginScreen from './src/screens/LoginScreen';
import ChatScreen from './src/screens/ChatScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import HomeScreen from './src/screens/HomeScreen';
import FriendsScreen from './src/screens/FriendsScreen';
import AboutScreen from './src/screens/AboutScreen';
import LanguageSelectScreen from './src/screens/LanguageSelectScreen';
// 🌟 通報画面を追加インポート
import ReportScreen from './src/screens/ReportScreen'; 

import { t } from './src/utils/translator'; 
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import { LanguageProvider, useLanguage } from './src/contexts/LanguageContext';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: false,
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

async function keepSplash() {
  try {
    await SplashScreen.preventAutoHideAsync();
  } catch (e) {
    console.log('Splash already prevented');
  }
}
keepSplash();

function MainTabs({ route }: any) {
  const { user } = route.params || {};
  const navigation = useNavigation();

  const { theme } = useTheme();
  const { colors } = theme;
  
  // 🌟 言語が変わった時にタブ名も再描画させるためにフックを呼び出す
  const { language } = useLanguage();

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const checkKilledStateNotification = async () => {
      try {
        const response = await Notifications.getLastNotificationResponseAsync();
        if (response && response.notification.request.content.data) {
          const pushData = response.notification.request.content.data;
          if (pushData && pushData.roomId && pushData.sender && user) {
            // @ts-ignore
            navigation.navigate('Chat', {
              user: user, 
              roomId: pushData.roomId,
              chatPartner: pushData.sender
            });
          }
        }
      } catch (err) {
        console.log("キル状態からの通知チェックエラー:", err);
      }
    };

    checkKilledStateNotification();

    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const pushData = response.notification.request.content.data;
      if (pushData && pushData.roomId && pushData.sender && user) {
        // @ts-ignore
        navigation.navigate('Chat', {
          user: user, 
          roomId: pushData.roomId,
          chatPartner: pushData.sender
        });
      }
    });

    return () => {
      subscription.remove();
    };
  }, [user, navigation]); 

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: any = 'help-circle';
          if (route.name === 'Friends') {
            iconName = focused ? 'people' : 'people-outline';
          } else if (route.name === 'Home') {
            iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
          } else if (route.name === 'Settings') {
            iconName = focused ? 'settings' : 'settings-outline';
          }
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: colors.primary, 
        tabBarInactiveTintColor: colors.secondaryText,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
        }
      })}
    >
      <Tab.Screen name="Friends" component={FriendsScreen} initialParams={{ user }} options={{ title: t('tabFriends') }} />
      <Tab.Screen name="Home" component={HomeScreen} initialParams={{ user }} options={{ title: t('tabTalk') }} />
      <Tab.Screen name="Settings" component={SettingsScreen} initialParams={{ user }} options={{ title: t('tabSettings') }} />
    </Tab.Navigator>
  );
}

function AppInner() {
  const [appIsReady, setAppIsReady] = useState(false);
  const { theme } = useTheme();
  
  // 🌟 言語が変わった時にヘッダー（戻るボタンなど）を再描画させるために呼び出す
  const { language } = useLanguage();

  useEffect(() => {
    async function prepare() {
      try {
        console.log("🌟 裏側で準備開始...");
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (e) {
        console.warn(e);
      } finally {
        console.log("🌟 準備完了！フラグを立てます。");
        setAppIsReady(true);
      }
    }
    prepare();
  }, []);

  useEffect(() => {
    if (appIsReady) {
      console.log("🌟 UI描画許可確認！ネイティブスプラッシュを隠します！");
      SplashScreen.hideAsync();
    }
  }, [appIsReady]);

  if (!appIsReady) {
    return <View style={{ flex: 1, backgroundColor: '#000000' }} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <NavigationContainer theme={theme}>
        <Stack.Navigator initialRouteName="Login">
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
          <Stack.Screen name="Chat" component={ChatScreen} options={{ title: 'RamyaChat', headerBackTitle: t('backButton') }} />
          <Stack.Screen name="About" component={AboutScreen} options={{ title: t('aboutApp'), headerBackTitle: t('backButton') }} />
          <Stack.Screen name="LanguageSelect" component={LanguageSelectScreen} options={{ title: t('languageChangeTitle') || '言語の変更', headerBackTitle: t('backButton') }} />
          
          {/* 🌟 通報画面のルーティング */}
          <Stack.Screen 
            name="ReportScreen" 
            component={ReportScreen} 
            options={{ 
              title: t('report_title') || '問題を報告する', 
              headerBackTitle: t('backButton') 
            }} 
          />
        </Stack.Navigator>
      </NavigationContainer>
    </View>
  );
}

// 🌟 最上位コンポーネント：LanguageProviderで全体をさらに囲む！
export default function App() {
  return (
    <LanguageProvider>
      <ThemeProvider>
        <AppInner />
      </ThemeProvider>
    </LanguageProvider>
  );
}