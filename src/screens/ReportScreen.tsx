import React, { useState, useMemo } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  ScrollView, 
  StyleSheet, 
  Alert, 
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  I18nManager
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

// 🌟 あなたの独自システムとAPIをインポート
import { t } from '../utils/translator'; 
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { apiClient } from '../utils/api'; // 🌟 確実に追加

// @ts-ignore
export default function ReportScreen({ route, navigation }) {
  const { language } = useLanguage();
  const { theme } = useTheme();
  const { colors } = theme;
  
  // 🌟 route.params から通報者(reporterId)と対象者(reportedUserId)を受け取る
  const reporterId = route.params?.reporterId || 'unknown_reporter';
  const reportedUserId = route.params?.reportedUserId || 'unknown_user';

  const [selectedReason, setSelectedReason] = useState<string>('spam');
  const [details, setDetails] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const reportReasons = useMemo(() => [
    { id: 'spam', label: t('reason_spam') || 'スパム・宣伝目的' },
    { id: 'harassment', label: t('reason_harassment') || '嫌がらせ・誹謗中傷' },
    { id: 'inappropriate', label: t('reason_inappropriate') || '不適切なコンテンツ' },
    { id: 'other', label: t('reason_other') || 'その他' },
  ], [language]);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      // 🌟 プロジェクトの apiClient を使ってPOST送信
      const response = await apiClient.post('/reports', {
        reporterId: reporterId,
        reportedUserId: reportedUserId,
        reason: selectedReason,
        details: details.trim(),
      });

      // 🌟 Webブラウザ用とスマホ実機用でアラートを分ける
      if (Platform.OS === 'web') {
        window.alert(t('report_success_msg') || 'ご報告ありがとうございます。内容を確認いたします。');
        navigation.goBack();
      } else {
        Alert.alert(
          t('report_success_title') || '報告完了', 
          t('report_success_msg') || 'ご報告ありがとうございます。',
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      }
    } catch (error) {
      console.error('通報の送信エラー:', error);
      if (Platform.OS === 'web') {
        window.alert('エラーが発生しました。サーバーとの通信に失敗しました。');
      } else {
        Alert.alert('Error', 'Failed to send report.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const isRTL = I18nManager.isRTL;
  const textAlign = isRTL ? 'right' : 'left';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={[styles.headerText, { color: colors.text, textAlign }]}>
            {t('report_title') || '問題を報告する'}
          </Text>
          <Text style={[styles.subText, { color: colors.text, textAlign }]}>
            {t('report_sub_text') || '該当する理由を選択し、詳細をご記入ください。この報告は相手には通知されません。'}
          </Text>

          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {reportReasons.map((item, index) => {
              const isSelected = selectedReason === item.id;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.radioItem,
                    { borderBottomColor: colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' },
                    index !== reportReasons.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth }
                  ]}
                  onPress={() => setSelectedReason(item.id)}
                >
                  <Text style={{ fontSize: 16, color: isSelected ? colors.primary : colors.text, textAlign }}>
                    {item.label}
                  </Text>
                  <Ionicons 
                    name={isSelected ? "radio-button-on" : "radio-button-off"} 
                    size={24} 
                    color={isSelected ? colors.primary : colors.border} 
                  />
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.label, { color: colors.text, textAlign }]}>
            {t('report_details_label') || '詳細（任意）'}
          </Text>
          <TextInput
            style={[styles.textInput, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border, textAlign }]}
            placeholder={t('report_placeholder') || '具体的な状況をご記入ください...'}
            placeholderTextColor="#999"
            multiline
            value={details}
            onChangeText={setDetails}
            textAlignVertical="top"
          />

          <TouchableOpacity 
            style={[styles.submitButton, { backgroundColor: colors.primary }, isSubmitting && { opacity: 0.7 }]}
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>{t('report_submit') || '送信する'}</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20 },
  headerText: { fontSize: 22, fontWeight: 'bold', marginBottom: 8 },
  subText: { fontSize: 15, opacity: 0.7, marginBottom: 24, lineHeight: 22 },
  card: { borderRadius: 12, borderWidth: 1, overflow: 'hidden', marginBottom: 24 },
  radioItem: { justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  label: { fontSize: 15, fontWeight: 'bold', marginBottom: 10, paddingHorizontal: 4 },
  textInput: { borderWidth: 1, borderRadius: 12, padding: 16, fontSize: 16, minHeight: 120, marginBottom: 32 },
  submitButton: { borderRadius: 12, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  submitButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});