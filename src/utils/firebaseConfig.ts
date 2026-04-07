import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
// 🌟 エラーを回避するため、auth全体をまとめてインポート！
import * as firebaseAuth from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);

let auth: firebaseAuth.Auth;

if (Platform.OS === 'web') {
  // Webブラウザの場合は標準の getAuth を使う
  auth = firebaseAuth.getAuth(app);
} else {
  // 🌟 ここはFirebase側の型バグを回避するため、あえて `as any` を使って突破
  const reactNativePersistence = (firebaseAuth as any).getReactNativePersistence;
  auth = firebaseAuth.initializeAuth(app, {
    persistence: reactNativePersistence(AsyncStorage)
  });
}

const db = getFirestore(app);
const storage = getStorage(app);

// 対応している環境（Webブラウザなど）の時だけAnalyticsを起動する
isSupported().then((supported) => {
  if (supported) {
    const analytics = getAnalytics(app);
  }
});

export { auth, db, storage };