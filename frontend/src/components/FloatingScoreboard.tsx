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
  const position = useRef(new Animated.ValueXY({ x: SCREEN_WIDTH - 180, y: 100 })).current;
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
        
        // Keep within screen bounds
        let currentX = (position.x as any)._value;
        let currentY = (position.y as any)._value;
        
        const widgetWidth = isMinimized ? 120 : 160;
        const widgetHeight = isMinimized ? 50 : 180;
        
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
        onError: () => {
          setIsSpeaking(false);
        },
      });
    };
    
    speakNext(0);
  };

  const stopSpeaking = async () => {
    setIsSpeaking(false);
    await Speech.stop();
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
              size={16}
              color="#FFF"
            />
          </TouchableOpacity>
          <TouchableOpacity style={styles.controlButton} onPress={onClose}>
            <Ionicons name="close" size={16} color="#FFF" />
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
        <View style={styles.teamScore}>
          <Text style={styles.teamName}>{team1?.shortName || 'TM1'}</Text>
          <Text style={styles.score}>
            {team1?.runs !== undefined ? `${team1.runs}/${team1.wickets || 0}` : '-'}
          </Text>
          {!isMinimized && team1?.overs && (
            <Text style={styles.overs}>({team1.overs} ov)</Text>
          )}
        </View>
        
        {!isMinimized && team2 && (
          <View style={styles.teamScore}>
            <Text style={styles.teamName}>{team2?.shortName || 'TM2'}</Text>
            <Text style={styles.score}>
              {team2?.runs !== undefined ? `${team2.runs}/${team2.wickets || 0}` : '-'}
            </Text>
            {team2?.overs && <Text style={styles.overs}>({team2.overs} ov)</Text>}
          </View>
        )}
      </View>

      {/* Voice commentary controls - only in expanded mode */}
      {!isMinimized && (
        <View style={styles.voiceControls}>
          <TouchableOpacity
            style={[styles.voiceButton, isSpeaking && styles.voiceButtonActive]}
            onPress={toggleSpeaking}
          >
            <Ionicons
              name={isSpeaking ? 'pause' : 'volume-high'}
              size={18}
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
          <Ionicons name="mic" size={12} color="#4CAF50" />
          <Text style={styles.speakingText} numberOfLines={1}>
            {match.commentary[currentCommentaryIndex].over}
          </Text>
        </View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    backgroundColor: 'rgba(26, 26, 26, 0.95)',
    borderRadius: 16,
    padding: 12,
    minWidth: 160,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
    zIndex: 9999,
  },
  containerMinimized: {
    minWidth: 120,
    padding: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  dragHandle: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  dragLine: {
    width: 30,
    height: 4,
    backgroundColor: '#666',
    borderRadius: 2,
  },
  controls: {
    flexDirection: 'row',
    gap: 8,
  },
  controlButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#FF4444',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginBottom: 8,
    gap: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFF',
  },
  liveText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  scoreContainer: {
    gap: 8,
  },
  teamScore: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  teamName: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
    minWidth: 35,
  },
  score: {
    color: '#4CAF50',
    fontSize: 16,
    fontWeight: 'bold',
  },
  overs: {
    color: '#999',
    fontSize: 10,
  },
  voiceControls: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    paddingTop: 8,
  },
  voiceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    gap: 6,
  },
  voiceButtonActive: {
    backgroundColor: '#4CAF50',
  },
  voiceButtonText: {
    color: '#4CAF50',
    fontSize: 12,
    fontWeight: '600',
  },
  voiceButtonTextActive: {
    color: '#FFF',
  },
  speakingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 4,
  },
  speakingText: {
    color: '#999',
    fontSize: 10,
    flex: 1,
  },
});

export default FloatingScoreboard;
