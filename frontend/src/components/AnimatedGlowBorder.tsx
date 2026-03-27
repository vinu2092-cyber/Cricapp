import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Dimensions, Animated } from 'react-native';

interface AnimatedGlowBorderProps {
  children: React.ReactNode;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const BORDER_WIDTH = 6;

// Vibrant neon color palette
const NEON_COLORS = [
  '#FF0080', // Hot Pink
  '#00FF00', // Neon Green
  '#00FFFF', // Cyan
  '#FF00FF', // Magenta
  '#FFFF00', // Yellow
  '#FF4500', // Orange Red
  '#7B68EE', // Medium Slate Blue
  '#00FF7F', // Spring Green
  '#FF1493', // Deep Pink
  '#1E90FF', // Dodger Blue
];

const getRandomColor = () => {
  return NEON_COLORS[Math.floor(Math.random() * NEON_COLORS.length)];
};

const AnimatedGlowBorder: React.FC<AnimatedGlowBorderProps> = ({ children }) => {
  const [currentColor, setCurrentColor] = useState(getRandomColor());
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0.5)).current;

  // Color rotation animation
  useEffect(() => {
    const colorInterval = setInterval(() => {
      setCurrentColor(getRandomColor());
    }, 2000);

    return () => clearInterval(colorInterval);
  }, []);

  // Fade animation
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: false,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: false,
        }),
      ])
    ).start();
  }, []);

  // Glow pulse animation
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: false,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.5,
          duration: 1500,
          useNativeDriver: false,
        }),
      ])
    ).start();
  }, []);

  return (
    <View style={styles.container}>
      {/* Top Border */}
      <Animated.View 
        style={[
          styles.borderTop, 
          { 
            backgroundColor: currentColor,
            shadowColor: currentColor,
            shadowOpacity: glowAnim,
          }
        ]} 
      />
      
      {/* Right Border */}
      <Animated.View 
        style={[
          styles.borderRight, 
          { 
            backgroundColor: currentColor,
            shadowColor: currentColor,
            shadowOpacity: glowAnim,
          }
        ]} 
      />
      
      {/* Bottom Border */}
      <Animated.View 
        style={[
          styles.borderBottom, 
          { 
            backgroundColor: currentColor,
            shadowColor: currentColor,
            shadowOpacity: glowAnim,
          }
        ]} 
      />
      
      {/* Left Border */}
      <Animated.View 
        style={[
          styles.borderLeft, 
          { 
            backgroundColor: currentColor,
            shadowColor: currentColor,
            shadowOpacity: glowAnim,
          }
        ]} 
      />

      {/* Main Content */}
      <View style={styles.content}>
        {children}
      </View>
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
    borderRadius: 8,
  },
  borderTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: BORDER_WIDTH,
    zIndex: 1000,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 10,
  },
  borderRight: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: BORDER_WIDTH,
    zIndex: 1000,
    shadowOffset: { width: -4, height: 0 },
    shadowRadius: 12,
    elevation: 10,
  },
  borderBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: BORDER_WIDTH,
    zIndex: 1000,
    shadowOffset: { width: 0, height: -4 },
    shadowRadius: 12,
    elevation: 10,
  },
  borderLeft: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: BORDER_WIDTH,
    zIndex: 1000,
    shadowOffset: { width: 4, height: 0 },
    shadowRadius: 12,
    elevation: 10,
  },
});

export default AnimatedGlowBorder;
