import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, Image, StyleSheet, ActivityIndicator, TextInput } from 'react-native'; 
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native'; 
import { io } from 'socket.io-client'; 

import { Ionicons } from '@expo/vector-icons';
import { t } from '../utils/translator';
import { useTheme } from '../contexts/ThemeContext';
import { apiClient } from '../utils/api';
import AdBanner from '../components/AdBanner';

// @ts-ignore
const socket = io(process.env.EXPO_PUBLIC_API_URL, { autoConnect: false });

// @ts-ignore
export default function HomeScreen({ route, navigation }) {
  const { theme } = useTheme();
  const { colors } = theme;
  const { user: currentUser } = route.params; 
  const [dmList, setDmList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const fetchDMList = async () => {
    if (!currentUser?.username) return;
    setLoading(true); 
    try {
      const data = await apiClient.get(`/dm-list/${currentUser.username}`);
      setDmList(data);
    } catch (err) {
      console.error('DMリスト取得エラー:', err);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchDMList();
    }, [currentUser?.username])
  );

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);

    const delayDebounceFn = setTimeout(async () => {
      try {
        const data = await apiClient.get(`/search-messages?currentUsername=${currentUser.username}&q=${encodeURIComponent(searchQuery)}`);
        setSearchResults(data);
      } catch (err) {
        console.error('検索エラー:', err);
      } finally {
        setIsSearching(false);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, currentUser.username]);

  useEffect(() => {
    socket.connect();
    socket.on('receive_message', () => fetchDMList());
    socket.on('dm_list_update', () => fetchDMList());

    return () => {
      socket.off('receive_message');
      socket.off('dm_list_update');
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={() => navigation.navigate('Settings')} style={{ marginRight: 15 }}>
          <Ionicons name="ellipsis-vertical" size={26} color={colors.text} />
        </TouchableOpacity>
      ),
      headerLeft: () => null, 
    });
  }, [navigation, colors.text]);

  const renderItem = ({ item }: { item: any }) => {
    const isSearchResult = searchQuery.length > 0;
    const partner = item.user;
    
    const unreadCount = !isSearchResult ? (item.unread || 0) : 0;
    const timeStringRaw = isSearchResult ? item.timestamp : item.last_time;
    const timeString = timeStringRaw ? new Date(timeStringRaw).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

    let displayMessage = '';
    if (isSearchResult) {
      const prefix = item.sender_name === currentUser.displayName ? t('youPrefix') : `${item.sender_name}: `;
      displayMessage = `${prefix}${item.text || ''}`;
    } else {
      displayMessage = item.last_message === '__IMAGE__' ? t('imageSentMessage') : item.last_message === '__FILE__' ? t('fileSentMessage') : (item.last_message || t('noMessagesYet'));
    }

    return (
      <TouchableOpacity
        style={[styles.userItem, { backgroundColor: colors.background, borderBottomColor: colors.border }]}
        onPress={() => {
          navigation.navigate('Chat', {
            user: currentUser,
            roomId: item.room_id,
            chatPartner: { username: partner.username, displayName: partner.display_name, avatar: partner.avatar },
            targetMessageId: isSearchResult ? item.message_id : null
          });
        }}
      >
      <Image source={{ uri: partner.avatar || `${process.env.EXPO_PUBLIC_API_URL}/avatars/default.png` }} style={styles.avatar} />
        <View style={styles.userInfo}>
          <View style={styles.nameTimeRow}>
            <Text style={[styles.userName, { color: colors.text }]} numberOfLines={1}>{partner.display_name}</Text>
            <Text style={[styles.timeText, { color: colors.secondaryText }]}>{timeString}</Text>
          </View>
          <View style={styles.messageRow}>
            <Text style={[styles.lastMessage, { color: colors.secondaryText }]} numberOfLines={isSearchResult ? 2 : 1}>
              {displayMessage}
            </Text>
            {!isSearchResult && unreadCount > 0 && (
              <View style={[styles.badge, { backgroundColor: colors.notification }]}>
                <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom', 'left', 'right']}>
      
      <View style={[styles.searchContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Ionicons name="search" size={20} color={colors.secondaryText} style={styles.searchIcon} />
        <TextInput 
          style={[styles.searchInput, { color: colors.text }]} 
          placeholderTextColor={colors.secondaryText}
          placeholder={t('searchChatPlaceholder')} 
          value={searchQuery} 
          onChangeText={setSearchQuery} 
          autoCapitalize="none" 
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color={colors.secondaryText} />
          </TouchableOpacity>
        )}
      </View>

      {searchQuery.length > 0 && isSearching ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 50 }} />
      ) : loading && dmList.length === 0 && searchQuery.length === 0 ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={searchQuery.length > 0 ? searchResults : dmList} 
          keyExtractor={(item) => searchQuery.length > 0 ? item.message_id : item.room_id} 
          renderItem={renderItem}
          style={styles.list}
          ListEmptyComponent={
            <Text style={[styles.emptyText, { color: colors.secondaryText }]}>
              {searchQuery.length > 0 ? t('searchNoResult') : t('noMessagesYet')}
            </Text>
          }
        />
      )}

      {/* 🌟 画面の一番下に広告を配置*/}
      <AdBanner />
      
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 }, 
  searchContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    margin: 15, 
    paddingHorizontal: 12, 
    paddingVertical: 10, 
    borderRadius: 10, 
    borderWidth: 1 
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 16, padding: 0 }, 

  list: { flex: 1, width: '100%' }, 
  userItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, paddingHorizontal: 20, borderBottomWidth: 1 },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#ccc', marginRight: 15 },
  userInfo: { flex: 1, justifyContent: 'center' }, 
  nameTimeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  userName: { fontSize: 16, fontWeight: 'bold', flex: 1 },
  timeText: { fontSize: 12, marginLeft: 10 },
  messageRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lastMessage: { fontSize: 14, flex: 1, paddingRight: 10, lineHeight: 20 },
  badge: { minWidth: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6, marginLeft: 10 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  emptyText: { textAlign: 'center', marginTop: 50 },
});