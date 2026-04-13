import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  PanResponder,
  Dimensions,
  Alert,
  AppState,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import * as Notifications from 'expo-notifications';
import { Match } from '../types/match';
import {
  checkOverlayPermission,
  requestOverlayPermission,
  showFloatingWidget,
  hideFloatingWidget,
} from '../services/FloatingWidgetService';

interface FloatingScoreboardProps {
  match: Match;
  visible: boolean;
  onClose: () => void;
  isPro: boolean;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SCOREBOARD_WIDTH = 330;
const SCOREBOARD_WIDTH_MIN = 260;

const FloatingScoreboard: React.FC<FloatingScoreboardProps> = ({
  match,
  visible,
  onClose,
  isPro,
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentCommIdx, setCurrentCommIdx] = useState(0);
  const [notifOverlayActive, setNotifOverlayActive] = useState(false);
  const [nativeOverlayActive, setNativeOverlayActive] = useState(false);
  const [pendingOverlayRequest, setPendingOverlayRequest] = useState(false);

  // SAFE: Track position with listeners instead of accessing _value
  const position = useRef(new Animated.ValueXY()).current;
  const scale = useRef(new Animated.Value(0)).current;
  const posRef = useRef({ x: SCREEN_WIDTH - SCOREBOARD_WIDTH - 10, y: 80 });

  // Set initial position
  useEffect(() => {
    position.setValue(posRef.current);
  }, []);

  // Track position safely via listeners
  useEffect(() => {
    const id = position.addListener((value) => {
      if (value && !isNaN(value.x) && !isNaN(value.y)) {
        posRef.current = { x: value.x, y: value.y };
      }
    });
    return () => position.removeListener(id);
  }, []);

  useEffect(() => {
    if (visible) {
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: false, // Changed to false to match position animations
        tension: 80,
        friction: 10,
      }).start();
    } else {
      scale.setValue(0);
      stopSpeaking();
    }
  }, [visible]);

  useEffect(() => {
    return () => {
      stopSpeaking();
      if (notifOverlayActive) disableNotifOverlay();
    };
  }, []);

  // Listen for app returning from settings after permission request
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      if (nextAppState === 'active' && pendingOverlayRequest) {
        // User came back from settings
        const granted = await checkOverlayPermission();
        setPendingOverlayRequest(false);
        
        if (granted) {
          // Permission granted! Start the floating widget
          await startNativeOverlay();
        }
      }
    });
    return () => subscription.remove();
  }, [pendingOverlayRequest, match]);

  // Start native floating widget overlay
  const startNativeOverlay = async () => {
    if (!isFloatingWidgetAvailable()) {
      Alert.alert('Not Supported', 'Floating overlay is only available on Android devices.');
      return;
    }

    const scoreData = {
      team1Name: match.teams[0]?.shortName || 'TM1',
      team2Name: match.teams[1]?.shortName || 'TM2',
      team1Score: match.teams[0]?.runs !== undefined 
        ? `${match.teams[0].runs}/${match.teams[0].wickets || 0}` 
        : '-',
      team2Score: match.teams[1]?.runs !== undefined 
        ? `${match.teams[1].runs}/${match.teams[1].wickets || 0}` 
        : '-',
      team1Overs: match.teams[0]?.overs?.toString() || '',
      team2Overs: match.teams[1]?.overs?.toString() || '',
      statusText: match.statusText || '',
      commentary: match.commentary?.[0]?.english || '',
    };

    const success = await showFloatingWidget(scoreData);
    if (success) {
      setNativeOverlayActive(true);
      Alert.alert(
        'Floating Widget Active!',
        'Score will now show over WhatsApp, YouTube and other apps. You can minimize CricApp now!\n\n• Drag widget to move\n• Tap to minimize\n• Tap ✕ to close',
        [{ text: 'Got it!' }]
      );
    }
  };

  // Handle Pin Score button click - opens native overlay over other apps
  const handlePinScorePress = async () => {
    if (nativeOverlayActive) {
      // Stop the overlay
      await hideFloatingWidget();
      setNativeOverlayActive(false);
      return;
    }

    // Check permission
    const hasPermission = await checkOverlayPermission();
    
    if (!hasPermission) {
      Alert.alert(
        'Permission Required',
        'To show live score over WhatsApp, YouTube and other apps, enable "Display over other apps" permission.',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Open Settings', 
            onPress: async () => {
              setPendingOverlayRequest(true);
              await requestOverlayPermission();
            }
          }
        ]
      );
      return;
    }

    // Permission granted, start overlay
    await startNativeOverlay();
  };

  // SAFE PanResponder - no _value access
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 5 || Math.abs(g.dy) > 5,
      onPanResponderGrant: () => {
        position.setOffset(posRef.current);
        position.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event(
        [null, { dx: position.x, dy: position.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => {
        position.flattenOffset();
        // Clamp to screen bounds
        let { x, y } = posRef.current;
        const w = SCOREBOARD_WIDTH;
        const h = 280;
        x = Math.max(5, Math.min(SCREEN_WIDTH - w - 5, x));
        y = Math.max(50, Math.min(SCREEN_HEIGHT - h - 100, y));
        Animated.spring(position, {
          toValue: { x, y },
          useNativeDriver: false,
          friction: 7,
        }).start();
      },
      onPanResponderTerminate: () => {
        position.flattenOffset();
      },
    })
  ).current;

  // Persistent Notification Overlay (shows score in notification bar for other apps)
  const enableNotifOverlay = async () => {
    try {
      const team1 = match.teams[0];
      const team2 = match.teams[1];
      const t1Score = team1?.runs !== undefined ? `${team1.runs}/${team1.wickets || 0}` : '-';
      const t2Score = team2?.runs !== undefined ? `${team2.runs}/${team2.wickets || 0}` : '-';

      await Notifications.scheduleNotificationAsync({
        content: {
          title: `${team1?.shortName || 'TM1'} ${t1Score} vs ${team2?.shortName || 'TM2'} ${t2Score}`,
          body: match.statusText || 'Live Score',
          data: { matchId: match.matchId, type: 'overlay' },
          sticky: true,
        },
        trigger: null,
        identifier: `overlay-${match.matchId}`,
      });
      setNotifOverlayActive(true);
    } catch (err) {
      console.warn('Notification overlay failed:', err);
    }
  };

  const disableNotifOverlay = async () => {
    try {
      await Notifications.cancelScheduledNotificationAsync(`overlay-${match.matchId}`);
      setNotifOverlayActive(false);
    } catch (err) {
      console.warn('Cancel overlay failed:', err);
    }
  };

  // Update notification overlay when score changes
  useEffect(() => {
    if (notifOverlayActive && visible) {
      enableNotifOverlay();
    }
  }, [match.teams[0]?.runs, match.teams[1]?.runs]);

  const speakCommentary = async () => {
    if (!match.commentary || match.commentary.length === 0) return;
    setIsSpeaking(true);

    const speakNext = (index: number) => {
      if (index >= (match.commentary?.length || 0)) {
        setIsSpeaking(false);
        return;
      }
      const comm = match.commentary![index];
      const text = `Over ${comm.over}. ${comm.english}`;
      setCurrentCommIdx(index);
      try {
        Speech.speak(text, {
          language: 'en-US',
          pitch: 0.9,
          rate: 0.95,
          onDone: () => setTimeout(() => speakNext(index + 1), 500),
          onError: () => setIsSpeaking(false),
        });
      } catch {
        setIsSpeaking(false);
      }
    };
    speakNext(0);
  };

  const stopSpeaking = () => {
    setIsSpeaking(false);
    try { Speech.stop(); } catch {}
  };

  if (!visible || !isPro) return null;

  const team1 = match.teams[0];
  const team2 = match.teams[1];

  return (
    <Animated.View
      style={[
        styles.container,
        isMinimized && styles.containerMin,
        {
          transform: [
            { translateX: position.x },
            { translateY: position.y },
            { scale },
          ],
        },
      ]}
      {...panResponder.panHandlers}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.dragHandle}>
          <View style={styles.dragLine} />
        </View>
        <View style={styles.controls}>
          {/* Notification Overlay Toggle */}
          <TouchableOpacity
            style={styles.ctrlBtn}
            onPress={notifOverlayActive ? disableNotifOverlay : enableNotifOverlay}
            data-testid="notif-overlay-toggle"
          >
            <Ionicons
              name={notifOverlayActive ? 'notifications' : 'notifications-outline'}
              size={16}
              color={notifOverlayActive ? '#4CAF50' : '#FFF'}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.ctrlBtn}
            onPress={() => setIsMinimized(!isMinimized)}
          >
            <Ionicons name={isMinimized ? 'expand' : 'contract'} size={16} color="#FFF" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.ctrlBtn} onPress={onClose}>
            <Ionicons name="close" size={16} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Live badge */}
      {match.status === 'live' && (
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
      )}

      {/* Scores */}
      <View style={styles.scores}>
        <View style={styles.teamRow}>
          <Text style={styles.teamName} numberOfLines={1}>{team1?.shortName || 'TM1'}</Text>
          <Text style={styles.score}>
            {team1?.runs !== undefined ? `${team1.runs}/${team1.wickets || 0}` : '-'}
          </Text>
          <Text style={styles.overs}>{team1?.overs ? `(${team1.overs})` : ''}</Text>
        </View>
        {team2 && (
          <View style={styles.teamRow}>
            <Text style={styles.teamName} numberOfLines={1}>{team2?.shortName || 'TM2'}</Text>
            <Text style={styles.score}>
              {team2?.runs !== undefined ? `${team2.runs}/${team2.wickets || 0}` : '-'}
            </Text>
            <Text style={styles.overs}>{team2?.overs ? `(${team2.overs})` : ''}</Text>
          </View>
        )}
      </View>

      {/* Status */}
      {!isMinimized && match.statusText && (
        <Text style={styles.status} numberOfLines={2}>{match.statusText}</Text>
      )}

      {/* Notification overlay info */}
      {!isMinimized && notifOverlayActive && (
        <View style={styles.overlayInfo}>
          <Ionicons name="checkmark-circle" size={14} color="#4CAF50" />
          <Text style={styles.overlayText}>Score pinned to notification! You can close app now.</Text>
        </View>
      )}
      
      {/* Pin to Notification Button - More visible */}
      {!isMinimized && !notifOverlayActive && (
        <TouchableOpacity 
          style={[styles.pinButton, nativeOverlayActive && styles.pinButtonActive]}
          onPress={handlePinScorePress}
          data-testid="pin-score-overlay-button"
        >
          <Ionicons name={nativeOverlayActive ? 'layers' : 'push-outline'} size={16} color="#FFF" />
          <Text style={styles.pinButtonText}>
            {nativeOverlayActive ? 'Overlay Active (Tap to Stop)' : 'Pin Score (View in Other Apps)'}
          </Text>
        </TouchableOpacity>
      )}
      
      {/* Native Overlay Active Info */}
      {!isMinimized && nativeOverlayActive && (
        <View style={styles.overlayInfo}>
          <Ionicons name="checkmark-circle" size={14} color="#FF6B00" />
          <Text style={[styles.overlayText, { color: '#FF6B00' }]}>
            Floating widget active! Minimize app to see it.
          </Text>
        </View>
      )}

      {/* Voice controls */}
      {!isMinimized && (
        <View style={styles.voiceRow}>
          <TouchableOpacity
            style={[styles.voiceBtn, isSpeaking && styles.voiceBtnActive]}
            onPress={isSpeaking ? stopSpeaking : speakCommentary}
          >
            <Ionicons
              name={isSpeaking ? 'pause' : 'volume-high'}
              size={18}
              color={isSpeaking ? '#FFF' : '#4CAF50'}
            />
            <Text style={[styles.voiceTxt, isSpeaking && styles.voiceTxtActive]}>
              {isSpeaking ? 'Pause' : 'Voice'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Speaking indicator */}
      {!isMinimized && isSpeaking && match.commentary?.[currentCommIdx] && (
        <View style={styles.speakRow}>
          <Ionicons name="mic" size={12} color="#4CAF50" />
          <Text style={styles.speakTxt} numberOfLines={2}>
            {match.commentary[currentCommIdx].over}: {match.commentary[currentCommIdx].english}
          </Text>
        </View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    backgroundColor: 'rgba(20, 20, 20, 0.97)',
    borderRadius: 18,
    padding: 16,
    minWidth: SCOREBOARD_WIDTH,
    maxWidth: SCOREBOARD_WIDTH + 10,
    elevation: 20,
    zIndex: 9999,
    borderWidth: 2,
    borderColor: 'rgba(76, 175, 80, 0.5)',
  },
  containerMin: {
    minWidth: SCOREBOARD_WIDTH_MIN,
    maxWidth: SCOREBOARD_WIDTH_MIN + 10,
    padding: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  dragHandle: { flex: 1, alignItems: 'center', paddingVertical: 5 },
  dragLine: { width: 45, height: 4, backgroundColor: '#777', borderRadius: 2 },
  controls: { flexDirection: 'row', gap: 8 },
  ctrlBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#FF4444',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 12,
    gap: 5,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFF' },
  liveText: { color: '#FFF', fontSize: 12, fontWeight: 'bold', letterSpacing: 1 },
  scores: { gap: 10 },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  teamName: { color: '#FFF', fontSize: 18, fontWeight: '700', minWidth: 60 },
  score: { color: '#4CAF50', fontSize: 28, fontWeight: 'bold', flex: 1, textAlign: 'right' },
  overs: { color: '#CCC', fontSize: 14, minWidth: 58, textAlign: 'right' },
  status: {
    color: '#FFD700',
    fontSize: 12,
    marginTop: 10,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  overlayInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    backgroundColor: 'rgba(76,175,80,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    alignSelf: 'center',
  },
  overlayText: { color: '#4CAF50', fontSize: 11 },
  pinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2196F3',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    gap: 8,
    marginTop: 10,
    alignSelf: 'center',
  },
  pinButtonActive: {
    backgroundColor: '#FF6B00',
  },
  pinButtonText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  voiceRow: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    paddingTop: 12,
  },
  voiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(76,175,80,0.2)',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 24,
    gap: 8,
  },
  voiceBtnActive: { backgroundColor: '#4CAF50' },
  voiceTxt: { color: '#4CAF50', fontSize: 15, fontWeight: '600' },
  voiceTxtActive: { color: '#FFF' },
  speakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
    paddingHorizontal: 4,
  },
  speakTxt: { color: '#CCC', fontSize: 12, flex: 1, lineHeight: 16 },
});

export default FloatingScoreboard;
