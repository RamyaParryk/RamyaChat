import React, { useEffect } from 'react';
import { Platform, View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAdUnitId } from '../utils/adsConfig';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';

export default function AdBanner() {
  const adId = getAdUnitId();
  const insets = useSafeAreaInsets();

  if (Platform.OS === 'web') {
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
          style={{ display: 'block', width: '100%', height: '50px' }}
          data-ad-client={adId}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      </View>
    );
  }

  // 📱 iOS / Android の場合（本物の広告処理）
const mobileAdUnitId = __DEV__ ? TestIds.BANNER : (adId || '');

  return (
    <View style={[styles.container, { 
      marginBottom: 0,
      backgroundColor: 'transparent', 
      borderWidth: 0, 
    }]}>
      {/* 🌟 mobileAdUnitId がある時だけ広告を描画する */}
      {mobileAdUnitId !== '' && (
        <BannerAd
          unitId={mobileAdUnitId}
          size={BannerAdSize.BANNER}
          requestOptions={{
            requestNonPersonalizedAdsOnly: true,
          }}
        />
      )}
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
  text: {
    color: '#888',
    fontSize: 12,
  },
});