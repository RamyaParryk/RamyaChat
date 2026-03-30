import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { Ionicons } from '@expo/vector-icons';
import { t } from '../utils/translator';

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
];

// @ts-ignore
export default function LanguageSelectScreen({ navigation }) {
  const { theme } = useTheme();
  const { colors } = theme;
  const { language, changeLanguage } = useLanguage();

  const handleSelect = async (code: string) => {
    await changeLanguage(code);
    navigation.goBack(); // 選んだら自動的に設定画面に戻る！
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView>
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