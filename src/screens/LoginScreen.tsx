// src/screens/LoginScreen.tsx
import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View, ActivityIndicator, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail
} from 'firebase/auth';

import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';

import { auth, db } from '../utils/firebaseConfig';
import { t } from '../utils/translator';
import { GlobalStyles } from '../styles/GlobalStyles';
import * as SecureStore from 'expo-secure-store';

import { useTheme } from '../contexts/ThemeContext';

// @ts-ignore
export default function LoginScreen({ navigation }) {
  const { theme } = useTheme();
  const { colors } = theme;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState(''); 
  const [isRegistering, setIsRegistering] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  useEffect(() => {
    const loadSavedCredentials = async () => {
      try {
        let savedEmail = null;
        let savedPassword = null;

        if (Platform.OS === 'web') {
          savedEmail = localStorage.getItem('saved_email');
          savedPassword = localStorage.getItem('saved_password');
        } else {
          savedEmail = await SecureStore.getItemAsync('saved_email');
          savedPassword = await SecureStore.getItemAsync('saved_password');
        }

        if (savedEmail) setEmail(savedEmail);
        if (savedPassword) setPassword(savedPassword);
      } catch (error) {
        console.error('金庫からの読み込みエラー:', error);
      }
    };
    loadSavedCredentials();

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, "users", user.uid));
          const userData = userDoc.data();

          const finalAvatar = userData?.avatar || `${process.env.EXPO_PUBLIC_API_URL}/avatars/default.png`;

          navigation.replace('MainTabs', { 
            user: { 
              _id: user.uid, 
              name: user.displayName || 'No Name', 
              username: userData?.username || '', 
              avatar: finalAvatar 
            } 
          });
        } catch (error) {
          console.error("ユーザー情報の取得に失敗しました:", error);
          setLoading(false); 
        }
      } else {
        setLoading(false); 
      }
    });

    return unsubscribe;
  }, [navigation]);

  const handleAuth = async () => {
    if (!email || !password) return;
    setLoading(true);

    try {
      if (isRegistering) {
        if (!username) {
          Alert.alert(t('error') || "エラー", t('errorMissingUserId') || "ユーザーID (@ID) を入力してね！");
          setLoading(false);
          return;
        }
        const usernameRegex = /^[a-zA-Z0-9_]+$/;
        if (!usernameRegex.test(username)) {
          Alert.alert(t('error') || "エラー", t('errorInvalidUserId') || "ユーザーIDは半角英数字とアンダーバー(_)のみ使えます");
          setLoading(false);
          return;
        }

        const usersRef = collection(db, "users");
        const q = query(usersRef, where("username", "==", username)); 
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          Alert.alert(t('error') || "エラー", t('errorUserIdTaken') || "その @ID はすでに誰かが使っているみたい。別のIDにしてね！");
          setLoading(false);
          return;
        }

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        await updateProfile(user, { displayName: displayName });

        await setDoc(doc(db, "users", user.uid), {
          uid: user.uid,
          email: user.email,
          displayName: displayName,
          username: username, 
          createdAt: new Date().toISOString(),
        });
        
        await SecureStore.setItemAsync('saved_email', email);
        await SecureStore.setItemAsync('saved_password', password);

        Alert.alert(t('success') || "成功", t('successAccountCreated') || "アカウントと @ID を登録したわよ！");
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        
        if (Platform.OS === 'web') {
          localStorage.setItem('saved_email', email);
          localStorage.setItem('saved_password', password);
        } else {
          await SecureStore.setItemAsync('saved_email', email);
          await SecureStore.setItemAsync('saved_password', password);
        }
      }
    } catch (error: any) {
      Alert.alert(t('error') || "エラー", error.message);
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      Alert.alert(t('notice') || "お知らせ", t('enterEmailForReset'));
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      Alert.alert(t('success') || "成功", t('resetEmailSent'));
    } catch (error: any) {
      Alert.alert(t('error') || "エラー", error.message);
    }
  };

  if (loading) {
    return (
      <View style={[GlobalStyles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[GlobalStyles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>RamyaChat</Text>
      
      <View style={styles.inputWrapper}>
        {isRegistering && (
          <>
            <Text style={[GlobalStyles.label, { color: colors.secondaryText }]}>{t('nameLabel')}</Text>
            <TextInput 
              style={[GlobalStyles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]} 
              placeholder={t('namePlaceholder')} 
              placeholderTextColor={colors.secondaryText}
              value={displayName} 
              onChangeText={setDisplayName} 
            />

            <Text style={[GlobalStyles.label, { color: colors.secondaryText }]}>{t('userIdLabel')}</Text>
            <TextInput 
              style={[GlobalStyles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]} 
              placeholder={t('userIdPlaceholder')} 
              placeholderTextColor={colors.secondaryText}
              value={username} 
              onChangeText={setUsername} 
              autoCapitalize="none" 
            />
          </>
        )}

        <Text style={[GlobalStyles.label, { color: colors.secondaryText }]}>{t('emailLabel')}</Text>
        <TextInput 
          style={[GlobalStyles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]} 
          placeholder="email@example.com" 
          placeholderTextColor={colors.secondaryText}
          value={email} 
          onChangeText={setEmail} 
          keyboardType="email-address" 
          autoCapitalize="none" 
        />

        <Text style={[GlobalStyles.label, { color: colors.secondaryText }]}>{t('passwordLabel')}</Text>
        
        {/* 🌟 目のマークを配置するためのレイアウト変更 */}
        <View style={styles.passwordInputContainer}>
          <TextInput 
            style={[GlobalStyles.input, styles.passwordInput, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]} 
            placeholder="••••••" 
            placeholderTextColor={colors.secondaryText}
            value={password} 
            onChangeText={setPassword} 
            secureTextEntry={!isPasswordVisible} // 🌟 フラグによって表示/非表示を切り替え
          />
          <TouchableOpacity 
            style={styles.eyeIcon} 
            onPress={() => setIsPasswordVisible(!isPasswordVisible)}
          >
            <Ionicons 
              name={isPasswordVisible ? "eye-off" : "eye"} 
              size={24} 
              color={colors.secondaryText} 
            />
          </TouchableOpacity>
        </View>

        <Text style={[GlobalStyles.hint, { color: colors.secondaryText }]}>{t('passwordHint')}</Text>
      </View>

      <TouchableOpacity style={[GlobalStyles.button, { backgroundColor: colors.primary, marginTop: 20 }]} onPress={handleAuth}>
        <Text style={[GlobalStyles.buttonText, { color: colors.primaryText }]}>
          {isRegistering ? t('createAccount') : t('loginButton')}
        </Text>
      </TouchableOpacity>

      {!isRegistering && (
        <TouchableOpacity style={styles.forgotPasswordButton} onPress={handleForgotPassword}>
          <Text style={[styles.forgotPasswordText, { color: colors.secondaryText }]}>{t('forgotPassword')}</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity onPress={() => setIsRegistering(!isRegistering)} style={styles.switchButton}>
        <Text style={[styles.switchText, { color: colors.primary }]}>
          {isRegistering ? t('alreadyHaveAccount') : t('needAccount')}
        </Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 36, fontWeight: 'bold', marginBottom: 40 }, 
  inputWrapper: { width: '100%', marginBottom: 10 },
  
  // 🌟 パスワード入力欄と目のアイコン用のスタイル
  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  passwordInput: {
    flex: 1,
    paddingRight: 50, // アイコンがテキストに重ならないように余白を確保
  },
  eyeIcon: {
    position: 'absolute',
    right: 15, // 右端から少し離して配置
  },

  forgotPasswordButton: { marginTop: 15, alignItems: 'center' },
  forgotPasswordText: { fontSize: 14, textDecorationLine: 'underline' },
  switchButton: { marginTop: 30, alignItems: 'center' },
  switchText: { fontSize: 14, fontWeight: 'bold' },
});