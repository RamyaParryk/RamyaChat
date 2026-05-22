// 🌟 テーマ（スキン）の色を1か所で管理するファイル

import { DefaultTheme, DarkTheme } from '@react-navigation/native';

// 全テーマ共通のカラー定義（ブランドカラーなど）
const palette = {
  purplePrimary: '#A020F0', // Ramyaの髪色
  purpleLight: '#D8BFD8',
  purpleDark: '#4B0082',
  skyBlue: '#007AFF', // 標準のiOS風ブルー
  dangerRed: '#FF3B30',
  mintGreen: '#98FB98', // 服の襟元から抽出
  darkBg: '#121212', // ダークモード用の少し柔らかい黒
};

// コンポーネントが使用するカラー変数の定義（インターフェース）
export interface AppThemeColors {
  background: string;
  card: string;
  text: string;
  border: string;
  notification: string;
  primary: string; // メインアクションカラー
  primaryText: string; // プライマリカラー上のテキスト色
  secondaryText: string;
  chatBubbleSelf: string; // 自分の吹き出し色
  chatBubblePartner: string; // 相手の吹き出し色
}

// 👗 テーマの種類を定義（yellowを追加！）
export type ThemeType = 'light' | 'dark' | 'purple_ramya' | 'yellow';

// React Navigationの標準テーマを継承してカスタムテーマを作成
export const Themes: Record<ThemeType, typeof DefaultTheme & { colors: AppThemeColors }> = {
  // 1️⃣ 標準：ライトテーマ
  light: {
    ...DefaultTheme,
    dark: false,
    colors: {
      ...DefaultTheme.colors,
      background: '#F2F2F7', 
      card: '#ffffff', 
      text: '#000000', 
      primary: palette.skyBlue, 
      primaryText: '#ffffff',
      border: '#C7C7CC', 
      notification: palette.dangerRed,
      secondaryText: '#8E8E93',
      chatBubbleSelf: palette.skyBlue,
      chatBubblePartner: '#E5E5EA',
    },
  },

  // 2️⃣ 標準：ダークテーマ（OS標準のダークモード準拠）
  dark: {
    ...DarkTheme,
    dark: true,
    colors: {
      ...DarkTheme.colors,
      background: palette.darkBg, // 深い黒
      card: '#1C1C1E', // 少し明るい黒（カード型UI用）
      text: '#ffffff', // 白テキスト
      primary: palette.skyBlue, // 青ボタン
      primaryText: '#ffffff',
      border: '#38383A', // ダークモード用のグレー線
      notification: palette.dangerRed,
      secondaryText: '#8E8E93',
      chatBubbleSelf: palette.skyBlue,
      chatBubblePartner: '#2C2C2E',
    },
  },

  // 3️⃣ スペシャルスキン
  purple_ramya: {
    ...DarkTheme,
    dark: true,
    colors: {
      ...DarkTheme.colors,
      background: '#1A0B2E', // ダークよりさらに深みのある紫ベース
      card: '#2D1B4E', 
      text: '#FFFFFF', 
      primary: '#B388FF', 
      primaryText: '#ffffff',
      border: '#4A327C', 
      notification: palette.dangerRed,
      secondaryText: '#D1C4E9',
      chatBubbleSelf: '#6200EA',
      chatBubblePartner: '#311B5E',
    },
  },

  // 4️⃣ スペシャルスキン：「Yellow」
  yellow: {
    ...DefaultTheme,
    dark: false,
    colors: {
      ...DefaultTheme.colors,
      background: '#FFFDE7', // ほんのり黄色い背景
      card: '#FFFFFF', 
      text: '#333333', 
      primary: '#F57F17', // オレンジイエローのボタン
      primaryText: '#000000', // ボタン上の文字は読みやすく黒に
      border: '#FFF59D', 
      notification: palette.dangerRed,
      secondaryText: '#757575',
      chatBubbleSelf: '#FBC02D',
      chatBubblePartner: '#FFF9C4',
    }
  }
};