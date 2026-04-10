// components/AdBanner.tsx
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { getAdUnitId } from '../utils/adsConfig';
// 🌟 スマホ版なので堂々とインポートしてOK！
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';

export default function AdBanner() {
  const adId = getAdUnitId();
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
});