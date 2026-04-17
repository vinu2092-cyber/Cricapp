import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated, Dimensions } from 'react-native';

interface MatchMoodMeterProps {
  event?: 'wicket' | 'four' | 'six' | 'dot' | 'wide' | 'normal' | null;
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// Confetti particle
interface Particle {
  x: Animated.Value;
  y: Animated.Value;
  opacity: Animated.Value;
  rotation: Animated.Value;
  color: string;
  size: number;
}

const CELEBRATION_COLORS = ['#FFD700', '#4CAF50', '#FF4081', '#2196F3', '#FF9800', '#E91E63'];
const WICKET_COLORS = ['#FF4444', '#FF0000', '#CC0000', '#FF6666'];

const MatchMoodMeter: React.FC<MatchMoodMeterProps> = ({ event }) => {
  const flashOpacity = useRef(new Animated.Value(0)).current;
  const [particles, setParticles] = useState<Particle[]>([]);
  const [flashColor, setFlashColor] = useState('transparent');

  useEffect(() => {
    if (!event || event === 'normal' || event === 'dot') return;

    if (event === 'wicket') {
      triggerWicketFlash();
    } else if (event === 'six') {
      triggerConfetti(CELEBRATION_COLORS, 20);
      triggerFlash('#FFD700');
    } else if (event === 'four') {
      triggerConfetti(CELEBRATION_COLORS, 12);
      triggerFlash('#4CAF50');
    } else if (event === 'wide') {
      triggerFlash('#FF9800');
      triggerConfetti(['#FF9800', '#FFC107', '#FFE082'], 6);
    }
  }, [event]);

  const triggerFlash = (color: string) => {
    setFlashColor(color);
    flashOpacity.setValue(0.35);
    Animated.timing(flashOpacity, {
      toValue: 0,
      duration: 800,
      useNativeDriver: true,
    }).start();
  };

  const triggerWicketFlash = () => {
    setFlashColor('#FF0000');
    // Double flash for wicket - dramatic effect
    Animated.sequence([
      Animated.timing(flashOpacity, { toValue: 0.4, duration: 150, useNativeDriver: true }),
      Animated.timing(flashOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(flashOpacity, { toValue: 0.3, duration: 150, useNativeDriver: true }),
      Animated.timing(flashOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
    triggerConfetti(WICKET_COLORS, 8);
  };

  const triggerConfetti = (colors: string[], count: number) => {
    const newParticles: Particle[] = [];
    for (let i = 0; i < count; i++) {
      newParticles.push({
        x: new Animated.Value(Math.random() * SCREEN_W),
        y: new Animated.Value(-20),
        opacity: new Animated.Value(1),
        rotation: new Animated.Value(0),
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() * 12 + 6,
      });
    }
    setParticles(newParticles);

    // Animate particles falling
    const animations = newParticles.map((p, idx) => {
      const duration = 1500 + Math.random() * 1000;
      const endX = (Math.random() - 0.5) * 200;
      // Initial X is already set via Animated.Value constructor
      const targetX = Math.random() * SCREEN_W + endX;
      return Animated.parallel([
        Animated.timing(p.y, {
          toValue: SCREEN_H + 50,
          duration,
          useNativeDriver: true,
        }),
        Animated.timing(p.x, {
          toValue: targetX,
          duration,
          useNativeDriver: true,
        }),
        Animated.timing(p.rotation, {
          toValue: Math.random() * 720,
          duration,
          useNativeDriver: true,
        }),
        Animated.timing(p.opacity, {
          toValue: 0,
          duration,
          delay: duration * 0.6,
          useNativeDriver: true,
        }),
      ]);
    });

    Animated.parallel(animations).start(() => {
      setParticles([]);
    });
  };

  return (
    <View style={styles.container} pointerEvents="none">
      {/* Screen Flash */}
      <Animated.View
        style={[
          styles.flash,
          { backgroundColor: flashColor, opacity: flashOpacity },
        ]}
      />

      {/* Confetti Particles */}
      {particles.map((p, i) => (
        <Animated.View
          key={`particle-${i}`}
          style={[
            styles.particle,
            {
              width: p.size,
              height: p.size,
              backgroundColor: p.color,
              borderRadius: p.size / 2,
              opacity: p.opacity,
              transform: [
                { translateX: p.x },
                { translateY: p.y },
                {
                  rotate: p.rotation.interpolate({
                    inputRange: [0, 360],
                    outputRange: ['0deg', '360deg'],
                  }),
                },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 8888,
  },
  flash: {
    ...StyleSheet.absoluteFillObject,
  },
  particle: {
    position: 'absolute',
  },
});

export default MatchMoodMeter;
