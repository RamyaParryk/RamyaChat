import React, { useEffect } from 'react';
import { Platform, View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAdUnitId } from '../utils/adsConfig';

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
  // 📱 iOS / Android の場合は今のところダミーのまま
  return (
    <View style={[styles.container, { marginBottom: Math.max(insets.bottom, 10) }]}>
      <Text style={styles.text}>{Platform.OS}版広告 (ID: {adId})</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  container: {
    height: 50,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    overflow: 'hidden', // 広告がはみ出さないように
  },
  text: {
    color: '#888',
    fontSize: 12,
  },
});