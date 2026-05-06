import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

type MatchState = 'live' | 'upcoming' | 'completed' | 'abandoned' | 'delayed' | 'default';

interface MatchStatusBadgeProps {
  state?: string;
  isLive?: boolean;
}

// Determine match state from status text
const getMatchState = (state?: string, isLive?: boolean): MatchState => {
  if (isLive) return 'live';
  if (!state) return 'default';
  
  const s = state.toLowerCase();
  
  // Direct match for API states: 'live', 'recent', 'upcoming'
  if (s === 'live') return 'live';
  if (s === 'upcoming') return 'upcoming';
  if (s === 'recent') return 'completed';
  
  // IMPORTANT: Check abandon/no result FIRST before other patterns
  // This handles cases like "Match abandoned due to wet outfield (no toss)"
  if (s.includes('abandon') || s.includes('no result') || s.includes('cancelled') || s.includes('no play')) {
    return 'abandoned';
  }
  
  // Check completed/won before upcoming (handles result text)
  if (s.includes('won') || s.includes('draw') || s.includes('tied') || s.includes('complete') || s.includes('ended')) {
    return 'completed';
  }
  
  // Text-based matching for statusText
  if (s.includes('live') || s.includes('in progress') || s.includes('innings break') || s.includes('day ')) {
    return 'live';
  }
  if (s.includes('upcoming') || s.includes('starts') || s.includes('toss') || s.includes('match begins') || s.includes('preview')) {
    return 'upcoming';
  }
  if (s.includes('delay') || s.includes('rain') || s.includes('bad light')) {
    return 'delayed';
  }
  
  return 'default';
};

// Get badge config based on match state
const getBadgeConfig = (state: MatchState) => {
  switch (state) {
    case 'live':
      return { text: 'LIVE', bgColor: '#FF4444', showPulse: true };
    case 'upcoming':
      return { text: 'UPCOMING', bgColor: '#2196F3', showPulse: false };
    case 'completed':
      return { text: 'COMPLETED', bgColor: '#757575', showPulse: false };
    case 'abandoned':
      return { text: 'ABANDONED', bgColor: '#FF9800', showPulse: false };
    case 'delayed':
      return { text: 'DELAYED', bgColor: '#FF9800', showPulse: true };
    default:
      return { text: 'MATCH', bgColor: '#757575', showPulse: false };
  }
};

const MatchStatusBadge: React.FC<MatchStatusBadgeProps> = ({ state, isLive }) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const matchState = getMatchState(state, isLive);
  const config = getBadgeConfig(matchState);

  useEffect(() => {
    if (config.showPulse) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.3,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [config.showPulse]);

  return (
    <View style={[styles.container, { backgroundColor: config.bgColor }]}>
      {config.showPulse && (
        <Animated.View
          style={[
            styles.dot,
            {
              transform: [{ scale: pulseAnim }],
            },
          ]}
        />
      )}
      <Text style={styles.text}>{config.text}</Text>
    </View>
  );
};

// Legacy component for backward compatibility
const LiveIndicator: React.FC = () => {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.3,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.dot,
          {
            transform: [{ scale: pulseAnim }],
          },
        ]}
      />
      <Text style={styles.text}>LIVE</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF4444',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  text: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 10,
  },
});

export { MatchStatusBadge };
export default LiveIndicator;
