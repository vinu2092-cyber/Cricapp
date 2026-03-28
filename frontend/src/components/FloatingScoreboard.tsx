import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  PanResponder,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { Match, Commentary } from '../types/match';

interface FloatingScoreboardProps {
  match: Match;
  visible: boolean;
  onClose: () => void;
  isPro: boolean;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const FloatingScoreboard: React.FC<FloatingScoreboardProps> = ({
  match,
  visible,
  onClose,
  isPro,
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentCommentaryIndex, setCurrentCommentaryIndex] = useState(0);
  const position = useRef(new Animated.ValueXY({ x: SCREEN_WIDTH - 260, y: 80 })).current;
  const scale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        tension: 100,
        friction: 8,
      }).start();
    } else {
      scale.setValue(0);
      stopSpeaking();
    }
  }, [visible]);

  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        position.setOffset({
          x: (position.x as any)._value,
          y: (position.y as any)._value,
        });
        position.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event(
        [null, { dx: position.x, dy: position.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => {
        position.flattenOffset();
        
        let currentX = (position.x as any)._value;
        let currentY = (position.y as any)._value;
        
        const widgetWidth = isMinimized ? 160 : 240;
        const widgetHeight = isMinimized ? 60 : 240;
        
        if (currentX < 0) currentX = 0;
        if (currentX > SCREEN_WIDTH - widgetWidth) currentX = SCREEN_WIDTH - widgetWidth;
        if (currentY < 50) currentY = 50;
        if (currentY > SCREEN_HEIGHT - widgetHeight - 100) currentY = SCREEN_HEIGHT - widgetHeight - 100;
        
        Animated.spring(position, {
          toValue: { x: currentX, y: currentY },
          useNativeDriver: false,
          friction: 7,
        }).start();
      },
    })
  ).current;

  const speakCommentary = async () => {
    if (!match.commentary || match.commentary.length === 0) return;
    
    setIsSpeaking(true);
    
    const speakNext = async (index: number) => {
      if (index >= match.commentary!.length || !isSpeaking) {
        setIsSpeaking(false);
        return;
      }
      
      const commentary = match.commentary![index];
      const text = `Over ${commentary.over}. ${commentary.english}`;
      
      setCurrentCommentaryIndex(index);
      
      try {
        await Speech.speak(text, {
          language: 'en-US',
          pitch: 0.9,
          rate: 0.95,
          onDone: () => {
            setTimeout(() => {
              if (isSpeaking) {
                speakNext(index + 1);
              }
            }, 500);
          },
          onError: (error) => {
            console.error('Speech error:', error);
            setIsSpeaking(false);
          },
        });
      } catch (error) {
        console.error('Speech error:', error);
        setIsSpeaking(false);
      }
    };
    
    speakNext(0);
  };

  const stopSpeaking = async () => {
    setIsSpeaking(false);
    try {
      await Speech.stop();
    } catch (error) {
      console.error('Error stopping speech:', error);
    }
  };

  const toggleSpeaking = () => {
    if (isSpeaking) {
      stopSpeaking();
    } else {
      speakCommentary();
    }
  };

  if (!visible || !isPro) return null;

  const team1 = match.teams[0];
  const team2 = match.teams[1];

  return (
    <Animated.View
      style={[
        styles.container,
        isMinimized ? styles.containerMinimized : null,
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
      {/* Header with drag handle and controls */}
      <View style={styles.header}>
        <View style={styles.dragHandle}>
          <View style={styles.dragLine} />
        </View>
        <View style={styles.controls}>
          <TouchableOpacity
            style={styles.controlButton}
            onPress={() => setIsMinimized(!isMinimized)}
          >
            <Ionicons
              name={isMinimized ? 'expand' : 'contract'}
              size={18}
              color="#FFF"
            />
          </TouchableOpacity>
          <TouchableOpacity style={styles.controlButton} onPress={onClose}>
            <Ionicons name="close" size={18} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Live indicator */}
      {match.status === 'live' && (
        <View style={styles.liveIndicator}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
      )}

      {/* Score display */}
      <View style={styles.scoreContainer}>
        {/* Team 1 - Always visible */}
        <View style={styles.teamScore}>
          <Text style={styles.teamName} numberOfLines={1}>{team1?.shortName || 'TM1'}</Text>
          <Text style={styles.score}>
            {team1?.runs !== undefined ? `${team1.runs}/${team1.wickets || 0}` : '-'}
          </Text>
          <Text style={styles.overs}>
            {team1?.overs ? `(${team1.overs} ov)` : ''}
          </Text>
        </View>
        
        {/* Team 2 - Always visible (even minimized) */}
        {team2 && (
          <View style={styles.teamScore}>
            <Text style={styles.teamName} numberOfLines={1}>{team2?.shortName || 'TM2'}</Text>
            <Text style={styles.score}>
              {team2?.runs !== undefined ? `${team2.runs}/${team2.wickets || 0}` : '-'}
            </Text>
            <Text style={styles.overs}>
              {team2?.overs ? `(${team2.overs} ov)` : ''}
            </Text>
          </View>
        )}
      </View>

      {/* Status text */}
      {!isMinimized && match.result && (
        <Text style={styles.statusText} numberOfLines={2}>{match.result}</Text>
      )}

      {/* Voice commentary controls - only in expanded mode */}
      {!isMinimized && (
        <View style={styles.voiceControls}>
          <TouchableOpacity
            style={[styles.voiceButton, isSpeaking && styles.voiceButtonActive]}
            onPress={toggleSpeaking}
          >
            <Ionicons
              name={isSpeaking ? 'pause' : 'volume-high'}
              size={20}
              color={isSpeaking ? '#FFF' : '#4CAF50'}
            />
            <Text style={[styles.voiceButtonText, isSpeaking && styles.voiceButtonTextActive]}>
              {isSpeaking ? 'Pause' : 'Voice'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Current commentary being spoken */}
      {!isMinimized && isSpeaking && match.commentary && match.commentary[currentCommentaryIndex] && (
        <View style={styles.speakingIndicator}>
          <Ionicons name="mic" size={14} color="#4CAF50" />
          <Text style={styles.speakingText} numberOfLines={2}>
            {match.commentary[currentCommentaryIndex].over}: {match.commentary[currentCommentaryIndex].english}
          </Text>
        </View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    backgroundColor: 'rgba(20, 20, 20, 0.95)',
    borderRadius: 16,
    padding: 14,
    minWidth: 230,
    maxWidth: 280,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 15,
    zIndex: 9999,
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.3)',
  },
  containerMinimized: {
    minWidth: 180,
    maxWidth: 220,
    padding: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  dragHandle: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  dragLine: {
    width: 40,
    height: 4,
    backgroundColor: '#666',
    borderRadius: 2,
  },
  controls: {
    flexDirection: 'row',
    gap: 8,
  },
  controlButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#FF4444',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    marginBottom: 10,
    gap: 5,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFF',
  },
  liveText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  scoreContainer: {
    gap: 10,
  },
  teamScore: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  teamName: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
    minWidth: 50,
  },
  score: {
    color: '#4CAF50',
    fontSize: 20,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'right',
  },
  overs: {
    color: '#AAA',
    fontSize: 12,
    minWidth: 55,
    textAlign: 'right',
  },
  statusText: {
    color: '#FFD700',
    fontSize: 11,
    marginTop: 8,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  voiceControls: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    paddingTop: 10,
  },
  voiceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 24,
    gap: 8,
  },
  voiceButtonActive: {
    backgroundColor: '#4CAF50',
  },
  voiceButtonText: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '600',
  },
  voiceButtonTextActive: {
    color: '#FFF',
  },
  speakingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
    paddingHorizontal: 4,
  },
  speakingText: {
    color: '#AAA',
    fontSize: 11,
    flex: 1,
    lineHeight: 16,
  },
});

export default FloatingScoreboard;
