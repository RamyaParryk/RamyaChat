import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, Image, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { apiClient } from '../utils/api';
import { useTheme } from '../contexts/ThemeContext';
import { t } from '../utils/translator';

export default function CallsScreen({ navigation, route }: any) {
  const { theme } = useTheme();
  const { colors } = theme;
  const user = route.params?.user;
  const [calls, setCalls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCalls = async () => {
    try {
      const data = await apiClient.get(`/call-history/${user.username || user._id}`);
      setCalls(data);
    } catch (error) {
      console.error('Call history fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (user) fetchCalls();
    }, [user])
  );

  const renderCallItem = ({ item }: { item: any }) => {
    // 自分が発信者かどうかを判定
    const isCaller = item.caller_id === (user.username || user._id);
    const partnerName = isCaller ? item.receiver_name : item.caller_name;
    const partnerAvatar = isCaller ? item.receiver_avatar : item.caller_avatar;
    const partnerUsername = isCaller ? item.receiver_id : item.caller_id;
    const isMissed = item.status === 'missed' || item.status === 'rejected';

    // 🌟 WhatsApp風の矢印アイコン＆色判定
    let arrowIcon: keyof typeof MaterialIcons.glyphMap = 'call-made';
    let arrowColor = '#4CD964'; // 基本は成功（緑）

    if (isCaller) {
      arrowIcon = 'call-made'; // ↗️ 発信
      if (isMissed) arrowColor = colors.secondaryText; // 相手が出なかった発信はグレー
    } else {
      arrowIcon = 'call-received'; // ↙️ 着信
      if (isMissed) arrowColor = '#FF3B30'; // 不在着信は赤文字で目立たせる
    }

    const callIcon = item.call_type === 'video' ? 'videocam' : 'call';

    return (
      <View style={[styles.callItem, { borderBottomColor: colors.border }]}>
        <Image source={{ uri: partnerAvatar || `${process.env.EXPO_PUBLIC_API_URL}/avatars/default.png` }} style={styles.avatar} />
        
        <View style={styles.callInfo}>
          <Text style={[styles.partnerName, { color: isMissed && !isCaller ? '#FF3B30' : colors.text }]} numberOfLines={1}>
            {partnerName || partnerUsername}
          </Text>
          <View style={styles.subRow}>
            <MaterialIcons name={arrowIcon} size={16} color={arrowColor} style={{ marginRight: 4 }} />
            <Text style={[styles.timeText, { color: colors.secondaryText }]}>
              {new Date(item.created_at).toLocaleString()}
            </Text>
          </View>
        </View>

        {/* 右側：ワンタップでチャット（または通話）画面へ */}
        <TouchableOpacity style={styles.actionIcon} onPress={() => {
          navigation.navigate('Chat', {
             user: user,
             chatPartner: { username: partnerUsername, displayName: partnerName, avatar: partnerAvatar },
             autoStartCall: item.call_type
          });
        }}>
          <Ionicons name={callIcon} size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>
    );
  };

  if (loading) {
    return <View style={[styles.centered, { backgroundColor: colors.background }]}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={calls}
        keyExtractor={item => item.id.toString()}
        renderItem={renderCallItem}
        contentContainerStyle={{ paddingBottom: 20 }}
        ListEmptyComponent={
          <Text style={[styles.emptyText, { color: colors.secondaryText }]}>
            {t('noCallHistory') || '通話履歴がありません'}
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  callItem: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar: { width: 50, height: 50, borderRadius: 25, marginRight: 15 },
  callInfo: { flex: 1, justifyContent: 'center' },
  partnerName: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  subRow: { flexDirection: 'row', alignItems: 'center' },
  timeText: { fontSize: 14 },
  actionIcon: { padding: 10, marginLeft: 10 },
  emptyText: { textAlign: 'center', marginTop: 50, fontSize: 16 }
});