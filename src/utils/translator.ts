import * as Localization from 'expo-localization';
import translations from './translations.json';

const locales = Localization.getLocales();
const deviceLang = locales.length > 0 ? locales[0].languageCode : 'en';

// 🌟 JSONファイルに存在する言語キー（ja, en, fr...）を型として自動抽出
type LangCode = keyof typeof translations;
type TranslationKeys = keyof typeof translations.ja;

// 🌟 アプリの現在の言語を保持する変数
// 初期値：スマホの言語がJSONに存在すればそれ、無ければ 'en'
let currentLanguage: LangCode = (deviceLang && deviceLang in translations) 
  ? (deviceLang as LangCode) 
  : 'en';

// 🌟 LanguageContext.tsx から呼ばれる「手動切り替え」用の関数
export const setAppLanguage = (lang: string) => {
  // 渡された言語が translations の中にあるか安全にチェックして上書き
  if (lang in translations) {
    currentLanguage = lang as LangCode;
  }
};

export const t = (key: TranslationKeys): string => {
  // 🌟 デバイスの言語ではなく、currentLanguage を基準に翻訳を返す
  return translations[currentLanguage][key] || translations['en'][key];
};