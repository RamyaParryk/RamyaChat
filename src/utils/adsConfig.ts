import { Platform } from 'react-native';

/**
 * 実行環境(OS)を自動判別して、対応する広告IDを返します。
 */
export const getAdUnitId = (): string | undefined => {
  if (Platform.OS === 'ios') {
    return process.env.EXPO_PUBLIC_AD_UNIT_ID_IOS;
  }
  if (Platform.OS === 'android') {
    return process.env.EXPO_PUBLIC_AD_UNIT_ID_ANDROID;
  }
  if (Platform.OS === 'web') {
    return process.env.EXPO_PUBLIC_AD_CLIENT_ID_WEB;
  }
  return undefined;
};