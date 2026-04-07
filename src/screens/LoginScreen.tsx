// src/screens/LoginScreen.tsx
import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View, ActivityIndicator, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { io } from 'socket.io-client'; // 🌟 これを追加！

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
          let userDoc = await getDoc(doc(db, "users", user.uid));
          let userData = userDoc.data();

          // 🌟 罠②対策：新規登録時、Firestoreへの書き込みが遅れてフライングするのを防ぐ
          if (!userData) {
            console.log("⏳ Firestoreの準備待ち...");
            await new Promise(resolve => setTimeout(resolve, 1500)); // 1.5秒待機
            userDoc = await getDoc(doc(db, "users", user.uid));
            userData = userDoc.data();
          }

          const finalAvatar = userData?.avatar || `${process.env.EXPO_PUBLIC_API_URL}/avatars/default.png`;
          const userPayload = { 
            _id: user.uid, 
            name: user.displayName || 'No Name', 
            username: userData?.username || '', 
            avatar: finalAvatar 
          };

          // 🌟 罠①対策：ログイン検知直後に一瞬だけサーバーに合図を送り、確実にDBへ実体化させる！
          // これで「トーク画面を踏むまで追加できない」ポンコツ仕様が消滅します
          try {
            const socketUrl = process.env.EXPO_PUBLIC_API_URL || 'https://chat.tomato-juice.biz';
            const tempSocket = io(socketUrl, { transports: ['websocket'] });
            
            console.log(`🚀 自動実体化リクエスト送信: ${userPayload.username}`);
            tempSocket.emit('user_online', userPayload);
            
            // 3秒後に静かに切断（HomeScreenのSocketと喧嘩しないようにバトンタッチ）
            setTimeout(() => tempSocket.disconnect(), 3000);
          } catch (err) {
            console.log("❌ Socket emit error:", err);
          }

          navigation.replace('MainTabs', { user: userPayload });
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
    console.log("🔘 パスワードリセットボタンが押されました！ Email:", email);
    if (!email) {
      if (Platform.OS === 'web') {
        window.alert(t('enterEmailForReset'));
      } else {
        Alert.alert(t('notice'), t('enterEmailForReset'));
      }
      return;
    }

    try {
      console.log("⏳ Firebaseへ送信処理開始...");
      await sendPasswordResetEmail(auth, email);
      console.log("✅ 送信成功！");

      if (Platform.OS === 'web') {
        window.alert(t('resetEmailSent'));
      } else {
        Alert.alert(t('success'), t('resetEmailSent'));
      }
    } catch (error: any) {
      console.error("❌ 送信エラー発生:", error);

      if (Platform.OS === 'web') {
        window.alert(`${t('error')}: ${t('resetPasswordError')}`);
      } else {
        Alert.alert(t('error'), t('resetPasswordError'));
      }
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
        
        <View style={styles.passwordInputContainer}>
          <TextInput 
            style={[GlobalStyles.input, styles.passwordInput, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]} 
            placeholder="••••••" 
            placeholderTextColor={colors.secondaryText}
            value={password} 
            onChangeText={setPassword} 
            secureTextEntry={!isPasswordVisible} 
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
  
  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  passwordInput: {
    flex: 1,
    paddingRight: 50, 
  },
  eyeIcon: {
    position: 'absolute',
    right: 15, 
  },

  forgotPasswordButton: { marginTop: 15, alignItems: 'center' },
  forgotPasswordText: { fontSize: 14, textDecorationLine: 'underline' },
  switchButton: { marginTop: 30, alignItems: 'center' },
  switchText: { fontSize: 14, fontWeight: 'bold' },
});