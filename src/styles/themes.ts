// 🌟 テーマ（スキン）の色を1か所で管理するファイル

import { DefaultTheme, DarkTheme } from '@react-navigation/native';

// 全テーマ共通のカラー定義（ブランドカラーなど）
const palette = {
  purplePrimary: '#A020F0', // Ramyaちゃんの髪色から抽出したパープル
  purpleLight: '#D8BFD8',
  purpleDark: '#4B0082',
  skyBlue: '#007AFF', // 標準のiOS風ブルー
  dangerRed: '#FF3B30',
  mintGreen: '#98FB98', // 女の子の制服の襟元から抽出
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

// 👗 テーマの種類を定義
export type ThemeType = 'light' | 'dark' | 'purple_ramya';

// React Navigationの標準テーマを継承してカスタムテーマを作成
export const Themes: Record<ThemeType, typeof DefaultTheme & { colors: AppThemeColors }> = {
  // 1️⃣ 標準：ライトテーマ（スクリーンショットに近い設定）
  light: {
    ...DefaultTheme,
    dark: false,
    colors: {
      ...DefaultTheme.colors,
      background: '#F2F2F7', // image_6.png の少しグレーがかった白
      card: '#ffffff', // image_7.png のトークリストの白
      text: '#000000', // 標準の黒テキスト
      primary: palette.skyBlue, // 標準の青ボタン
      primaryText: '#ffffff',
      border: '#C7C7CC', // 薄いグレーの線
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

  // 3️⃣ スペシャルスキン：「Ramya Purple」（キャラクターモチーフ）
  purple_ramya: {
    ...DarkTheme,
    dark: true,
    colors: {
      ...DarkTheme.colors,
      background: '#000000', // Ramyaちゃんが際立つ黒（image_5.pngの背景）
      card: '#121212', // 深い紫を帯びた黒（カード用）
      text: '#E6E6FA', // ほんのり紫を帯びた白
      primary: palette.purplePrimary, // Ramyaパープル
      primaryText: '#ffffff',
      border: palette.purpleDark, // 深い紫の線
      notification: palette.dangerRed,
      secondaryText: '#A9A9A9',
      chatBubbleSelf: palette.purplePrimary,
      chatBubblePartner: '#3A3A3C',
    },
  },
};