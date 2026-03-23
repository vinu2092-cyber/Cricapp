import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  interpolateColor,
  runOnJS,
} from 'react-native-reanimated';

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
  '#FF6347', // Tomato
  '#39FF14', // Neon Green
  '#FF073A', // Neon Red
  '#B026FF', // Neon Purple
  '#0FFF50', // Malachite
  '#FF5F1F', // Neon Orange
];

const getRandomColor = () => {
  return NEON_COLORS[Math.floor(Math.random() * NEON_COLORS.length)];
};

const getRandomSpeed = () => {
  // Random duration between 1000ms (fast) and 4000ms (slow)
  return Math.floor(Math.random() * 3000) + 1000;
};

const AnimatedGlowBorder: React.FC<AnimatedGlowBorderProps> = ({ children }) => {
  const [colors, setColors] = useState({
    color1: getRandomColor(),
    color2: getRandomColor(),
    color3: getRandomColor(),
    color4: getRandomColor(),
  });
  
  const [animationSpeed, setAnimationSpeed] = useState(getRandomSpeed());
  
  // Animation values for each border side
  const topProgress = useSharedValue(0);
  const rightProgress = useSharedValue(0);
  const bottomProgress = useSharedValue(0);
  const leftProgress = useSharedValue(0);
  
  // Glow intensity
  const glowIntensity = useSharedValue(0.5);

  // Change colors randomly
  useEffect(() => {
    const colorInterval = setInterval(() => {
      setColors({
        color1: getRandomColor(),
        color2: getRandomColor(),
        color3: getRandomColor(),
        color4: getRandomColor(),
      });
    }, 2000);

    return () => clearInterval(colorInterval);
  }, []);

  // Change animation speed randomly
  useEffect(() => {
    const speedInterval = setInterval(() => {
      setAnimationSpeed(getRandomSpeed());
    }, 5000);

    return () => clearInterval(speedInterval);
  }, []);

  // Start animations
  useEffect(() => {
    // Animate color progress with current speed
    topProgress.value = withRepeat(
      withTiming(1, { duration: animationSpeed, easing: Easing.linear }),
      -1,
      true
    );
    
    rightProgress.value = withRepeat(
      withSequence(
        withTiming(0.25, { duration: 0 }),
        withTiming(1.25, { duration: animationSpeed, easing: Easing.linear })
      ),
      -1,
      true
    );
    
    bottomProgress.value = withRepeat(
      withSequence(
        withTiming(0.5, { duration: 0 }),
        withTiming(1.5, { duration: animationSpeed, easing: Easing.linear })
      ),
      -1,
      true
    );
    
    leftProgress.value = withRepeat(
      withSequence(
        withTiming(0.75, { duration: 0 }),
        withTiming(1.75, { duration: animationSpeed, easing: Easing.linear })
      ),
      -1,
      true
    );

    // Glow pulse
    glowIntensity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: animationSpeed / 2, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.5, { duration: animationSpeed / 2, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );
  }, [animationSpeed]);

  // Animated styles for each border
  const topBorderStyle = useAnimatedStyle(() => {
    const progress = topProgress.value % 1;
    return {
      backgroundColor: interpolateColor(
        progress,
        [0, 0.33, 0.66, 1],
        [colors.color1, colors.color2, colors.color3, colors.color4]
      ),
      shadowColor: interpolateColor(
        progress,
        [0, 0.33, 0.66, 1],
        [colors.color1, colors.color2, colors.color3, colors.color4]
      ),
      shadowOpacity: glowIntensity.value,
      shadowRadius: 12 * glowIntensity.value,
    };
  });

  const rightBorderStyle = useAnimatedStyle(() => {
    const progress = rightProgress.value % 1;
    return {
      backgroundColor: interpolateColor(
        progress,
        [0, 0.33, 0.66, 1],
        [colors.color2, colors.color3, colors.color4, colors.color1]
      ),
      shadowColor: interpolateColor(
        progress,
        [0, 0.33, 0.66, 1],
        [colors.color2, colors.color3, colors.color4, colors.color1]
      ),
      shadowOpacity: glowIntensity.value,
      shadowRadius: 12 * glowIntensity.value,
    };
  });

  const bottomBorderStyle = useAnimatedStyle(() => {
    const progress = bottomProgress.value % 1;
    return {
      backgroundColor: interpolateColor(
        progress,
        [0, 0.33, 0.66, 1],
        [colors.color3, colors.color4, colors.color1, colors.color2]
      ),
      shadowColor: interpolateColor(
        progress,
        [0, 0.33, 0.66, 1],
        [colors.color3, colors.color4, colors.color1, colors.color2]
      ),
      shadowOpacity: glowIntensity.value,
      shadowRadius: 12 * glowIntensity.value,
    };
  });

  const leftBorderStyle = useAnimatedStyle(() => {
    const progress = leftProgress.value % 1;
    return {
      backgroundColor: interpolateColor(
        progress,
        [0, 0.33, 0.66, 1],
        [colors.color4, colors.color1, colors.color2, colors.color3]
      ),
      shadowColor: interpolateColor(
        progress,
        [0, 0.33, 0.66, 1],
        [colors.color4, colors.color1, colors.color2, colors.color3]
      ),
      shadowOpacity: glowIntensity.value,
      shadowRadius: 12 * glowIntensity.value,
    };
  });

  return (
    <View style={styles.container}>
      {/* Top Border */}
      <Animated.View style={[styles.borderTop, topBorderStyle]} />
      
      {/* Right Border */}
      <Animated.View style={[styles.borderRight, rightBorderStyle]} />
      
      {/* Bottom Border */}
      <Animated.View style={[styles.borderBottom, bottomBorderStyle]} />
      
      {/* Left Border */}
      <Animated.View style={[styles.borderLeft, leftBorderStyle]} />

      {/* Corner glow effects */}
      <Animated.View style={[styles.cornerTopLeft, topBorderStyle]} />
      <Animated.View style={[styles.cornerTopRight, rightBorderStyle]} />
      <Animated.View style={[styles.cornerBottomRight, bottomBorderStyle]} />
      <Animated.View style={[styles.cornerBottomLeft, leftBorderStyle]} />

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
    elevation: 10,
  },
  // Corner glow overlays for smooth transitions
  cornerTopLeft: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: BORDER_WIDTH * 2,
    height: BORDER_WIDTH * 2,
    borderTopLeftRadius: 4,
    zIndex: 1001,
    shadowOffset: { width: 2, height: 2 },
    elevation: 11,
  },
  cornerTopRight: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: BORDER_WIDTH * 2,
    height: BORDER_WIDTH * 2,
    borderTopRightRadius: 4,
    zIndex: 1001,
    shadowOffset: { width: -2, height: 2 },
    elevation: 11,
  },
  cornerBottomRight: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: BORDER_WIDTH * 2,
    height: BORDER_WIDTH * 2,
    borderBottomRightRadius: 4,
    zIndex: 1001,
    shadowOffset: { width: -2, height: -2 },
    elevation: 11,
  },
  cornerBottomLeft: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: BORDER_WIDTH * 2,
    height: BORDER_WIDTH * 2,
    borderBottomLeftRadius: 4,
    zIndex: 1001,
    shadowOffset: { width: 2, height: -2 },
    elevation: 11,
  },
});

export default AnimatedGlowBorder;
