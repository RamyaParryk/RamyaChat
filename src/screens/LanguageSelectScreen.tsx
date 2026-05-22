import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '../utils/api';

const LANGUAGES = [
  { label: '日本語', code: 'ja' },
  { label: 'English', code: 'en' },
  { label: 'Русский', code: 'ru' },
  { label: 'Español', code: 'es' },
  { label: 'Deutsch', code: 'de' },
  { label: 'हिन्दी', code: 'hi' },
  { label: '中文', code: 'zh' },
  { label: '한국어', code: 'ko' },
  { label: 'ไทย', code: 'th' },
  { label: 'Tiếng Việt', code: 'vi' },
  { label: 'Français', code: 'fr' },
  { label: 'Português', code: 'pt' },
  { label: 'Italiano', code: 'it' },
  { label: 'Bahasa Indonesia', code: 'id' },
  { label: 'Türkçe', code: 'tr' },
  { label: 'العربية', code: 'ar' },
  { label: 'فارسی', code: 'fa' },
  { label: 'Kiswahili', code: 'sw' }
];

export default function LanguageSelectScreen({ navigation, route }: any) {
  const { theme } = useTheme();
  const { colors } = theme;
  const { language, changeLanguage } = useLanguage();

  // 🌟 設定画面などから渡されたユーザー情報を受け取る
  const user = route.params?.user;

  const handleSelect = async (code: string) => {
    // 1. スマホ内の言語設定を更新
    await changeLanguage(code);

    // 2. もしログイン中なら、サーバー（DB）にも言語を保存する
    if (user && (user.username || user._id)) {
      try {
        await apiClient.post('/update-language', {
          username: user.username || user._id,
          language: code
        });
      } catch (error) {
        console.error('サーバーへの言語保存に失敗しました:', error);
      }
    }

    // 3. 少し待ってから前の画面に戻る（UX向上）
    setTimeout(() => {
      if (navigation.canGoBack()) {
        navigation.goBack();
      }
    }, 200);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={[styles.listContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {LANGUAGES.map((item, index) => {
            const isSelected = language === item.code;
            const isLast = index === LANGUAGES.length - 1;

            return (
              <TouchableOpacity
                key={item.code}
                style={[
                  styles.listItem,
                  { borderBottomColor: colors.border },
                  !isLast && { borderBottomWidth: StyleSheet.hairlineWidth }
                ]}
                onPress={() => handleSelect(item.code)}
              >
                <Text style={{ 
                  fontSize: 16, 
                  color: isSelected ? colors.primary : colors.text,
                  fontWeight: isSelected ? 'bold' : 'normal'
                }}>
                  {item.label}
                </Text>
                
                {isSelected && (
                  <Ionicons name="checkmark" size={24} color={colors.primary} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContainer: { paddingVertical: 20 },
  listContainer: {
    marginTop: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 20,
  }
});