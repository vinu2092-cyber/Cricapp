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

// Bigger scoreboard dimensions for better visibility
const SCOREBOARD_WIDTH = 320;
const SCOREBOARD_WIDTH_MINIMIZED = 260;

const FloatingScoreboard: React.FC<FloatingScoreboardProps> = ({
  match,
  visible,
  onClose,
  isPro,
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentCommentaryIndex, setCurrentCommentaryIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const position = useRef(new Animated.ValueXY({ x: SCREEN_WIDTH - SCOREBOARD_WIDTH - 10, y: 80 })).current;
  const scale = useRef(new Animated.Value(0)).current;
  
  // Store last valid position to prevent crash
  const lastValidPosition = useRef({ x: SCREEN_WIDTH - SCOREBOARD_WIDTH - 10, y: 80 });

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

  // Safe pan responder with crash prevention
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only move if gesture is significant
        return Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5;
      },
      onPanResponderGrant: () => {
        try {
          setIsDragging(true);
          // Safely get current values
          const currentX = (position.x as any)._value || lastValidPosition.current.x;
          const currentY = (position.y as any)._value || lastValidPosition.current.y;
          
          position.setOffset({ x: currentX, y: currentY });
          position.setValue({ x: 0, y: 0 });
        } catch (error) {
          console.warn('PanResponder grant error:', error);
          // Reset to last valid position
          position.setValue(lastValidPosition.current);
        }
      },
      onPanResponderMove: (_, gestureState) => {
        try {
          // Manual position update instead of Animated.event to prevent crashes
          position.setValue({ x: gestureState.dx, y: gestureState.dy });
        } catch (error) {
          console.warn('PanResponder move error:', error);
        }
      },
      onPanResponderRelease: () => {
        try {
          setIsDragging(false);
          position.flattenOffset();
          
          let currentX = (position.x as any)._value || lastValidPosition.current.x;
          let currentY = (position.y as any)._value || lastValidPosition.current.y;
          
          // Ensure values are valid numbers
          if (isNaN(currentX)) currentX = lastValidPosition.current.x;
          if (isNaN(currentY)) currentY = lastValidPosition.current.y;
          
          const widgetWidth = isMinimized ? SCOREBOARD_WIDTH_MINIMIZED : SCOREBOARD_WIDTH;
          const widgetHeight = isMinimized ? 80 : 280;
          
          // Clamp to screen bounds with safe margins
          if (currentX < 10) currentX = 10;
          if (currentX > SCREEN_WIDTH - widgetWidth - 10) currentX = SCREEN_WIDTH - widgetWidth - 10;
          if (currentY < 60) currentY = 60;
          if (currentY > SCREEN_HEIGHT - widgetHeight - 120) currentY = SCREEN_HEIGHT - widgetHeight - 120;
          
          // Update last valid position
          lastValidPosition.current = { x: currentX, y: currentY };
          
          Animated.spring(position, {
            toValue: { x: currentX, y: currentY },
            useNativeDriver: false,
            friction: 7,
            tension: 40,
          }).start();
        } catch (error) {
          console.warn('PanResponder release error:', error);
          // Reset to last valid position on error
          position.setValue(lastValidPosition.current);
        }
      },
      onPanResponderTerminate: () => {
        setIsDragging(false);
        // Reset to last valid position on terminate
        position.setValue(lastValidPosition.current);
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
    backgroundColor: 'rgba(20, 20, 20, 0.98)',
    borderRadius: 20,
    padding: 18,
    minWidth: SCOREBOARD_WIDTH,
    maxWidth: SCOREBOARD_WIDTH + 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 20,
    zIndex: 9999,
    borderWidth: 2,
    borderColor: 'rgba(76, 175, 80, 0.5)',
  },
  containerMinimized: {
    minWidth: SCOREBOARD_WIDTH_MINIMIZED,
    maxWidth: SCOREBOARD_WIDTH_MINIMIZED + 20,
    padding: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  dragHandle: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
  },
  dragLine: {
    width: 50,
    height: 5,
    backgroundColor: '#777',
    borderRadius: 3,
  },
  controls: {
    flexDirection: 'row',
    gap: 10,
  },
  controlButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#FF4444',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 14,
    marginBottom: 14,
    gap: 6,
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFF',
  },
  liveText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 1.5,
  },
  scoreContainer: {
    gap: 14,
  },
  teamScore: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  teamName: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
    minWidth: 60,
  },
  score: {
    color: '#4CAF50',
    fontSize: 28,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'right',
  },
  overs: {
    color: '#CCC',
    fontSize: 14,
    minWidth: 65,
    textAlign: 'right',
  },
  statusText: {
    color: '#FFD700',
    fontSize: 13,
    marginTop: 12,
    textAlign: 'center',
    fontStyle: 'italic',
    paddingHorizontal: 8,
  },
  voiceControls: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.15)',
    paddingTop: 14,
  },
  voiceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(76, 175, 80, 0.25)',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 28,
    gap: 10,
  },
  voiceButtonActive: {
    backgroundColor: '#4CAF50',
  },
  voiceButtonText: {
    color: '#4CAF50',
    fontSize: 16,
    fontWeight: '600',
  },
  voiceButtonTextActive: {
    color: '#FFF',
  },
  speakingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 8,
    paddingHorizontal: 6,
  },
  speakingText: {
    color: '#CCC',
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
});

export default FloatingScoreboard;
