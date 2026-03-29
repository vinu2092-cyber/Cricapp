import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated, Platform } from 'react-native';

interface AnimatedGlowBorderProps {
  children: React.ReactNode;
}

const BORDER_WIDTH = 4;

const NEON_COLORS = [
  '#FF0080', '#00FF00', '#00FFFF', '#FF00FF',
  '#FFFF00', '#FF4500', '#7B68EE', '#00FF7F',
  '#FF1493', '#1E90FF',
];

const getRandomColor = () => NEON_COLORS[Math.floor(Math.random() * NEON_COLORS.length)];

const AnimatedGlowBorder: React.FC<AnimatedGlowBorderProps> = ({ children }) => {
  const [currentColor, setCurrentColor] = useState(getRandomColor());
  // Use opacity (safe for Android) instead of shadowOpacity (causes crash)
  const glowOpacity = useRef(new Animated.Value(0.7)).current;

  useEffect(() => {
    const colorInterval = setInterval(() => {
      setCurrentColor(getRandomColor());
    }, 2500);
    return () => clearInterval(colorInterval);
  }, []);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowOpacity, {
          toValue: 1,
          duration: 1800,
          useNativeDriver: true,
        }),
        Animated.timing(glowOpacity, {
          toValue: 0.5,
          duration: 1800,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  return (
    <View style={styles.container}>
      {/* Top Border - safe: uses opacity not shadowOpacity */}
      <Animated.View
        style={[
          styles.borderTop,
          { backgroundColor: currentColor, opacity: glowOpacity },
        ]}
      />
      {/* Right Border */}
      <Animated.View
        style={[
          styles.borderRight,
          { backgroundColor: currentColor, opacity: glowOpacity },
        ]}
      />
      {/* Bottom Border */}
      <Animated.View
        style={[
          styles.borderBottom,
          { backgroundColor: currentColor, opacity: glowOpacity },
        ]}
      />
      {/* Left Border */}
      <Animated.View
        style={[
          styles.borderLeft,
          { backgroundColor: currentColor, opacity: glowOpacity },
        ]}
      />

      {/* Main Content */}
      <View style={styles.content}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
  content: {
    flex: 1,
    marginTop: BORDER_WIDTH,
    marginBottom: BORDER_WIDTH,
    marginLeft: BORDER_WIDTH,
    marginRight: BORDER_WIDTH,
    overflow: 'hidden',
    borderRadius: 4,
  },
  borderTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: BORDER_WIDTH,
    zIndex: 1000,
    ...(Platform.OS === 'android' ? { elevation: 4 } : {
      shadowOffset: { width: 0, height: 4 },
      shadowRadius: 8,
      shadowOpacity: 0.6,
    }),
  },
  borderRight: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: BORDER_WIDTH,
    zIndex: 1000,
    ...(Platform.OS === 'android' ? { elevation: 4 } : {
      shadowOffset: { width: -4, height: 0 },
      shadowRadius: 8,
      shadowOpacity: 0.6,
    }),
  },
  borderBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: BORDER_WIDTH,
    zIndex: 1000,
    ...(Platform.OS === 'android' ? { elevation: 4 } : {
      shadowOffset: { width: 0, height: -4 },
      shadowRadius: 8,
      shadowOpacity: 0.6,
    }),
  },
  borderLeft: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: BORDER_WIDTH,
    zIndex: 1000,
    ...(Platform.OS === 'android' ? { elevation: 4 } : {
      shadowOffset: { width: 4, height: 0 },
      shadowRadius: 8,
      shadowOpacity: 0.6,
    }),
  },
});

export default AnimatedGlowBorder;
