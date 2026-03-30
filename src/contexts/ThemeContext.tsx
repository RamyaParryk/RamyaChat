import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
// ❌ SecureStoreは削除！
// import * as SecureStore from 'expo-secure-store';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage'; // 🌟 軽くてWebも対応！
import { Themes, ThemeType } from '../styles/themes';

const THEME_STORAGE_KEY = 'user_selected_theme_v1';

interface ThemeContextType {
  theme: typeof Themes.light;
  themeType: ThemeType;
  setTheme: (type: ThemeType) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const osColorScheme = useColorScheme();
  const initialTheme = osColorScheme === 'dark' ? 'dark' : 'light';
  const [themeType, setThemeType] = useState<ThemeType>(initialTheme);

  useEffect(() => {
    const loadSavedTheme = async () => {
      try {
        // 🌟 AsyncStorageに変更（Platform分岐も不要！）
        const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY) as ThemeType | null;
        if (savedTheme && Themes[savedTheme]) {
          setThemeType(savedTheme);
        }
      } catch (err) {
        console.error('テーマのロードに失敗:', err);
      }
    };
    loadSavedTheme();
  }, []);

  const setTheme = async (type: ThemeType) => {
    if (Themes[type]) {
      setThemeType(type);
      try {
        // 🌟 AsyncStorageに変更
        await AsyncStorage.setItem(THEME_STORAGE_KEY, type);
      } catch (err) {
        console.error('テーマの保存に失敗:', err);
      }
    }
  };

  const value = {
    theme: Themes[themeType],
    themeType: themeType,
    setTheme: setTheme,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeはThemeProviderの中で使用する必要があります');
  }
  return context;
};