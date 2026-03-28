import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
// 👇 ここは後で utils/translator.ts 側に合わせて調整します
import { setAppLanguage } from '../utils/translator';

// Contextで管理するデータの型定義
interface LanguageContextType {
  language: string;
  changeLanguage: (lang: string) => Promise<void>;
}

// Contextの作成
const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

// アプリ全体を包むProviderコンポーネント
export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguage] = useState<string>('ja'); // デフォルトは日本語

  // アプリ起動時に、保存されている言語設定を読み込む
  useEffect(() => {
    const loadLanguage = async () => {
      try {
        const savedLanguage = await AsyncStorage.getItem('user_language');
        if (savedLanguage) {
          setLanguage(savedLanguage);
          setAppLanguage(savedLanguage); // utilsの翻訳処理にも反映
        }
      } catch (error) {
        console.error('言語設定の読み込みに失敗しました:', error);
      }
    };
    loadLanguage();
  }, []);

  // 言語を切り替えて保存する関数
  const changeLanguage = async (newLang: string) => {
    try {
      setLanguage(newLang);
      setAppLanguage(newLang); // utilsの翻訳処理にも即座に反映
      await AsyncStorage.setItem('user_language', newLang); // 次回の起動用に保存
    } catch (error) {
      console.error('言語設定の保存に失敗しました:', error);
    }
  };

  return (
    <LanguageContext.Provider value={{ language, changeLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
};

// コンポーネント内で簡単に使えるようにするカスタムフック
export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage は LanguageProvider の中で使用してください');
  }
  return context;
};