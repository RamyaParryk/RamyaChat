import React, { useState, useCallback, useEffect, useRef } from 'react';
import { StyleSheet, Platform, KeyboardAvoidingView, Text, View, Image, TouchableOpacity, Alert, Modal, TouchableWithoutFeedback, ActivityIndicator } from 'react-native';
import { GiftedChat, IMessage, Bubble, Actions, MessageImage, InputToolbar } from 'react-native-gifted-chat';
import { io } from 'socket.io-client';
import { t } from '../utils/translator';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import * as Linking from 'expo-linking';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';
import { apiClient } from '../utils/api';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { AttachmentModal } from '../components/AttachmentModal';
import { Audio } from 'expo-av';

let PeerConnectionClass: any = typeof window !== 'undefined' ? (window as any).RTCPeerConnection : null;
let IceCandidateClass: any = typeof window !== 'undefined' ? (window as any).RTCIceCandidate : null;
let SessionDescriptionClass: any = typeof window !== 'undefined' ? (window as any).RTCSessionDescription : null;
let getUserMediaFn: any = typeof navigator !== 'undefined' ? navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices) : null;
let RTCViewComponent: any = null;

if (Platform.OS !== 'web') {
  try {
    const WebRTC = require('react-native-webrtc');
    PeerConnectionClass = WebRTC.RTCPeerConnection;
    IceCandidateClass = WebRTC.RTCIceCandidate;
    SessionDescriptionClass = WebRTC.RTCSessionDescription;
    getUserMediaFn = WebRTC.mediaDevices.getUserMedia;
    RTCViewComponent = WebRTC.RTCView;
  } catch (e) {
    console.error("Failed to load react-native-webrtc", e);
  }
}

const WebVideoElement = ({ stream, style, isVideoCall }: { stream: any, style: any, isVideoCall?: boolean }) => {
  const ref = useRef<any>(null);
  useEffect(() => {
    if (ref.current && stream) {
      ref.current.srcObject = stream;
      ref.current.muted = !!style.muted;
      ref.current.play().catch((err: any) => console.warn("自動再生がブロックされました:", err));
    }
  }, [stream, style.muted]);
  
  if (Platform.OS !== 'web') return null;

  return (
    <video
      ref={ref} autoPlay playsInline
      style={
        isVideoCall === false
          ? { width: 1, height: 1, position: 'absolute', opacity: 0 } 
          : { width: style.width || '100%', height: style.height || '100%', objectFit: 'cover', position: style.position || 'relative', top: style.top, right: style.right, borderRadius: style.borderRadius, borderWidth: style.borderWidth, borderColor: style.borderColor }
      }
    />
  );
};

// @ts-ignore
const socket = io(process.env.EXPO_PUBLIC_API_URL, { autoConnect: false });
const configuration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

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
        if (status.isLoaded && status.isPlaying) { await sound.pauseAsync(); setIsPlaying(false); return; } 
        // @ts-ignore
        else if (status.isLoaded) { await sound.playAsync(); setIsPlaying(true); return; }
      }
      const { sound: newSound } = await Audio.Sound.createAsync({ uri: currentMessage.audio }, { shouldPlay: true, isLooping: false });
      setSound(newSound); setIsPlaying(true);
      newSound.setOnPlaybackStatusUpdate(async (status: any) => {
        if (status.isLoaded) {
          setIsPlaying(status.isPlaying);
          if (status.didJustFinish) { setIsPlaying(false); await newSound.stopAsync(); }
        }
      });
    } catch (e) { console.error("Playback failed", e); }
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

  const { user: rawUser, chatPartner, targetMessageId } = route.params;
  const user = { ...rawUser, _id: rawUser.username };
  const [messages, setMessages] = useState<IMessage[]>([]);
  const [isPartnerOnline, setIsPartnerOnline] = useState(false);
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const typingTimerRef = useRef<any>(null);
  const typingStateRef = useRef(false);
  const roomId = route.params.roomId || [user._id, chatPartner.username].sort().join('_');
  
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

  const [isViewingSearch, setIsViewingSearch] = useState(!!targetMessageId);

  // --- 📞 通話用ステート・履歴管理 ---
  const [callStatus, setCallStatus] = useState<'idle' | 'calling' | 'incoming' | 'connected'>('idle');
  const callStatusRef = useRef<'idle' | 'calling' | 'incoming' | 'connected'>('idle');
  const updateCallStatus = (status: 'idle' | 'calling' | 'incoming' | 'connected') => {
    setCallStatus(status);
    callStatusRef.current = status;
  };

  const [isVideoCall, setIsVideoCall] = useState(false);
  const isCallerRef = useRef(false); 
  const callStartTime = useRef<number | null>(null); 

  const [localStream, setLocalStream] = useState<any>(null);
  const [remoteStream, setRemoteStream] = useState<any>(null);
  const peerConnection = useRef<any>(null);
  const partnerSocketId = useRef<string | null>(null);

  const ringtoneSound = useRef<Audio.Sound | null>(null);
  const hangupSound = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    const loadSounds = async () => {
      try {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        const { sound: rSound } = await Audio.Sound.createAsync(require('../assets/sounds/call_start.mp3'), { isLooping: true });
        ringtoneSound.current = rSound;
        const { sound: hSound } = await Audio.Sound.createAsync(require('../assets/sounds/call_end.mp3'));
        hangupSound.current = hSound;
      } catch (error) { console.log("Sound preload error:", error); }
    };
    loadSounds();
    return () => {
      if (ringtoneSound.current) ringtoneSound.current.unloadAsync();
      if (hangupSound.current) hangupSound.current.unloadAsync();
    };
  }, []);

  const playRingtone = async () => { try { if (ringtoneSound.current) await ringtoneSound.current.replayAsync(); } catch (e) {} };
  const stopRingtone = async () => { try { if (ringtoneSound.current) await ringtoneSound.current.stopAsync(); } catch (e) {} };
  const playHangupSound = async () => { try { if (hangupSound.current) await hangupSound.current.replayAsync(); } catch (e) {} };

  /* ======================== Header ======================== */
  useEffect(() => {
    if (!chatPartner) return;
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
              <Text style={{ fontSize: 11, color: colors.secondaryText }}>{isActuallyOnline ? (t('statusOnline') || 'Online') : (t('statusOffline') || 'Offline')}</Text>
            </View>
          </View>
        </View>
      ),
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 10 }}>
          <TouchableOpacity onPress={() => startCall(false)} style={{ padding: 8, marginLeft: 5 }}>
            <Ionicons name="call-outline" size={22} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => startCall(true)} style={{ padding: 8, marginLeft: 5 }}>
            <Ionicons name="videocam-outline" size={24} color={colors.primary} />
          </TouchableOpacity>
        </View>
      )
    });
  }, [navigation, chatPartner, isPartnerOnline, blockedByMe, blockedByPartner, isFriend, colors]);

  /* ======================== Block & Friend Check ======================== */
  useFocusEffect(
    useCallback(() => {
      apiClient.get(`/check-block?me=${user.username}&partner=${chatPartner.username}`)
        .then(data => { setBlockedByMe(data.blockedByMe); setBlockedByPartner(data.blockedByPartner); setIsFriend(data.isFriend); })
        .catch(err => console.error('ステータス確認エラー:', err));
    }, [user.username, chatPartner.username])
  );

  /* ======================== Socket (Chat) ======================== */
  useEffect(() => {
    socket.connect();
    socket.on('connect', () => {
      socket.emit('user_online', user._id);
      socket.emit('join_room', { roomId, userId: user._id, targetMessageId });
    });

    socket.on('load_history', (pastMessages: any[]) => {
      const fixedMessages = pastMessages.map(msg => (msg.user._id === user._id ? { ...msg, user: { ...msg.user, avatar: user.avatar } } : msg));
      setMessages(fixedMessages);
      if (pastMessages.length < 50) setHasMoreMessages(false);
    });

    socket.on('receive_message', (message: any) => {
      let fixedMessage = message;
      if (message.user._id === user._id) { fixedMessage = { ...message, user: { ...message.user, avatar: user.avatar } }; } 
      else { socket.emit('mark_as_read', { roomId, userId: user._id }); setIsPartnerTyping(false); }
      setMessages(prev => GiftedChat.append(prev, [fixedMessage]));
    });

    socket.on('messages_read', () => setMessages(prev => prev.map(msg => (msg.user._id === user._id ? { ...msg, isRead: true } : msg))));
    socket.on('update_online_users', (onlineIds: string[]) => setIsPartnerOnline(onlineIds.includes(chatPartner.username)));
    socket.on('display_typing', (data: { userId: string, isTyping: boolean }) => { if (data.userId === chatPartner.username) setIsPartnerTyping(data.isTyping); });

    socket.on('receive_more_history', (olderMessages: any[]) => {
      const fixedMessages = olderMessages.map(msg => (msg.user._id === user._id ? { ...msg, user: { ...msg.user, avatar: user.avatar } } : msg));
      setMessages(prev => GiftedChat.prepend(prev, fixedMessages));
      setIsLoadingEarlier(false);
      if (olderMessages.length < 50) setHasMoreMessages(false);
    });

    return () => {
      socket.off('connect'); socket.off('load_history'); socket.off('receive_message'); socket.off('messages_read'); 
      socket.off('update_online_users'); socket.off('display_typing'); socket.off('receive_more_history');
      socket.disconnect();
    };
  }, [roomId, user._id, chatPartner.username]);

  /* ======================== WebRTC Socket Events ======================== */
  useEffect(() => {
    const onIncomingCall = ({ callerName, isVideo, fromSocketId }: any) => {
      partnerSocketId.current = fromSocketId;
      setIsVideoCall(isVideo);
      updateCallStatus('incoming');
      isCallerRef.current = false;
      callStartTime.current = null;
      playRingtone();
    };

    const onCallAccepted = async ({ fromSocketId }: any) => {
      stopRingtone();
      partnerSocketId.current = fromSocketId;
      updateCallStatus('connected');
      callStartTime.current = Date.now();
      if (peerConnection.current) {
        const offer = await peerConnection.current.createOffer();
        await peerConnection.current.setLocalDescription(offer);
        socket.emit('webrtc_offer', { roomId, offer });
      }
    };

    const onCallRejected = () => {
      if (callStatusRef.current === 'connected') {
        endCallSimple('completed', true);
      } else {
        endCallSimple('rejected', true);
      }
    };

    const onWebRtcOffer = async ({ offer }: any) => {
      if (peerConnection.current && SessionDescriptionClass) {
        await peerConnection.current.setRemoteDescription(new SessionDescriptionClass(offer));
        const answer = await peerConnection.current.createAnswer();
        await peerConnection.current.setLocalDescription(answer);
        socket.emit('webrtc_answer', { roomId, answer });
      }
    };

    const onWebRtcAnswer = async ({ answer }: any) => {
      if (peerConnection.current && SessionDescriptionClass) {
        await peerConnection.current.setRemoteDescription(new SessionDescriptionClass(answer));
      }
    };

    const onWebRtcIceCandidate = async ({ candidate }: any) => {
      if (peerConnection.current && IceCandidateClass) {
        await peerConnection.current.addIceCandidate(new IceCandidateClass(candidate));
      }
    };

    socket.on('incoming_call', onIncomingCall);
    socket.on('call_accepted', onCallAccepted);
    socket.on('call_rejected', onCallRejected);
    socket.on('webrtc_offer', onWebRtcOffer);
    socket.on('webrtc_answer', onWebRtcAnswer);
    socket.on('webrtc_ice_candidate', onWebRtcIceCandidate);

    return () => {
      socket.off('incoming_call', onIncomingCall);
      socket.off('call_accepted', onCallAccepted);
      socket.off('call_rejected', onCallRejected);
      socket.off('webrtc_offer', onWebRtcOffer);
      socket.off('webrtc_answer', onWebRtcAnswer);
      socket.off('webrtc_ice_candidate', onWebRtcIceCandidate);
    };
  }, [roomId]);


  /* ======================== WebRTC Core Logic ======================== */
  const setupWebRTC = async (video: boolean): Promise<boolean> => {
    try {
      if (!PeerConnectionClass) return false;
      peerConnection.current = new PeerConnectionClass(configuration);
      const constraints = { audio: true, video: video ? { facingMode: 'user' } : false };

      let stream;
      if (Platform.OS === 'web') { stream = await window.navigator.mediaDevices.getUserMedia(constraints); } 
      else { stream = await getUserMediaFn(constraints); }
      
      setLocalStream(stream);
      stream.getTracks().forEach((track: any) => peerConnection.current?.addTrack(track, stream));

      if (Platform.OS === 'web') {
        peerConnection.current.ontrack = (event: any) => { if (event.streams && event.streams[0]) setRemoteStream(event.streams[0]); };
        peerConnection.current.onicecandidate = (event: any) => { if (event.candidate) socket.emit('webrtc_ice_candidate', { roomId, candidate: event.candidate }); };
      } else {
        (peerConnection.current as any).ontrack = (event: any) => { if (event.streams && event.streams[0]) setRemoteStream(event.streams[0]); };
        (peerConnection.current as any).onicecandidate = (event: any) => { if (event.candidate) socket.emit('webrtc_ice_candidate', { roomId, candidate: event.candidate }); };
      }
      return true; 
    } catch (e) {
      if (Platform.OS === 'web') { window.alert(t('cameraMicError') || 'カメラまたはマイクの権限が取得できませんでした。'); } 
      else { Alert.alert(t('error') || 'Error', t('cameraMicError') || 'カメラまたはマイクの権限がありません。'); }
      endCallSimple('rejected', false);
      return false;
    }
  };

  const startCall = async (video: boolean) => {
    setIsVideoCall(video);
    updateCallStatus('calling');
    isCallerRef.current = true;
    callStartTime.current = null;
    
    const success = await setupWebRTC(video);
    if (success) {
      playRingtone();
      socket.emit('initiate_call', { roomId, callerName: user.name || user.displayName, isVideo: video });
    } else {
      updateCallStatus('idle');
    }
  };

  const acceptCall = async () => {
    updateCallStatus('connected');
    callStartTime.current = Date.now();
    stopRingtone();
    
    const success = await setupWebRTC(isVideoCall);
    if (success) { socket.emit('accept_call', { roomId, toSocketId: partnerSocketId.current }); } 
    else { rejectCall(); }
  };

  const rejectCall = () => {
    let explicitStatus = 'completed';
    if (callStatusRef.current === 'incoming') explicitStatus = 'rejected';
    if (callStatusRef.current === 'calling') explicitStatus = 'missed';
    
    endCallSimple(explicitStatus, false);
  };

  const endCallSimple = (statusOverride?: string, fromRemote = false) => {
    const currentStatus = callStatusRef.current;
    if (currentStatus === 'idle') return;

    let finalStatus = 'completed';
    if (currentStatus === 'calling' || currentStatus === 'incoming') finalStatus = 'missed';
    if (statusOverride) finalStatus = statusOverride;

    const duration = callStartTime.current ? Math.floor((Date.now() - callStartTime.current) / 1000) : 0;

    if (isCallerRef.current) {
      socket.emit('save_call_history', {
        roomId,
        callerId: user._id,
        receiverId: chatPartner.username,
        callType: isVideoCall ? 'video' : 'audio',
        status: finalStatus,
        duration
      });
    }

    if (!fromRemote) {
      socket.emit('reject_call', { roomId });
    }

    stopRingtone();
    playHangupSound();

    if (localStream) localStream.getTracks().forEach((track: any) => track.stop());
    if (peerConnection.current) peerConnection.current.close();
    
    setLocalStream(null);
    setRemoteStream(null);
    peerConnection.current = null;
    updateCallStatus('idle');
    callStartTime.current = null;
  };

  // 🌟 履歴画面から「自動発信」の合図を受け取った場合の処理
  useEffect(() => {
    if (route.params?.autoStartCall) {
      setTimeout(() => {
        startCall(route.params.autoStartCall === 'video');
        navigation.setParams({ autoStartCall: undefined });
      }, 500);
    }
  }, [route.params?.autoStartCall]);

  // 🌟 通知タップから「着信」として開かれた場合の処理（ゴースト着信防止版）
  useEffect(() => {
    if (route.params?.isIncomingCall) {
      const checkStatus = () => {
        socket.emit('check_call_status', { roomId });
      };

      // サーバーとの接続が完了してから確認リクエストを送る
      if (socket.connected) {
        checkStatus();
      } else {
        socket.once('connect', checkStatus);
      }

      // サーバーからの返答待ち
      const onStatusResult = ({ isActive }: { isActive: boolean }) => {
        if (isActive) {
          // まだ鳴っていれば着信画面を出す
          setIsVideoCall(route.params?.isVideoCall || false);
          updateCallStatus('incoming');
          isCallerRef.current = false;
          callStartTime.current = null;
          playRingtone();
        } else {
          // 既に切られていた場合はアラートだけ出して終わる
          Alert.alert('不在着信', '通話はすでに終了しています。');
        }
        socket.off('call_status_result', onStatusResult);
      };

      socket.on('call_status_result', onStatusResult);

      // ループを防ぐためにパラメータを消去
      navigation.setParams({ isIncomingCall: undefined, isVideoCall: undefined });
    }
  }, [route.params?.isIncomingCall, roomId]);

  /* ======================== 履歴・その他ファイル処理 ======================== */
  const onLoadEarlier = () => {
    setIsLoadingEarlier(true);
    const oldestMessage = messages[messages.length - 1];
    socket.emit('load_more_history', { roomId, cursor: oldestMessage ? oldestMessage.createdAt : new Date().toISOString() });
  };

  const jumpToPresent = () => {
    setIsViewingSearch(false);
    try { navigation.setParams({ targetMessageId: undefined }); } catch (e) {}
    setMessages([]); setHasMoreMessages(true);
    socket.emit('join_room', { roomId, userId: user._id });
  };

  const startRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') { Alert.alert(t('error'), t('cameraMicError') || 'マイクの権限が必要です'); return; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(recording);
    } catch (err) {}
  };

  const stopRecording = async () => {
    if (!recording) return;
    setRecording(undefined);
    await recording.stopAndUnloadAsync();
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    const uri = recording.getURI();
    if (uri) uploadAndSendAudio(uri);
  };

  const uploadAndSendAudio = async (uri: string) => {
    const formData = new FormData();
    if (Platform.OS === 'web') {
      const response = await fetch(uri); const blob = await response.blob();
      formData.append('audio', blob, 'voice_message.m4a');
    } else {
      // @ts-ignore
      formData.append('audio', { uri, type: 'audio/m4a', name: 'voice_message.m4a' });
    }
    try {
      const data = await apiClient.postForm('/upload-chat-audio', formData);
      socket.emit('send_message', { _id: Math.random().toString(36).substring(7), text: '', createdAt: new Date(), user: user, audio: data.url, roomId, isRead: false, receiverId: chatPartner.username });
    } catch (error) {}
  };

  const uploadAndSendMessage = async (uri: string) => {
    const formData = new FormData();
    if (Platform.OS === 'web') {
      const response = await fetch(uri); const blob = await response.blob();
      formData.append('image', blob, 'chat.jpg');
    } else {
      // @ts-ignore
      formData.append('image', { uri, type: 'image/jpeg', name: 'chat.jpg' });
    }
    try {
      const data = await apiClient.postForm('/upload-chat-image', formData);
      socket.emit('send_message', { _id: Math.random().toString(36).substring(7), text: '', createdAt: new Date(), user: user, image: data.url, roomId, isRead: false, receiverId: chatPartner.username });
    } catch (error) {}
  };

  const uploadAndSendFile = async (uri: string, name: string, mimeType: string) => {
    const formData = new FormData();
    if (Platform.OS === 'web') {
      const response = await fetch(uri); const blob = await response.blob();
      formData.append('file', blob, name);
    } else {
      // @ts-ignore
      formData.append('file', { uri, type: mimeType || 'application/octet-stream', name });
    }
    try {
      const data = await apiClient.postForm('/upload-chat-file', formData);
      socket.emit('send_message', { _id: Math.random().toString(36).substring(7), text: '', createdAt: new Date(), user: user, file: data.url, fileName: data.fileName || name, roomId, isRead: false, receiverId: chatPartner.username });
    } catch (error) {}
  };

  const pickAndSendImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    if (!result.canceled && result.assets && result.assets.length > 0) uploadAndSendMessage(result.assets[0].uri);
  };

  const takeAndSendPhoto = async () => {
    if (Platform.OS === 'web') {
      if (!cameraPermission?.granted) {
        const perm = await requestCameraPermission();
        if (!perm.granted) { Alert.alert(t('error'), t('cameraPermissionRequired') || 'カメラの許可が必要です'); return; }
      }
      setIsWebCameraVisible(true);
    } else {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (permissionResult.granted === false) { Alert.alert(t('error'), t('cameraPermissionRequired')); return; }
      let result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
      if (!result.canceled && result.assets && result.assets.length > 0) uploadAndSendMessage(result.assets[0].uri);
    }
  };

  const handleWebCameraCapture = async () => {
    if (cameraRef.current) {
      const photo = await cameraRef.current.takePictureAsync();
      setIsWebCameraVisible(false);
      if (photo && photo.uri) uploadAndSendMessage(photo.uri);
    }
  };

  const pickAndSendFile = async () => {
    let result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      uploadAndSendFile(asset.uri, asset.name, asset.mimeType || 'application/octet-stream');
    }
  };

  const handleAttachmentPress = () => setIsAttachmentModalVisible(true);

  const saveImageToGallery = async (imageUrl: string) => {
    if (Platform.OS === 'web') { window.alert(t('saveImageOnWebInstruction')); return; }
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') { Alert.alert(t('error'), t('mediaLibraryPermissionRequired')); return; }
    try {
      // @ts-ignore
      const fileUri = FileSystem.cacheDirectory + 'temp.jpg';
      const { uri } = await FileSystem.downloadAsync(imageUrl, fileUri);
      await MediaLibrary.createAssetAsync(uri);
      Alert.alert(t('success'), t('imageSavedSuccess'));
    } catch (error) { Alert.alert(t('error'), t('imageSavedError')); }
  };

  /* ======================== Typing & Send ======================== */
  const handleTyping = (text: string) => {
    if (!typingStateRef.current && text.length > 0) {
      typingStateRef.current = true; socket.emit('typing_start', { roomId, userId: user._id });
    }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      typingStateRef.current = false; socket.emit('typing_stop', { roomId, userId: user._id });
    }, 2000);
  };

  const onSend = useCallback((newMessages: IMessage[] = []) => {
    socket.emit('typing_stop', { roomId, userId: user._id });
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current); typingStateRef.current = false;
    socket.emit('send_message', { ...newMessages[0], roomId, isRead: false, receiverId: chatPartner.username });
  }, [roomId, chatPartner.username]);

  /* ======================== UI ======================== */
  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 80}>
      
      {hasMoreMessages && (
        <View style={{ position: 'absolute', top: 15, zIndex: 10, width: '100%', alignItems: 'center' }}>
          <TouchableOpacity
            style={{ backgroundColor: colors.primary, borderRadius: 20, paddingHorizontal: 20, paddingVertical: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3, elevation: 5 }}
            onPress={onLoadEarlier} disabled={isLoadingEarlier}
          >
            {isLoadingEarlier ? <ActivityIndicator color={colors.primaryText} size="small" /> : <Text style={{ color: colors.primaryText, fontWeight: 'bold' }}>{t('loadEarlierMessages') || '過去のメッセージを読み込む'}</Text>}
          </TouchableOpacity>
        </View>
      )}

      <GiftedChat
        messages={messages} onSend={msgs => onSend(msgs)} user={user} messagesContainerStyle={{ backgroundColor: colors.background }}
        textInputProps={{ placeholder: recording ? (t('recordingStatus') || '🔴 録音中...') : t('chatPlaceholder'), placeholderTextColor: recording ? '#FF3B30' : colors.secondaryText, style: { color: recording ? '#FF3B30' : colors.text, flex: 1, paddingVertical: 10 }, onChangeText: (text: string) => handleTyping(text), editable: !recording }}
        renderAvatar={() => null}
        
        renderInputToolbar={(props) => {
          if (blockedByMe) return (
            <View style={{ padding: 15, alignItems: 'center', backgroundColor: colors.card, borderTopWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.secondaryText, fontWeight: 'bold' }}>{t('cannotSendBlocked') || 'ブロック中のためメッセージを送れません'}</Text>
            </View>
          );
          return <InputToolbar {...props} containerStyle={{ backgroundColor: colors.card, borderTopColor: colors.border }} />;
        }}

        renderActions={(props) => (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 5 }}>
            <Actions {...props} icon={() => <Ionicons name="add" size={26} color={colors.primary} />} onPressActionButton={handleAttachmentPress} />
            <TouchableOpacity onPress={recording ? stopRecording : startRecording} style={{ padding: 5, marginRight: 5 }}>
              <Ionicons name={recording ? "stop-circle" : "mic"} size={26} color={recording ? "#FF3B30" : colors.primary} />
            </TouchableOpacity>
          </View>
        )}

        renderBubble={(props) => {
          const isTarget = props.currentMessage && props.currentMessage._id === targetMessageId;
          return (
            <Bubble {...props}
              renderTicks={(currentMessage: any) => { if (currentMessage.user._id === user._id && currentMessage.isRead) return <Text style={styles.readTicks}>{t('readStatus')}</Text>; return null; }}
              wrapperStyle={{ right: { backgroundColor: isTarget ? '#d4a373' : colors.chatBubbleSelf, borderWidth: isTarget ? 2 : 0, borderColor: '#fff' }, left: { backgroundColor: isTarget ? '#e9edc9' : colors.chatBubblePartner, borderWidth: isTarget ? 2 : 0, borderColor: colors.primary } }}
              textStyle={{ right: { color: colors.primaryText }, left: { color: colors.text } }}
            />
          );
        }}

        renderMessageImage={(props) => {
          return (
            <TouchableOpacity onPress={() => { if (props.currentMessage && props.currentMessage.image) { setSelectedImage(props.currentMessage.image); setIsModalVisible(true); } }}>
              <MessageImage {...props} />
            </TouchableOpacity>
          );
        }}

        renderMessageAudio={(props) => {
          if (props.currentMessage && props.currentMessage.audio) { return <AudioPlayer currentMessage={props.currentMessage} isMyMessage={props.currentMessage.user._id === user._id} colors={colors} />; }
          return null;
        }}

        renderCustomView={(props) => {
          // @ts-ignore
          if (props.currentMessage && props.currentMessage.file) {
            const isMyMessage = props.currentMessage.user._id === user._id;
            return (
              // @ts-ignore
              <TouchableOpacity style={{ padding: 10, flexDirection: 'row', alignItems: 'center' }} onPress={() => Linking.openURL(props.currentMessage.file)}>
                <Ionicons name="document-text" size={32} color={isMyMessage ? colors.primaryText : colors.primary} />
                {/* @ts-ignore */}
                <Text style={{ marginLeft: 10, color: isMyMessage ? colors.primaryText : colors.text, textDecorationLine: 'underline', flexShrink: 1 }}>{props.currentMessage.fileName || t('attachedFile')}</Text>
              </TouchableOpacity>
            );
          }
          return null;
        }}

        renderFooter={() => {
          if (!isPartnerTyping || blockedByMe || blockedByPartner || !isFriend) return null;
          return <View style={styles.typingIndicatorContainer}><Text style={[styles.typingIndicatorText, { color: colors.primary }]}>{t('typingIndicator').replace('%name%', chatPartner.displayName)}</Text></View>;
        }}
      />
      
      {isViewingSearch && (
        <TouchableOpacity style={[styles.jumpToPresentButton, { backgroundColor: colors.card }]} onPress={jumpToPresent}>
          <Ionicons name="chevron-down-circle" size={48} color={colors.primary} />
        </TouchableOpacity>
      )}

      <AttachmentModal visible={isAttachmentModalVisible} onClose={() => setIsAttachmentModalVisible(false)} onSelectImage={() => { setIsAttachmentModalVisible(false); setTimeout(() => pickAndSendImage(), 300); }} onTakePhoto={() => { setIsAttachmentModalVisible(false); setTimeout(() => takeAndSendPhoto(), 300); }} onSelectFile={() => { setIsAttachmentModalVisible(false); setTimeout(() => pickAndSendFile(), 300); }} />

      <Modal visible={isModalVisible} transparent={true} animationType="fade" onRequestClose={() => setIsModalVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setIsModalVisible(false)}>
          <View style={styles.modalContainer}>
            {selectedImage && <Image source={{ uri: selectedImage }} style={styles.fullImage} resizeMode="contain" />}
            <TouchableOpacity style={styles.closeButton} onPress={() => setIsModalVisible(false)}>
              <Ionicons name="close" size={30} color="#fff" />
            </TouchableOpacity>
            {selectedImage && (
              <TouchableOpacity style={[styles.closeButton, { right: 80 }]} onPress={() => saveImageToGallery(selectedImage)}>
                <Ionicons name="download-outline" size={30} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal visible={isWebCameraVisible} animationType="slide" transparent={false} onRequestClose={() => setIsWebCameraVisible(false)}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          {isWebCameraVisible && cameraPermission?.granted && (
            <CameraView ref={cameraRef} style={{ flex: 1 }} facing="front">
              <View style={{ flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 40 }}>
                <TouchableOpacity onPress={handleWebCameraCapture} style={{ width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(255,255,255,0.3)', borderWidth: 4, borderColor: '#fff', justifyContent: 'center', alignItems: 'center' }}>
                  <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: '#fff' }} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={() => setIsWebCameraVisible(false)} style={{ position: 'absolute', top: 40, right: 20 }}>
                <Ionicons name="close-circle" size={40} color="#fff" />
              </TouchableOpacity>
            </CameraView>
          )}
        </View>
      </Modal>

      <Modal visible={callStatus !== 'idle'} transparent={false} animationType="slide">
        <View style={[styles.callContainer, { backgroundColor: '#000000' }]}>
          <View style={styles.callHeader}>
            <Image source={{ uri: chatPartner.avatar || `${process.env.EXPO_PUBLIC_API_URL}/avatars/default.png` }} style={styles.callAvatar} />
            <Text style={styles.callName}>{chatPartner.displayName}</Text>
            <Text style={styles.callSubText}>
              {callStatus === 'calling' && (t('callCalling') || '発信中...')}
              {callStatus === 'incoming' && (isVideoCall ? (t('callIncomingVideo') || 'ビデオ通話の着信') : (t('callIncomingAudio') || '音声通話の着信'))}
              {callStatus === 'connected' && (t('callConnected') || '通話中')}
            </Text>
          </View>

          <View style={styles.videoArea}>
            {callStatus === 'connected' && (
              <>
                {Platform.OS === 'web' ? (
                  <>
                    {remoteStream && <WebVideoElement stream={remoteStream} style={{ width: '100%', height: '100%' }} isVideoCall={isVideoCall} />}
                    {localStream && <WebVideoElement stream={localStream} style={{ width: 120, height: 160, position: 'absolute', top: 60, right: 20, borderRadius: 12, muted: true }} isVideoCall={isVideoCall} />}
                  </>
                ) : (
                  isVideoCall && (
                    <>
                      {remoteStream && RTCViewComponent && <RTCViewComponent streamURL={typeof (remoteStream as any).toURL === 'function' ? (remoteStream as any).toURL() : remoteStream} style={styles.remoteVideo} {...({ objectFit: 'cover' } as any)} />}
                      {localStream && RTCViewComponent && <RTCViewComponent streamURL={typeof (localStream as any).toURL === 'function' ? (localStream as any).toURL() : localStream} style={styles.localVideo} {...({ objectFit: 'cover' } as any)} />}
                    </>
                  )
                )}
              </>
            )}
          </View>

          <View style={styles.callFooter}>
            {callStatus === 'incoming' ? (
              <View style={styles.buttonRow}>
                <TouchableOpacity onPress={rejectCall} style={[styles.circleButton, { backgroundColor: '#FF3B30' }]}>
                  <MaterialIcons name="call-end" size={32} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity onPress={acceptCall} style={[styles.circleButton, { backgroundColor: '#4CD964' }]}>
                  <Ionicons name="call" size={28} color="#fff" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={rejectCall} style={[styles.circleButton, { backgroundColor: '#FF3B30' }]}>
                <MaterialIcons name="call-end" size={32} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
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
  jumpToPresentButton: { position: 'absolute', right: 20, bottom: 80, borderRadius: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3, elevation: 5, zIndex: 99999 },
  callContainer: { flex: 1, justifyContent: 'space-between', alignItems: 'center', paddingTop: 80, paddingBottom: 60 },
  callHeader: { alignItems: 'center', zIndex: 10 },
  callAvatar: { width: 110, height: 110, borderRadius: 55, marginBottom: 20 },
  callName: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 8 },
  callSubText: { fontSize: 16, color: '#aaa' },
  videoArea: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  remoteVideo: { width: '100%', height: '100%', position: 'absolute' },
  localVideo: { width: 120, height: 160, position: 'absolute', top: 60, right: 20, borderRadius: 12, overflow: 'hidden', borderWidth: 2, borderColor: '#fff' },
  callFooter: { width: '100%', alignItems: 'center', zIndex: 10 },
  buttonRow: { flexDirection: 'row', width: '60%', justifyContent: 'space-around' },
  circleButton: { width: 70, height: 70, borderRadius: 35, justifyContent: 'center', alignItems: 'center', elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3 }
});