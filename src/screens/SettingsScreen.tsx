import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View, Alert, Image, ActivityIndicator, Platform, ScrollView, Modal } from 'react-native'; 
import { SafeAreaView } from 'react-native-safe-area-context';
import { signOut, sendPasswordResetEmail, verifyBeforeUpdateEmail } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import * as ImagePicker from 'expo-image-picker'; 
import * as SecureStore from 'expo-secure-store';
import * as ImageManipulator from 'expo-image-manipulator';
import Cropper from 'react-easy-crop';

import { auth, db } from '../utils/firebaseConfig';
import { t } from '../utils/translator';
import { GlobalStyles } from '../styles/GlobalStyles';
import { useTheme } from '../contexts/ThemeContext';
import { ThemeType } from '../styles/themes';
import { useLanguage } from '../contexts/LanguageContext';
import { apiClient } from '../utils/api';
import { Ionicons } from '@expo/vector-icons';
import AdBanner from '../components/AdBanner';

// @ts-ignore
export default function SettingsScreen({ navigation }) {
  const { theme, setTheme, themeType } = useTheme();
  const { colors } = theme;
  const { language, changeLanguage } = useLanguage();

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');

  // 🌟 Webの切り取りモーダル用の状態管理
  const [isCropModalVisible, setIsCropModalVisible] = useState(false);
  const [selectedWebImage, setSelectedWebImage] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      if (auth.currentUser) {
        const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
        const data = userDoc.data();
        if (data) {
          setUserData(data); 
          if (data.avatar) setAvatarUrl(data.avatar);
        }
      }
    };
    fetchProfile();
  }, []);

  // 🌟 切り取りエリアが変更されたときの処理
  const onCropComplete = useCallback((croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  // 🌟 Webブラウザ上で画像を切り抜く処理（HTML Canvasを使用）
  const getCroppedImgBlob = async (imageSrc: string, pixelCrop: any): Promise<Blob> => {
    const image = new window.Image();
    image.src = imageSrc;
    await new Promise(resolve => { image.onload = resolve; });

    const canvas = document.createElement('canvas');
    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;
    const ctx = canvas.getContext('2d');

    if (!ctx) throw new Error('Canvas context not available');

    ctx.drawImage(
      image,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      pixelCrop.width,
      pixelCrop.height
    );

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error('Canvas is empty')); return; }
        resolve(blob);
      }, 'image/jpeg', 0.8);
    });
  };

  // 🌟 Web用のクロップ＆アップロード実行関数
  const handleWebCropAndUpload = async () => {
    if (!selectedWebImage || !croppedAreaPixels) return;
    
    setIsCropModalVisible(false);
    setUploading(true);

    try {
      if (!auth.currentUser || !userData) throw new Error("Not logged in");

      // Canvasで画像を切り抜いてBlob（ファイルデータ）にする
      const croppedBlob = await getCroppedImgBlob(selectedWebImage, croppedAreaPixels);

      const formData = new FormData();
      formData.append('userId', auth.currentUser.uid);
      formData.append('username', userData.username);
      formData.append('avatar', croppedBlob, 'avatar.jpg');

      const data = await apiClient.postForm('/upload-avatar', formData);
      const downloadUrl = data.url; 
      await updateDoc(doc(db, "users", auth.currentUser.uid), { avatar: downloadUrl });

      setAvatarUrl(downloadUrl);
      window.alert(t('uploadSuccessMessage') || '画像のアップロードに成功しました');

    } catch (error) {
      console.error(error);
      window.alert(t('uploadErrorMessage') || 'アップロードに失敗しました');
    } finally {
      setUploading(false);
      setSelectedWebImage(null);
    }
  };

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, 
      aspect: [1, 1],
      quality: 1, 
      base64: false,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const originalUri = result.assets[0].uri;

      // 🌟 Webの場合はここでアップロードを止め、自前の切り取りモーダルを開く！
      if (Platform.OS === 'web') {
        setSelectedWebImage(originalUri);
        setIsCropModalVisible(true);
        return;
      }

      // 📱 スマホの場合は今まで通りそのままアップロード
      setUploading(true);
      try {
        if (!auth.currentUser || !userData) throw new Error("Not logged in");

        const manipResult = await ImageManipulator.manipulateAsync(
          originalUri,
          [{ resize: { width: 512, height: 512 } }], 
          { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG } 
        );

        const formData = new FormData();
        formData.append('userId', auth.currentUser.uid);
        formData.append('username', userData.username);

        // @ts-ignore
        formData.append('avatar', {
          uri: manipResult.uri,
          type: 'image/jpeg', 
          name: 'avatar.jpg',
        });
        
        const data = await apiClient.postForm('/upload-avatar', formData);
        const downloadUrl = data.url; 
        await updateDoc(doc(db, "users", auth.currentUser.uid), {
          avatar: downloadUrl
        });

        setAvatarUrl(downloadUrl);
        Alert.alert(t('uploadSuccessTitle') || '成功', t('uploadSuccessMessage') || '画像を更新しました');

      } catch (error: any) {
        console.error(error);
        Alert.alert(t('uploadErrorTitle') || 'エラー', t('uploadErrorMessage') || 'アップロードに失敗しました');
      } finally {
        setUploading(false);
      }
    }
  };

  const handleResetPassword = async () => {
    if (auth.currentUser && auth.currentUser.email) {
      try {
        await sendPasswordResetEmail(auth, auth.currentUser.email);
        if (Platform.OS === 'web') {
          window.alert(t('resetPasswordSuccessMessage'));
        } else {
          Alert.alert(t('resetPasswordSuccessTitle'), t('resetPasswordSuccessMessage'));
        }
      } catch (error) {
        console.error(error);
        if (Platform.OS === 'web') {
          window.alert(t('resetPasswordError'));
        } else {
          Alert.alert(t('uploadErrorTitle'), t('resetPasswordError'));
        }
      }
    }
  };

  const handleUpdateEmail = async () => {
    if (!newEmail || !auth.currentUser) return;
    try {
      await verifyBeforeUpdateEmail(auth.currentUser, newEmail);
      if (Platform.OS === 'web') {
        window.alert(t('emailUpdateSentMessage'));
      } else {
        Alert.alert(t('emailUpdateSentTitle'), t('emailUpdateSentMessage'));
      }
      setIsEditingEmail(false);
      setNewEmail('');
    } catch (error: any) {
      const msg = error.code === 'auth/requires-recent-login' ? t('reloginRequiredMessage') : error.message;
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert(t('uploadErrorTitle'), msg);
    }
  };

  const performLogout = async () => {
    try {
      await signOut(auth);
      if (Platform.OS === 'web') {
        localStorage.removeItem('saved_email');
        localStorage.removeItem('saved_password');
      } else {
        await SecureStore.deleteItemAsync('saved_email');
        await SecureStore.deleteItemAsync('saved_password');
      }
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    } catch (error) {
      console.error(error);
    }
  };

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm(t('logoutConfirmMessage'));
      if (confirmed) performLogout();
    } else {
      Alert.alert(t('logoutConfirmTitle'), t('logoutConfirmMessage'), [
        { text: t('cancel'), style: "cancel" },
        { text: t('logoutButton'), style: "destructive", onPress: performLogout }
      ]);
    }
  };

  const renderThemeSelector = (type: ThemeType, label: string) => {
    const isSelected = themeType === type;
    return (
      <TouchableOpacity 
        style={[
            styles.themeOption, 
            { 
                borderColor: isSelected ? colors.primary : colors.border,
                backgroundColor: isSelected ? colors.primary + '15' : colors.card 
            }
        ]} 
        onPress={() => setTheme(type)}
      >
        <Text style={{ 
          color: isSelected ? colors.primary : colors.text,
          fontWeight: isSelected ? 'bold' : 'normal'
        }}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        
        <Text style={[styles.title, { color: colors.text }]}>{t('settingsTitle')}</Text>
        
        <TouchableOpacity onPress={pickImage} disabled={uploading} style={styles.avatarContainer}>
          {uploading ? (
            <View style={[styles.placeholder, { backgroundColor: colors.border }]}>
              <ActivityIndicator color={colors.primary} size="large" />
            </View>
          ) : avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={[styles.avatar, { borderColor: colors.card }]} />
          ) : (
            <View style={[styles.placeholder, { backgroundColor: colors.border }]}>
              <Text style={styles.placeholderText}>{t('noImage') || 'No Image'}</Text>
            </View>
          )}
          <View style={[styles.editIconContainer, { backgroundColor: colors.primary, borderColor: colors.card }]}>
            <Text style={styles.editIcon}>📷</Text>
          </View>
        </TouchableOpacity>
        
        <Text style={[styles.instruction, { color: colors.secondaryText }]}>{t('changeIconInstruction')}</Text>

        <View style={[styles.profileInfoContainer, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
          <Text style={[styles.profileName, { color: colors.text }]}>{userData ? userData.displayName : t('loading')}</Text>
          <Text style={[styles.profileId, { color: colors.secondaryText }]}>@{userData ? userData.username : '...'}</Text>
        </View>

        <View style={styles.themeSection}>
          <Text style={[styles.sectionTitle, { color: colors.secondaryText }]}>{t('themeChangeTitle') || 'テーマ（スキン）の変更'}</Text>
          <View style={styles.themeSelectorRow}>
            {renderThemeSelector('light', t('themeLight') || 'ライト')}
            {renderThemeSelector('dark', t('themeDark') || 'ダーク')}
            {renderThemeSelector('purple_ramya', t('themeRamya') || 'Ramya')}
          </View>
        </View>

        <TouchableOpacity 
          style={[styles.outlineButton, { borderColor: colors.border, backgroundColor: colors.card, marginBottom: 20 }]} 
          onPress={() => navigation.navigate('LanguageSelect')}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="globe-outline" size={20} color={colors.text} style={{ marginRight: 8 }} />
              <Text style={[styles.outlineButtonText, { color: colors.text, marginBottom: 0 }]}>
                {t('languageChangeTitle') || '言語の変更 (Language)'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.secondaryText} />
          </View>
        </TouchableOpacity>

        <View style={styles.actionsContainer}>
          <TouchableOpacity style={[styles.outlineButton, { borderColor: colors.primary, backgroundColor: colors.card }]} onPress={handleResetPassword}>
            <Text style={[styles.outlineButtonText, { color: colors.primary }]}>{t('resetPasswordButton')}</Text>
          </TouchableOpacity>

          {isEditingEmail ? (
            <View style={styles.emailEditWrapper}>
              <TextInput 
                style={[GlobalStyles.input, { marginBottom: 10, backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]} 
                placeholderTextColor={colors.secondaryText}
                placeholder={t('newEmailPlaceholder')} 
                value={newEmail} 
                onChangeText={setNewEmail} 
                keyboardType="email-address" 
                autoCapitalize="none" 
              />
              <View style={styles.emailEditButtons}>
                <TouchableOpacity onPress={() => setIsEditingEmail(false)} style={[styles.cancelButton, { backgroundColor: colors.border }]}>
                  <Text style={[styles.cancelButtonText, { color: colors.text }]}>{t('cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleUpdateEmail} style={[styles.saveButton, { backgroundColor: colors.primary }]}>
                  <Text style={styles.saveButtonText}>{t('saveButton')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={[styles.outlineButton, { borderColor: colors.primary, backgroundColor: colors.card }]} onPress={() => setIsEditingEmail(true)}>
              <Text style={[styles.outlineButtonText, { color: colors.primary }]}>{t('changeEmailButton')}</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity 
            style={[styles.outlineButton, { borderColor: colors.border, backgroundColor: colors.card, marginTop: 10 }]} 
            onPress={() => navigation.navigate('About')}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="information-circle-outline" size={20} color={colors.text} style={{ marginRight: 8 }} />
              <Text style={[styles.outlineButtonText, { color: colors.text, marginBottom: 0 }]}>{t('aboutApp')}</Text>
            </View>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutButtonText}>{t('logoutButton')}</Text>
          </TouchableOpacity>

          {/* 🌟 設定画面の最下部（ログアウトボタンの下）に広告を配置 */}
          <AdBanner />

        </View>

        {/* 🌟 Web用の切り取りモーダル */}
        {Platform.OS === 'web' && selectedWebImage && (
          <Modal visible={isCropModalVisible} transparent={true}>
            <View style={styles.modalOverlay}>
              <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
                <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 15, color: colors.text }}>
                  {t('cropImageTitle') || '画像を切り取る'}
                </Text>
                
                <View style={styles.cropContainer}>
                  <Cropper
                    image={selectedWebImage}
                    crop={crop}
                    zoom={zoom}
                    aspect={1} 
                    onCropChange={setCrop}
                    onCropComplete={onCropComplete}
                    onZoomChange={setZoom}
                  />
                </View>

                <View style={styles.modalButtons}>
                  <TouchableOpacity 
                    style={[styles.modalButton, { backgroundColor: colors.border, marginRight: 10 }]} 
                    onPress={() => setIsCropModalVisible(false)}
                  >
                    <Text style={{ color: colors.text, fontWeight: 'bold' }}>{t('cancel') || 'キャンセル'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.modalButton, { backgroundColor: colors.primary }]} 
                    onPress={handleWebCropAndUpload}
                  >
                    <Text style={{ color: '#fff', fontWeight: 'bold' }}>{t('cropAndSave') || '切り取って保存'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: { alignItems: 'center', padding: 20, paddingBottom: 50 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 30 },
  avatarContainer: { position: 'relative', marginBottom: 15 },
  avatar: { width: 120, height: 120, borderRadius: 60, borderWidth: 3 },
  placeholder: { width: 120, height: 120, borderRadius: 60, justifyContent: 'center', alignItems: 'center' },
  placeholderText: { color: '#666', fontSize: 16 },
  editIconContainer: { position: 'absolute', right: 0, bottom: 0, width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 2 },
  editIcon: { color: '#fff', fontSize: 16 },
  instruction: { marginBottom: 20 },
  profileInfoContainer: { alignItems: 'center', marginBottom: 30, paddingVertical: 15, paddingHorizontal: 30, borderRadius: 15, width: '100%', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 2 },
  profileName: { fontSize: 22, fontWeight: 'bold' },
  profileId: { fontSize: 14, marginTop: 5 },
  themeSection: { width: '100%', marginBottom: 30 },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', marginBottom: 10, marginLeft: 5 },
  themeSelectorRow: { flexDirection: 'row', justifyContent: 'space-between' },
  themeOption: { flex: 1, marginHorizontal: 5, paddingVertical: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  actionsContainer: { width: '100%' },
  outlineButton: { borderWidth: 1, paddingVertical: 12, paddingHorizontal: 40, borderRadius: 25, width: '100%', alignItems: 'center', marginBottom: 15 },
  outlineButtonText: { fontSize: 16, fontWeight: 'bold' },
  emailEditWrapper: { width: '100%', marginBottom: 15 },
  emailEditButtons: { flexDirection: 'row', justifyContent: 'space-between' },
  cancelButton: { flex: 1, paddingVertical: 12, alignItems: 'center', marginRight: 5, borderRadius: 25 },
  cancelButtonText: { fontWeight: 'bold' },
  saveButton: { flex: 1, paddingVertical: 12, alignItems: 'center', marginLeft: 5, borderRadius: 25 },
  saveButtonText: { color: '#fff', fontWeight: 'bold' },
  logoutButton: { backgroundColor: '#FF3B30', paddingVertical: 15, paddingHorizontal: 40, borderRadius: 25, width: '100%', alignItems: 'center', marginTop: 15 },
  logoutButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

  // 🌟 Web用モーダルのスタイル
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '90%', maxWidth: 500, padding: 20, borderRadius: 15, alignItems: 'center' },
  cropContainer: { width: '100%', height: 300, position: 'relative', backgroundColor: '#333', borderRadius: 10, overflow: 'hidden', marginBottom: 20 },
  modalButtons: { flexDirection: 'row', width: '100%', justifyContent: 'space-between' },
  modalButton: { flex: 1, padding: 15, alignItems: 'center', borderRadius: 10 },
});