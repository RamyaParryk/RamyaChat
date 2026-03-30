import React, { useState, useCallback, useEffect, useRef } from 'react'
import { StyleSheet, Platform, KeyboardAvoidingView, Text, View, Image, TouchableOpacity, Alert, Modal, TouchableWithoutFeedback, ActivityIndicator } from 'react-native'
import { GiftedChat, IMessage, Bubble, Actions, MessageImage, InputToolbar } from 'react-native-gifted-chat'
import { io } from 'socket.io-client'
import { t } from '../utils/translator'
import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'
import * as MediaLibrary from 'expo-media-library'
import * as FileSystem from 'expo-file-system/legacy'
import * as Linking from 'expo-linking'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '../contexts/ThemeContext';
import { apiClient } from '../utils/api';
import { Audio } from 'expo-av';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { AttachmentModal } from '../components/AttachmentModal';

// @ts-ignore
const socket = io(process.env.EXPO_PUBLIC_API_URL, { autoConnect: false })

const AudioPlayer = ({ currentMessage, isMyMessage, colors }: any) => {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    return sound ? () => { sound.unloadAsync(); } : undefined;
  }, [sound]);

  const togglePlayback = async () => {
    try {
      if (sound) {
        const status = await sound.getStatusAsync();
        // @ts-ignore
        if (status.isLoaded && status.isPlaying) {
          await sound.pauseAsync();
          setIsPlaying(false);
          return;
        } 
        // @ts-ignore
        else if (status.isLoaded) {
          await sound.playAsync();
          setIsPlaying(true);
          return;
        }
      }

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: currentMessage.audio },
        { shouldPlay: true, isLooping: false }
      );
      setSound(newSound);
      setIsPlaying(true);

      newSound.setOnPlaybackStatusUpdate(async (status: any) => {
        if (status.isLoaded) {
          setIsPlaying(status.isPlaying);
          if (status.didJustFinish) {
            setIsPlaying(false);
            await newSound.stopAsync();
          }
        }
      });
    } catch (e) {
      console.error("Playback failed", e);
    }
  };

  return (
    <TouchableOpacity style={{ padding: 10, flexDirection: 'row', alignItems: 'center', minWidth: 120 }} onPress={togglePlayback}>
      <Ionicons name={isPlaying ? "stop-circle" : "play-circle"} size={32} color={isMyMessage ? colors.primaryText : colors.primary} />
      <Text style={{ marginLeft: 10, fontWeight: 'bold', color: isMyMessage ? colors.primaryText : colors.text }}>
        {isPlaying ? t('stopAudio') : t('playAudio')}
      </Text>
    </TouchableOpacity>
  );
};


// @ts-ignore
export default function ChatScreen({ route, navigation }) {
  const { theme } = useTheme();
  const { colors } = theme;

  const { user: rawUser, chatPartner, targetMessageId } = route.params
  const user = { ...rawUser, _id: rawUser.username }
  const [messages, setMessages] = useState<IMessage[]>([])
  const [isPartnerOnline, setIsPartnerOnline] = useState(false)
  const [isPartnerTyping, setIsPartnerTyping] = useState(false)
  const typingTimerRef = useRef<any>(null)
  const typingStateRef = useRef(false)
  const roomId = route.params.roomId || [user._id, chatPartner.username].sort().join('_')
  
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [blockedByPartner, setBlockedByPartner] = useState(false);
  const [isFriend, setIsFriend] = useState(true); 

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isAttachmentModalVisible, setIsAttachmentModalVisible] = useState(false);
  const [isLoadingEarlier, setIsLoadingEarlier] = useState(false); 
  const [hasMoreMessages, setHasMoreMessages] = useState(true); 
  const [recording, setRecording] = useState<Audio.Recording | undefined>();
  const [isWebCameraVisible, setIsWebCameraVisible] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  // 🌟 現在「検索結果（過去）」を見ているかどうかを判定するState
  const [isViewingSearch, setIsViewingSearch] = useState(!!targetMessageId);

  /* ======================== Header ======================== */
  useEffect(() => {
    if (!chatPartner) return

    const isActuallyOnline = isPartnerOnline && !blockedByMe && !blockedByPartner && isFriend;

    navigation.setOptions({
      headerStyle: { backgroundColor: colors.card }, 
      headerTintColor: colors.primary, 
      headerTitle: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Image source={{ uri: chatPartner.avatar || `${process.env.EXPO_PUBLIC_API_URL}/avatars/default.png` }} style={{ width: 36, height: 36, borderRadius: 18, marginRight: 10 }} />
          <View>
            <Text style={{ fontSize: 16, fontWeight: 'bold', color: colors.text }}>{chatPartner.displayName}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={[styles.onlineDot, { backgroundColor: isActuallyOnline ? '#4CD964' : colors.secondaryText }]} />
              <Text style={{ fontSize: 11, color: colors.secondaryText }}>
                {isActuallyOnline ? (t('statusOnline') || 'Online') : (t('statusOffline') || 'Offline')}
              </Text>
            </View>
          </View>
        </View>
      )
    })
  }, [navigation, chatPartner, isPartnerOnline, blockedByMe, blockedByPartner, isFriend, colors])

  /* ======================== Block & Friend Check ======================== */
  useFocusEffect(
    useCallback(() => {
      apiClient.get(`/check-block?me=${user.username}&partner=${chatPartner.username}`)
        .then(data => {
          setBlockedByMe(data.blockedByMe);
          setBlockedByPartner(data.blockedByPartner);
          setIsFriend(data.isFriend); 
        })
        .catch(err => console.error('ステータス確認エラー:', err));
    }, [user.username, chatPartner.username])
  );

  /* ======================== Socket ======================== */
  useEffect(() => {
    socket.connect()
    socket.on('connect', () => {
      socket.emit('user_online', user._id)
      socket.emit('join_room', { roomId, userId: user._id, targetMessageId }) 
    })

    socket.on('load_history', (pastMessages: any[]) => {
      const fixedMessages = pastMessages.map(msg => (msg.user._id === user._id ? { ...msg, user: { ...msg.user, avatar: user.avatar } } : msg))
      setMessages(fixedMessages)
      if (pastMessages.length < 50) setHasMoreMessages(false) 
    })

    socket.on('receive_message', (message: any) => {
      let fixedMessage = message
      if (message.user._id === user._id) {
        fixedMessage = { ...message, user: { ...message.user, avatar: user.avatar } }
      } else {
        socket.emit('mark_as_read', { roomId, userId: user._id })
        setIsPartnerTyping(false)
      }
      setMessages(prev => GiftedChat.append(prev, [fixedMessage]))
    })

    socket.on('messages_read', () => {
      setMessages(prev => prev.map(msg => (msg.user._id === user._id ? { ...msg, isRead: true } : msg)))
    })

    socket.on('update_online_users', (onlineIds: string[]) => setIsPartnerOnline(onlineIds.includes(chatPartner.username)))
    socket.on('display_typing', (data: { userId: string, isTyping: boolean }) => {
      if (data.userId === chatPartner.username) setIsPartnerTyping(data.isTyping)
    })

    socket.on('receive_more_history', (olderMessages: any[]) => {
      const fixedMessages = olderMessages.map(msg => (msg.user._id === user._id ? { ...msg, user: { ...msg.user, avatar: user.avatar } } : msg))
      setMessages(prev => GiftedChat.prepend(prev, fixedMessages))
      setIsLoadingEarlier(false)
      if (olderMessages.length < 50) setHasMoreMessages(false)
    })

    return () => {
      socket.off('connect'); 
      socket.off('load_history'); 
      socket.off('receive_message'); 
      socket.off('messages_read'); 
      socket.off('update_online_users'); 
      socket.off('display_typing'); 
      socket.off('receive_more_history');
      socket.disconnect();
    }
  }, [roomId, user._id, chatPartner.username])

  const onLoadEarlier = () => {
    setIsLoadingEarlier(true)
    const oldestMessage = messages[messages.length - 1];
    const cursor = oldestMessage ? oldestMessage.createdAt : new Date().toISOString();
    socket.emit('load_more_history', { roomId, cursor }) 
  }

  /* ======================== 最新へ戻る処理 ======================== */
  const jumpToPresent = () => {
    setIsViewingSearch(false);
    // ターゲットIDを解除してハイライトを消す
    navigation.setParams({ targetMessageId: null });
    // 一旦メッセージを空にしてローディング感を出す
    setMessages([]); 
    setHasMoreMessages(true);
    // 最新の50件を取得！
    socket.emit('join_room', { roomId, userId: user._id, targetMessageId: null });
  };

  /* ======================== 音声（録音）処理 ======================== */
  const startRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert(t('error'), 'マイクの権限が必要です');
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(recording);
    } catch (err) {
      console.error('録音の開始に失敗しました:', err);
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    setRecording(undefined);
    await recording.stopAndUnloadAsync();
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
    });

    const uri = recording.getURI();
    if (uri) {
      uploadAndSendAudio(uri);
    }
  };

  const uploadAndSendAudio = async (uri: string) => {
    const formData = new FormData();
    if (Platform.OS === 'web') {
      const response = await fetch(uri);
      const blob = await response.blob();
      formData.append('audio', blob, 'voice_message.m4a');
    } else {
      // @ts-ignore
      formData.append('audio', { uri, type: 'audio/m4a', name: 'voice_message.m4a' });
    }
    try {
      const data = await apiClient.postForm('/upload-chat-audio', formData);
      const audioMessage = { 
        _id: Math.random().toString(36).substring(7), 
        text: '', 
        createdAt: new Date(), 
        user: user, 
        audio: data.url, 
        roomId, 
        isRead: false, 
        receiverId: chatPartner.username 
      };
      socket.emit('send_message', audioMessage);
    } catch (error) { console.error("音声送信エラー:", error) }
  };

  /* ======================== 画像＆ファイル送信処理 ======================== */
  const uploadAndSendMessage = async (uri: string) => {
    const formData = new FormData()
    if (Platform.OS === 'web') {
      const response = await fetch(uri); const blob = await response.blob()
      formData.append('image', blob, 'chat.jpg')
    } else {
      // @ts-ignore
      formData.append('image', { uri, type: 'image/jpeg', name: 'chat.jpg' })
    }
    try {
      const data = await apiClient.postForm('/upload-chat-image', formData);
      const imageMessage = { _id: Math.random().toString(36).substring(7), text: '', createdAt: new Date(), user: user, image: data.url, roomId, isRead: false, receiverId: chatPartner.username }
      socket.emit('send_message', imageMessage)
    } catch (error) { console.error("画像送信エラー:", error) }
  }

  const uploadAndSendFile = async (uri: string, name: string, mimeType: string) => {
    const formData = new FormData()
    if (Platform.OS === 'web') {
      const response = await fetch(uri); const blob = await response.blob()
      formData.append('file', blob, name)
    } else {
      // @ts-ignore
      formData.append('file', { uri, type: mimeType || 'application/octet-stream', name })
    }
    try {
      const data = await apiClient.postForm('/upload-chat-file', formData);
      const fileMessage = { _id: Math.random().toString(36).substring(7), text: '', createdAt: new Date(), user: user, file: data.url, fileName: data.fileName || name, roomId, isRead: false, receiverId: chatPartner.username }
      socket.emit('send_message', fileMessage)
    } catch (error) { console.error("ファイル送信エラー:", error) }
  }

  const pickAndSendImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 })
    if (!result.canceled && result.assets && result.assets.length > 0) uploadAndSendMessage(result.assets[0].uri)
  }

  // 🌟 Webとスマホで処理を分ける！
  const takeAndSendPhoto = async () => {
    if (Platform.OS === 'web') {
      if (!cameraPermission?.granted) {
        const perm = await requestCameraPermission();
        if (!perm.granted) {
          Alert.alert(t('error'), t('cameraPermissionRequired') || 'カメラの許可が必要です');
          return;
        }
      }
      setIsWebCameraVisible(true);
    } else {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync()
      if (permissionResult.granted === false) { Alert.alert(t('error'), t('cameraPermissionRequired')); return }
      let result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 })
      if (!result.canceled && result.assets && result.assets.length > 0) uploadAndSendMessage(result.assets[0].uri)
    }
  }

  const handleWebCameraCapture = async () => {
    if (cameraRef.current) {
      const photo = await cameraRef.current.takePictureAsync();
      setIsWebCameraVisible(false);
      if (photo && photo.uri) {
         uploadAndSendMessage(photo.uri);
      }
    }
  }

  const pickAndSendFile = async () => {
    let result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true })
    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0]
      uploadAndSendFile(asset.uri, asset.name, asset.mimeType || 'application/octet-stream')
    }
  }

  const handleAttachmentPress = () => {
    setIsAttachmentModalVisible(true);
  }

  const saveImageToGallery = async (imageUrl: string) => {
    if (Platform.OS === 'web') { window.alert(t('saveImageOnWebInstruction')); return }
    const { status } = await MediaLibrary.requestPermissionsAsync()
    if (status !== 'granted') { Alert.alert(t('error'), t('mediaLibraryPermissionRequired')); return }
    try {
      // @ts-ignore
      const fileUri = FileSystem.cacheDirectory + 'temp.jpg';
      const { uri } = await FileSystem.downloadAsync(imageUrl, fileUri);
      await MediaLibrary.createAssetAsync(uri);
      Alert.alert(t('success'), t('imageSavedSuccess'))
    } catch (error) { console.error("画像保存エラー:", error); Alert.alert(t('error'), t('imageSavedError')) }
  }

  /* ======================== Typing & Send ======================== */
  const handleTyping = (text: string) => {
    if (!typingStateRef.current && text.length > 0) {
      typingStateRef.current = true; socket.emit('typing_start', { roomId, userId: user._id })
    }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    typingTimerRef.current = setTimeout(() => {
      typingStateRef.current = false; socket.emit('typing_stop', { roomId, userId: user._id })
    }, 2000)
  }

  const onSend = useCallback((newMessages: IMessage[] = []) => {
    socket.emit('typing_stop', { roomId, userId: user._id })
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current); typingStateRef.current = false
    
    const messageToSend = { ...newMessages[0], roomId, isRead: false, receiverId: chatPartner.username }
    socket.emit('send_message', messageToSend)
  }, [roomId, chatPartner.username]) 

  /* ======================== UI ======================== */
  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 80}>
      
      {hasMoreMessages && (
        <View style={{ position: 'absolute', top: 15, zIndex: 10, width: '100%', alignItems: 'center' }}>
          <TouchableOpacity
            style={{
              backgroundColor: colors.primary,
              borderRadius: 20,
              paddingHorizontal: 20,
              paddingVertical: 8,
              shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3, elevation: 5
            }}
            onPress={onLoadEarlier}
            disabled={isLoadingEarlier}
          >
            {isLoadingEarlier ? (
              <ActivityIndicator color={colors.primaryText} size="small" />
            ) : (
              <Text style={{ color: colors.primaryText, fontWeight: 'bold' }}>
                {t('loadEarlierMessages') || '過去のメッセージを読み込む'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      <GiftedChat
        messages={messages}
        onSend={msgs => onSend(msgs)}
        user={user}
        messagesContainerStyle={{ backgroundColor: colors.background }}

        textInputProps={{ 
          placeholder: recording ? '🔴 録音中...' : t('chatPlaceholder'), 
          placeholderTextColor: recording ? '#FF3B30' : colors.secondaryText,
          style: { color: recording ? '#FF3B30' : colors.text, flex: 1, paddingVertical: 10 }, 
          onChangeText: (text: string) => handleTyping(text),
          editable: !recording 
        }}
        renderAvatar={() => null}
        
        renderInputToolbar={(props) => {
          if (blockedByMe) {
            return (
              <View style={{ padding: 15, alignItems: 'center', backgroundColor: colors.card, borderTopWidth: 1, borderColor: colors.border }}>
                <Text style={{ color: colors.secondaryText, fontWeight: 'bold' }}>
                  {t('cannotSendBlocked') || 'ブロック中のためメッセージを送れません'}
                </Text>
              </View>
            );
          }
          return <InputToolbar {...props} containerStyle={{ backgroundColor: colors.card, borderTopColor: colors.border }} />;
        }}

        renderActions={(props) => (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 5 }}>
            <Actions {...props} icon={() => <Ionicons name="add" size={26} color={colors.primary} />} onPressActionButton={handleAttachmentPress} />
            <TouchableOpacity 
              onPress={recording ? stopRecording : startRecording} 
              style={{ padding: 5, marginRight: 5 }}
            >
              <Ionicons 
                name={recording ? "stop-circle" : "mic"} 
                size={26} 
                color={recording ? "#FF3B30" : colors.primary} 
              />
            </TouchableOpacity>
          </View>
        )}

        renderBubble={(props) => {
          const { currentMessage } = props;
          const isTarget = currentMessage && currentMessage._id === targetMessageId;

          return (
            <Bubble
              {...props}
              renderTicks={(currentMessage: any) => {
                if (currentMessage.user._id === user._id && currentMessage.isRead) return <Text style={styles.readTicks}>{t('readStatus')}</Text>
                return null
              }}
              wrapperStyle={{ 
                right: { 
                  backgroundColor: isTarget ? '#d4a373' : colors.chatBubbleSelf, 
                  borderWidth: isTarget ? 2 : 0, borderColor: '#fff'
                }, 
                left: { 
                  backgroundColor: isTarget ? '#e9edc9' : colors.chatBubblePartner,
                  borderWidth: isTarget ? 2 : 0, borderColor: colors.primary
                } 
              }}
              textStyle={{ 
                right: { color: colors.primaryText }, 
                left: { color: colors.text } 
              }}
            />
          );
        }}

        renderMessageImage={(props) => {
          const { currentMessage } = props;
          return (
            <TouchableOpacity onPress={() => {
              if (currentMessage && currentMessage.image) { setSelectedImage(currentMessage.image); setIsModalVisible(true); }
            }}>
              <MessageImage {...props} />
            </TouchableOpacity>
          );
        }}

        renderMessageAudio={(props) => {
          const { currentMessage } = props;
          if (currentMessage && currentMessage.audio) {
            const isMyMessage = currentMessage.user._id === user._id;
            return <AudioPlayer currentMessage={currentMessage} isMyMessage={isMyMessage} colors={colors} />;
          }
          return null;
        }}

        renderCustomView={(props) => {
          const { currentMessage } = props;
          // @ts-ignore
          if (currentMessage && currentMessage.file) {
            const isMyMessage = currentMessage.user._id === user._id;
            return (
              // @ts-ignore
              <TouchableOpacity style={{ padding: 10, flexDirection: 'row', alignItems: 'center' }} onPress={() => Linking.openURL(currentMessage.file)}>
                <Ionicons name="document-text" size={32} color={isMyMessage ? colors.primaryText : colors.primary} />
                {/* @ts-ignore */}
                <Text style={{ marginLeft: 10, color: isMyMessage ? colors.primaryText : colors.text, textDecorationLine: 'underline', flexShrink: 1 }}>{currentMessage.fileName || t('attachedFile')}</Text>
              </TouchableOpacity>
            );
          }
          return null;
        }}

        renderFooter={() => {
          if (!isPartnerTyping || blockedByMe || blockedByPartner || !isFriend) return null;
          return (
            <View style={styles.typingIndicatorContainer}>
              <Text style={[styles.typingIndicatorText, { color: colors.primary }]}>
                {t('typingIndicator').replace('%name%', chatPartner.displayName)}
              </Text>
            </View>
          );
        }}
      />
      
      {/* 🌟 過去（検索結果）を見ている時だけ、右下に「最新に戻る」ボタンを表示！ */}
      {isViewingSearch && (
        <TouchableOpacity
          style={[styles.jumpToPresentButton, { backgroundColor: colors.card }]}
          onPress={jumpToPresent}
        >
          <Ionicons name="chevron-down-circle" size={48} color={colors.primary} />
        </TouchableOpacity>
      )}

      {/* 🌟 モダンなアタッチメントメニュー（Bottom Sheet） */}
      <AttachmentModal 
        visible={isAttachmentModalVisible}
        onClose={() => setIsAttachmentModalVisible(false)}
        onSelectImage={() => {
          setIsAttachmentModalVisible(false);
          setTimeout(() => pickAndSendImage(), 300); // アニメーション終了後に起動
        }}
        onTakePhoto={() => {
          setIsAttachmentModalVisible(false);
          setTimeout(() => takeAndSendPhoto(), 300);
        }}
        onSelectFile={() => {
          setIsAttachmentModalVisible(false);
          setTimeout(() => pickAndSendFile(), 300);
        }}
      />

      {/* 画像拡大 & ダウンロード用モーダル */}
      <Modal visible={isModalVisible} transparent={true} animationType="fade" onRequestClose={() => setIsModalVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setIsModalVisible(false)}>
          <View style={styles.modalContainer}>
            {selectedImage && <Image source={{ uri: selectedImage }} style={styles.fullImage} resizeMode="contain" />}

            <TouchableOpacity style={styles.closeButton} onPress={() => setIsModalVisible(false)}>
              <Ionicons name="close" size={30} color="#fff" />
            </TouchableOpacity>

            {selectedImage && (
              <TouchableOpacity 
                style={[styles.closeButton, { right: 80 }]}
                onPress={() => saveImageToGallery(selectedImage)}
              >
                <Ionicons name="download-outline" size={30} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* 🌟 Webブラウザ専用のカメラモーダル */}
      <Modal visible={isWebCameraVisible} animationType="slide" transparent={false} onRequestClose={() => setIsWebCameraVisible(false)}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          {isWebCameraVisible && cameraPermission?.granted && (
            <CameraView ref={cameraRef} style={{ flex: 1 }} facing="front">
              
              {/* カメラ画面の下部 UI (シャッターボタン) */}
              <View style={{ flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 40 }}>
                <TouchableOpacity 
                  onPress={handleWebCameraCapture} 
                  style={{ width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(255,255,255,0.3)', borderWidth: 4, borderColor: '#fff', justifyContent: 'center', alignItems: 'center' }} 
                >
                  <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: '#fff' }} />
                </TouchableOpacity>
              </View>

              {/* 閉じるボタン */}
              <TouchableOpacity onPress={() => setIsWebCameraVisible(false)} style={{ position: 'absolute', top: 40, right: 20 }}>
                <Ionicons name="close-circle" size={40} color="#fff" />
              </TouchableOpacity>
              
            </CameraView>
          )}
        </View>
      </Modal>

    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  readTicks: { fontSize: 10, color: '#aaa', marginRight: 5, marginBottom: 3, alignSelf: 'flex-end' },
  onlineDot: { width: 8, height: 8, borderRadius: 4, marginRight: 5 },
  typingIndicatorContainer: { padding: 8, marginLeft: 15, marginBottom: 5 },
  typingIndicatorText: { fontSize: 13, fontWeight: 'bold', fontStyle: 'italic' },
  modalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
  fullImage: { width: '100%', height: '100%' },
  closeButton: { position: 'absolute', top: 50, right: 20, backgroundColor: 'rgba(0,0,0,0.5)', width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  
  // 🌟 最新へ戻るボタンのスタイルを追加
  jumpToPresentButton: {
    position: 'absolute',
    right: 20,
    bottom: 80, // 入力欄の上に浮かす
    borderRadius: 24, // サイズの半分の丸み
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
    zIndex: 100,
  },
})