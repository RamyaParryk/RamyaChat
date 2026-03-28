import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { t } from '../utils/translator';
import packageJson from '../../package.json';

export default function AboutScreen({ navigation }: any) {
  const { theme } = useTheme();
  const { colors } = theme;

const renderFaqItem = (question: any, answer: any) => (
    <View style={[styles.faqItem, { borderBottomColor: colors.border }]}>
      <Text style={[styles.faqQuestion, { color: colors.text }]}>{t(question)}</Text>
      <Text style={[styles.faqAnswer, { color: colors.secondaryText }]}>{t(answer)}</Text>
    </View>
  );

  const renderLinkItem = (icon: any, title: any, onPress: () => void) => (
    <TouchableOpacity style={[styles.linkItem, { borderBottomColor: colors.border }]} onPress={onPress}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Ionicons name={icon} size={22} color={colors.primary} style={{ marginRight: 15 }} />
        <Text style={[styles.linkTitle, { color: colors.text }]}>{t(title)}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.secondaryText} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        
        {/* 🌟 アプリのロゴと基本情報 */}
        <View style={styles.headerSection}>
          <View style={[styles.logoContainer, { backgroundColor: colors.primary }]}>
            <Ionicons name="chatbubbles" size={60} color="#fff" />
          </View>
          <Text style={[styles.appName, { color: colors.text }]}>RamyaChat</Text>
          <Text style={[styles.version, { color: colors.secondaryText }]}>{t('appVersion')} {packageJson.version}</Text>
        </View>

        {/* 🌟 開発者情報 */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>{t('developer')}</Text>
          <Text style={[styles.developerName, { color: colors.text }]}>Rato Lab</Text>
        </View>

        {/* 🌟 リンク集 */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, paddingVertical: 5 }]}>
          {renderLinkItem("document-text-outline", "termsOfService", () => Linking.openURL('https://ramyachat-260313.web.app/terms.html'))}
          {renderLinkItem("shield-checkmark-outline", "privacyPolicy", () => Linking.openURL('https://ramyachat-260313.web.app/privacy.html'))}
        </View>

        {/* 🌟 FAQ / ヘルプセクション：基本 */}
        <Text style={[styles.sectionHeading, { color: colors.secondaryText }]}>{t('helpAndFaq')}</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 0 }]}>
          {renderFaqItem('faq1Q', 'faq1A')} {/* 音声再生について */}
          {renderFaqItem('faq2Q', 'faq2A')} {/* 友達追加について */}
          {renderFaqItem('faq3Q', 'faq3A')} {/* 串刺し検索について */}
        </View>

        {/* 🌟 FAQ / ヘルプセクション：容量・保存 */}
        <Text style={[styles.sectionHeading, { color: colors.secondaryText }]}>{t('limitsAndPrivacy')}</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 0 }]}>
          {renderFaqItem('faq4Q', 'faq4A')} {/* 10MB制限について */}
          {renderFaqItem('faq5Q', 'faq5A')} {/* 一時保存とローカル保存推奨 */}
        </View>

        <Text style={styles.copyright}>© 2026 Rato Lab. All rights reserved.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContainer: { padding: 20, paddingBottom: 40 },
  headerSection: { alignItems: 'center', marginBottom: 30, marginTop: 10 },
  logoContainer: { width: 100, height: 100, borderRadius: 25, justifyContent: 'center', alignItems: 'center', marginBottom: 15, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 5, elevation: 5 },
  appName: { fontSize: 26, fontWeight: 'bold', marginBottom: 5 },
  version: { fontSize: 14 },
  card: { borderRadius: 15, padding: 15, marginBottom: 20, borderWidth: 1 },
  sectionTitle: { fontSize: 12, fontWeight: 'bold', marginBottom: 5, textTransform: 'uppercase' },
  developerName: { fontSize: 18, fontWeight: '500' },
  linkItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth },
  linkTitle: { fontSize: 16 },
  sectionHeading: { fontSize: 14, fontWeight: 'bold', marginLeft: 10, marginBottom: 10, textTransform: 'uppercase' },
  faqItem: { padding: 15, borderBottomWidth: StyleSheet.hairlineWidth },
  faqQuestion: { fontSize: 15, fontWeight: 'bold', marginBottom: 8 },
  faqAnswer: { fontSize: 14, lineHeight: 20 },
  copyright: { textAlign: 'center', color: '#888', fontSize: 12, marginTop: 20 }
});