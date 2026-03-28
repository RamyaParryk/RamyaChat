import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, FlatList, TouchableOpacity, Image, Alert, Modal, TouchableWithoutFeedback, Platform, Button, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { t } from '../utils/translator';
import { useFocusEffect } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import QRCode from 'react-native-qrcode-svg';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';

// 🌟 APIクライアントとテーマシステムをインポート！
import { apiClient } from '../utils/api';
import { useTheme } from '../contexts/ThemeContext';

// 🌟 通知の受け取り設定
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true, 
    shouldShowBanner: true, 
    shouldShowList: true,   
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function FriendsScreen({ route, navigation }: any) {
  const { theme } = useTheme();
  const { colors } = theme;

  const { user } = route.params || {};
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [friends, setFriends] = useState<any[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<any[]>([]);
  
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<any>(null);

  const [isQrModalVisible, setIsQrModalVisible] = useState(false);
  const [qrMode, setQrMode] = useState<'show' | 'scan'>('show');
  
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);

  useEffect(() => {
    registerForPushNotificationsAsync().then(token => {
      if (token) {
        apiClient.post('/update-push-token', { username: user.username, token: token })
          .then(() => console.log(`✅ ${user.username} のプッシュトークンをDBに保存しました！`))
          .catch(err => console.error("❌ トークン送信エラー:", err));
      }
    });
  }, [user.username]);

  useEffect(() => {
    if (isQrModalVisible && qrMode === 'scan') {
      if (!permission?.granted && permission?.canAskAgain) {
        requestPermission();
      }
      const timer = setTimeout(() => setIsCameraReady(true), 300);
      return () => clearTimeout(timer);
    } else {
      setIsCameraReady(false);
    }
  }, [isQrModalVisible, qrMode, permission]);

  const fetchFriends = useCallback(async () => {
    try {
      const data = await apiClient.get(`/friends/${user.username}`);
      setFriends(data.friends || []);
      setPendingRequests(data.pendingRequests || []);
      setBlockedUsers(data.blockedUsers || []); 
    } catch (error) {
      console.error('友達リスト取得エラー:', error);
    }
  }, [user.username]);

  useFocusEffect(useCallback(() => { fetchFriends(); }, [fetchFriends]));

  const sortedFriends = [...friends].sort((a, b) => {
    if (a.is_favorite === b.is_favorite) return 0;
    return a.is_favorite ? -1 : 1;
  });

  const toggleFavorite = async (friend: any) => {
    const newFavoriteStatus = !friend.is_favorite;
    setFriends(prev => prev.map(f => f.username === friend.username ? { ...f, is_favorite: newFavoriteStatus } : f));
    try {
      await apiClient.post('/toggle-favorite', { username: user.username, targetUsername: friend.username, isFavorite: newFavoriteStatus });
    } catch (error) { fetchFriends(); }
  };

  const handleSearch = async (text: string) => {
    setSearchQuery(text);
    if (text.length === 0) return setSearchResults([]);
    try {
      const data = await apiClient.get(`/search-users?q=${text}&currentUsername=${user.username}`);
      setSearchResults(data);
    } catch (error) { console.error('検索エラー:', error); }
  };

  const handleBarCodeScanned = ({ type, data }: any) => {
    setScanned(true);
    setIsQrModalVisible(false); 
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSearchQuery(data);
    handleSearch(data);
  };

  const sendFriendRequest = async (targetUsername: string) => {
    try {
      await apiClient.post('/friend-request', { fromUsername: user.username, toUsername: targetUsername });
      Alert.alert(t('success') || '成功', t('requestSent') || 'リクエストを送信しました');
      setSearchQuery(''); setSearchResults([]);
    } catch (error) { console.error('リクエスト送信エラー:', error); }
  };

  const respondToRequest = async (targetUsername: string, action: 'accepted' | 'rejected') => {
    try {
      await apiClient.post('/friend-respond', { fromUsername: targetUsername, toUsername: user.username, action });
      fetchFriends(); 
    } catch (error) { console.error('レスポンスエラー:', error); }
  };

  const manageFriend = async (action: 'deleted' | 'blocked' | 'unblocked', friendToUse: any = selectedFriend) => {
    if (!friendToUse) return;
    setIsMenuVisible(false); 
    try {
      await apiClient.post('/friend-manage', { currentUsername: user.username, targetUsername: friendToUse.username, action });
      fetchFriends(); 
    } catch (error) {}
  };

  const navigateToChat = (friend: any) => {
    navigation.navigate('Chat', { user, chatPartner: { username: friend.username, displayName: friend.display_name, avatar: friend.avatar_url } });
  };

  const openMenu = (friend: any) => {
    setSelectedFriend(friend);
    setIsMenuVisible(true);
  };

  const confirmUnblock = (friend: any) => {
    setSelectedFriend(friend); 
    if (Platform.OS === 'web') {
      if (window.confirm(t('confirmUnblock') || 'このユーザーのブロックを解除しますか？')) manageFriend('unblocked', friend); 
    } else {
      Alert.alert(t('unblockUser') || 'ブロック解除', t('confirmUnblock') || 'このユーザーのブロックを解除しますか？', [
        { text: t('cancel') || 'キャンセル', style: 'cancel' },
        { text: t('unblockUser') || 'ブロック解除', onPress: () => manageFriend('unblocked', friend) } 
      ]);
    }
  };

  // 🌟 アバターURLを安全に生成・補正するヘルパー関数を追加！
  const getAvatarUri = (url?: string) => {
    if (!url) return `${process.env.EXPO_PUBLIC_API_URL}/avatars/default.png`;
    if (url.startsWith('http')) return url;
    return `${process.env.EXPO_PUBLIC_API_URL}${url.startsWith('/') ? '' : '/'}${url}`;
  };

  /* ================= UIパーツの描画 ================= */

  const renderUserItem = ({ item }: { item: any }, type: 'search' | 'friend' | 'blocked') => (
    <TouchableOpacity 
      style={[styles.userCard, { backgroundColor: colors.card }, type === 'blocked' && { opacity: 0.6 }]} 
      onPress={() => {
        if (type === 'friend') navigateToChat(item);
        if (type === 'blocked') confirmUnblock(item); 
      }} 
      onLongPress={() => { if (type === 'friend') openMenu(item); }}
      disabled={type === 'search'} 
    >
      {/* 🌟 ヘルパー関数を使って安全に画像を表示 */}
      <Image source={{ uri: getAvatarUri(item.avatar_url) }} style={styles.avatar} />
      <View style={styles.userInfo}>
        <Text style={[styles.userName, { color: colors.text }]}>{item.display_name || item.username}</Text>
        <Text style={[styles.userId, { color: colors.secondaryText }]}>@{item.username}</Text>
      </View>
      {type === 'friend' && (
        <TouchableOpacity style={styles.favoriteButton} onPress={() => toggleFavorite(item)}>
          <Ionicons name={item.is_favorite ? "star" : "star-outline"} size={24} color={item.is_favorite ? "#FFD700" : colors.secondaryText} />
        </TouchableOpacity>
      )}
      {type === 'search' && (
        <TouchableOpacity style={[styles.addButton, { backgroundColor: colors.primary }]} onPress={() => sendFriendRequest(item.username)}>
          <Text style={[styles.addButtonText, { color: colors.primaryText }]}>{t('addFriend') || '追加'}</Text>
        </TouchableOpacity>
      )}
      {type === 'blocked' && <View style={[styles.blockedBadge, { backgroundColor: colors.border }]}><Text style={[styles.blockedBadgeText, { color: colors.text }]}>{t('blockedBadge') || 'Blocked'}</Text></View>}
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.searchContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Ionicons name="search" size={20} color={colors.secondaryText} style={styles.searchIcon} />
        <TextInput 
          style={[styles.searchInput, { color: colors.text }]} 
          placeholderTextColor={colors.secondaryText}
          placeholder={t('searchID') || 'ユーザーIDで検索...'} 
          value={searchQuery} 
          onChangeText={handleSearch} 
          autoCapitalize="none" 
        />
        
        <TouchableOpacity style={styles.qrButton} onPress={() => { 
          setScanned(false); 
          setIsQrModalVisible(true); 
          console.log("📸 Camera Permission State:", permission);
        }}>
          <Ionicons name="qr-code-outline" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {searchQuery.length > 0 ? (
        <FlatList data={searchResults} keyExtractor={item => item.username} renderItem={(props) => renderUserItem(props, 'search')} keyboardShouldPersistTaps="handled" />
      ) : (
        <FlatList
          data={sortedFriends}
          keyExtractor={item => item.username}
          ListHeaderComponent={() => (
            <View>
              {pendingRequests.length > 0 && (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: colors.secondaryText }]}>{t('friendRequests') || '友達リクエスト'}</Text>
                  {pendingRequests.map(item => (
                    <View key={`req-${item.username}`} style={[styles.userCard, { backgroundColor: colors.card }]}>
                      {/* 🌟 ヘルパー関数を使って安全に画像を表示 */}
                      <Image source={{ uri: getAvatarUri(item.avatar_url) }} style={styles.avatar} />
                      <View style={styles.userInfo}>
                        <Text style={[styles.userName, { color: colors.text }]}>{item.display_name || item.username}</Text>
                        <Text style={[styles.userId, { color: colors.secondaryText }]}>@{item.username}</Text>
                      </View>
                      <View style={styles.actionButtons}>
                        <TouchableOpacity style={[styles.actionBtn, styles.acceptBtn]} onPress={() => respondToRequest(item.username, 'accepted')}><Text style={styles.actionBtnText}>{t('accept') || '承認'}</Text></TouchableOpacity>
                        <TouchableOpacity style={[styles.actionBtn, styles.rejectBtn]} onPress={() => respondToRequest(item.username, 'rejected')}><Text style={styles.actionBtnText}>{t('reject') || '拒否'}</Text></TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              )}
              <View style={styles.section}><Text style={[styles.sectionTitle, { color: colors.secondaryText }]}>{t('myFriends') || '友達リスト'}</Text></View>
            </View>
          )}
          renderItem={(props) => renderUserItem(props, 'friend')}
          ListEmptyComponent={<Text style={[styles.emptyText, { color: colors.secondaryText }]}>{t('noFriendsYet') || 'まだ友達がいません'}</Text>}
          ListFooterComponent={() => (
            <View>
              {blockedUsers.length > 0 && (
                <View style={[styles.section, { marginTop: 30 }]}>
                  <Text style={[styles.sectionTitle, { color: colors.secondaryText }]}>{t('blockedList') || 'ブロックしたユーザー'}</Text>
                  {blockedUsers.map(item => (<View key={`blk-${item.username}`}>{renderUserItem({ item }, 'blocked')}</View>))}
                </View>
              )}
            </View>
          )}
        />
      )}

      {/* 🌟 友達管理メニュー（モーダル） */}
      <Modal visible={isMenuVisible} transparent={true} animationType="fade" onRequestClose={() => setIsMenuVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setIsMenuVisible(false)}>
          <View style={styles.menuOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.menuContainer, { backgroundColor: colors.card }]}>
                <Text style={[styles.menuTitle, { color: colors.secondaryText }]}>{selectedFriend?.display_name || selectedFriend?.username}</Text>
                <TouchableOpacity style={styles.menuItem} onPress={() => manageFriend('deleted')}>
                  <Ionicons name="person-remove" size={24} color="#FF3B30" />
                  <Text style={[styles.menuItemText, { color: '#FF3B30' }]}>{t('deleteFriend') || '友達から削除'}</Text>
                </TouchableOpacity>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <TouchableOpacity style={styles.menuItem} onPress={() => manageFriend('blocked')}>
                  <Ionicons name="ban" size={24} color="#FF3B30" />
                  <Text style={[styles.menuItemText, { color: '#FF3B30' }]}>{t('blockUser') || 'ブロックする'}</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* 🌟 QRコード用モーダル */}
      <Modal visible={isQrModalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setIsQrModalVisible(false)}>
        <View style={[styles.qrModalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.qrHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setIsQrModalVisible(false)} style={styles.qrCloseButton}>
              <Ionicons name="close" size={28} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.qrModalTitle, { color: colors.text }]}>{t('qrAddFriend') || 'QRコードで追加'}</Text>
            <View style={{ width: 28 }} />
          </View>

          <View style={[styles.qrTabContainer, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <TouchableOpacity style={[styles.qrTab, qrMode === 'show' && { borderBottomWidth: 3, borderBottomColor: colors.primary }]} onPress={() => setQrMode('show')}>
              <Text style={[styles.qrTabText, { color: colors.secondaryText }, qrMode === 'show' && { color: colors.primary }]}>{t('myQRCode') || 'マイQRコード'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.qrTab, qrMode === 'scan' && { borderBottomWidth: 3, borderBottomColor: colors.primary }]} onPress={() => setQrMode('scan')}>
              <Text style={[styles.qrTabText, { color: colors.secondaryText }, qrMode === 'scan' && { color: colors.primary }]}>{t('scanQRCode') || 'スキャン'}</Text>
            </TouchableOpacity>
          </View>

          {qrMode === 'show' ? (
            <View style={styles.qrContent}>
              <View style={styles.qrBox}>
                <QRCode value={user.username} size={200} backgroundColor="#fff" color="#000" />
              </View>
              <Text style={[styles.qrInstruction, { color: colors.text }]}>@{user.username}</Text>
            </View>
          ) : (
            <View style={styles.qrContent}>
              {!permission ? (
                <View style={styles.permissionContainer}>
                  <Text style={{ color: colors.text }}>{t('cameraPreparing') || 'カメラの準備中...'}</Text>
                </View>
              ) : !permission.granted ? (
                <View style={styles.permissionContainer}>
                  <Text style={{ textAlign: 'center', marginBottom: 20, color: colors.text }}>
                    {t('cameraPermission') || 'カメラのアクセス許可が必要です'}
                  </Text>
                  {permission.canAskAgain ? (
                    <Button onPress={requestPermission} title={t('grantPermission') || '許可する'} color={colors.primary} />
                  ) : (
                    <Button onPress={() => Linking.openSettings()} title={t('openSettingsButton') || '端末の設定から許可する'} color="#FF3B30" />
                  )}
                </View>
              ) : (
                <View style={styles.cameraContainer}>
                  {isCameraReady ? (
                    <CameraView 
                      style={{ width: '100%', height: '100%' }}
                      facing="back"
                      barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                      onBarcodeScanned={scanned ? undefined : handleBarCodeScanned} 
                    >
                      <View style={styles.scanOverlay}>
                        <View style={styles.scanTarget} />
                      </View>
                    </CameraView>
                  ) : (
                    <View style={[styles.scanOverlay, { backgroundColor: '#000' }]}>
                      <Text style={{ color: '#fff' }}>{t('cameraStarting') || 'カメラ起動中...'}</Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          )}
        </View>
      </Modal>

    </View>
  );
}

// 🌟 スマホの通知用住所（Push Token）を取得する関数
async function registerForPushNotificationsAsync() {
  if (Platform.OS === 'web') {
    console.log('🌐 Web環境のため、プッシュ通知のセットアップをスキップします');
    return undefined;
  }
  let token;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      console.log('通知の許可が得られませんでした（拒否されました）');
      return;
    }

    const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
    try {
      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      console.log("📱 本番環境で取得したトークン:", token);
    } catch (error) {
      console.error("❌ トークン取得エラー:", error);
    }
    
  } else {
    console.log('実機でないとプッシュ通知はテストできません（エミュレーター不可）');
  }

  return token;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', margin: 10, paddingHorizontal: 10, borderRadius: 8, height: 44, borderWidth: 1 },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 16 },
  qrButton: { padding: 5, marginLeft: 5 }, 
  section: { marginTop: 15, paddingHorizontal: 15 },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', marginBottom: 10 },
  userCard: { flexDirection: 'row', alignItems: 'center', padding: 12, marginHorizontal: 10, marginBottom: 8, borderRadius: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  avatar: { width: 46, height: 46, borderRadius: 23, marginRight: 12 },
  userInfo: { flex: 1 },
  userName: { fontSize: 16, fontWeight: 'bold' },
  userId: { fontSize: 13, marginTop: 2 },
  favoriteButton: { padding: 5, justifyContent: 'center', alignItems: 'center' },
  addButton: { paddingVertical: 6, paddingHorizontal: 16, borderRadius: 16 },
  addButtonText: { fontSize: 14, fontWeight: 'bold' },
  actionButtons: { flexDirection: 'row' },
  actionBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, marginLeft: 8 },
  acceptBtn: { backgroundColor: '#4CD964' },
  rejectBtn: { backgroundColor: '#FF3B30' },
  actionBtnText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  emptyText: { textAlign: 'center', marginTop: 30, fontSize: 16 },
  blockedBadge: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 12 },
  blockedBadgeText: { fontSize: 12, fontWeight: 'bold' },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  menuContainer: { width: 280, borderRadius: 16, paddingVertical: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3.84, elevation: 5 },
  menuTitle: { fontSize: 16, fontWeight: 'bold', textAlign: 'center', paddingVertical: 15 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, paddingHorizontal: 20 },
  menuItemText: { fontSize: 16, fontWeight: 'bold', marginLeft: 15 },
  divider: { height: 1, marginHorizontal: 15 },

  qrModalContainer: { flex: 1, paddingTop: Platform.OS === 'ios' ? 40 : 20 },
  qrHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 15, borderBottomWidth: 1 },
  qrCloseButton: { padding: 5 },
  qrModalTitle: { fontSize: 18, fontWeight: 'bold' },
  qrTabContainer: { flexDirection: 'row', borderBottomWidth: 1 },
  qrTab: { flex: 1, paddingVertical: 15, alignItems: 'center' },
  qrTabText: { fontSize: 16, fontWeight: 'bold' },
  qrContent: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  qrBox: { padding: 20, backgroundColor: '#fff', borderRadius: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 5 }, 
  qrInstruction: { marginTop: 20, fontSize: 18, fontWeight: 'bold' },
  permissionContainer: { padding: 20, justifyContent: 'center', alignItems: 'center' },
  cameraContainer: { flex: 1, width: '100%', height: '100%', backgroundColor: '#000', overflow: 'hidden' },
  scanOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  scanTarget: { width: 250, height: 250, borderWidth: 2, borderColor: '#007AFF', backgroundColor: 'transparent' },
});