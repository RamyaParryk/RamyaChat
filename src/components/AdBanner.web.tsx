import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAdUnitId } from '../utils/adsConfig';

// 🌟 Web版ではエラーになるので react-native-google-mobile-ads を絶対にインポートしない！

export default function AdBanner() {
  const adId = getAdUnitId();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    // コンポーネントが画面に表示されたら、Googleに「広告をちょうだい！」とリクエストを送る
    try {
      // @ts-ignore
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      console.error("AdSense error:", e);
    }
  }, []);

  return (
    <View style={[styles.container, { marginBottom: Math.max(insets.bottom, 10) }]}>
      {/* data-ad-client に .env の値（ca-pub-...）が自動で入る */}
<ins 
          className="adsbygoogle"
          // 🌟 1. 高さを明確に指定する（50px〜90pxくらいが標準）
          style={{ display: 'inline-block', width: '100%', height: '60px' }}
          data-ad-client={adId}
          // 🌟 2. auto をやめて、horizontal（横長）に固定する
          data-ad-format="horizontal"
          // 🌟 3. 勝手に縦に伸びるのを防ぐために false にする
          data-full-width-responsive="false"
        />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    width: '100%',
    overflow: 'hidden',
  },
});