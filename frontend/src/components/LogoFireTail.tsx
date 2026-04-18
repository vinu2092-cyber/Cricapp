import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';

interface LogoFireTailProps {
  size: number;           // diameter (should match the logo container size)
  children: React.ReactNode;
  durationMs?: number;    // one full revolution; default 30_000 (30s)
}

/**
 * Wraps the app logo and renders a rainbow "fire-tail" that orbits the logo
 * clockwise. Implemented with a rotating `View` that holds an off-center
 * glow dot + short trailing arc, so the tail appears to chase itself around
 * the circle.
 *
 * No extra native libs — pure RN `Animated` (native driver) for perf.
 */
const LogoFireTail: React.FC<LogoFireTailProps> = ({ size, children, durationMs = 30000 }) => {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: durationMs,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, [durationMs, spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const radius = size / 2;
  const dotSize = Math.round(size * 0.14); // the leading fire-ball
  const trailLen = Math.round(size * 0.42);

  // Rainbow gradient approximated with 5 stacked dots of different colors, each
  // slightly offset behind the leading one — forms a tapering tail.
  const tail = [
    { color: '#FF3B30', opacity: 1.00, offset: 0 },
    { color: '#FF9500', opacity: 0.85, offset: 1 },
    { color: '#FFCC00', opacity: 0.70, offset: 2 },
    { color: '#34C759', opacity: 0.55, offset: 3 },
    { color: '#007AFF', opacity: 0.40, offset: 4 },
    { color: '#AF52DE', opacity: 0.25, offset: 5 },
  ];

  const step = trailLen / tail.length;

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      {/* Rotating orbit */}
      <Animated.View
        style={[
          styles.orbit,
          {
            width: size,
            height: size,
            transform: [{ rotate }],
          },
        ]}
        pointerEvents="none"
      >
        {tail.map((t, i) => {
          // Each tail dot sits at a slightly smaller angle behind the leader,
          // simulated by translating along the X axis from the center.
          const angle = (t.offset * 6) * (Math.PI / 180); // 6° between dots
          const tx = Math.cos(angle) * (radius - dotSize / 2);
          const ty = Math.sin(angle) * (radius - dotSize / 2);
          const dSize = Math.max(3, dotSize - i * 1.4);
          return (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: radius + tx - dSize / 2,
                top: radius + ty - dSize / 2,
                width: dSize,
                height: dSize,
                borderRadius: dSize / 2,
                backgroundColor: t.color,
                opacity: t.opacity,
                // Glow-like halo via elevation on Android + subtle shadow fallback
                elevation: i === 0 ? 6 : 0,
              }}
            />
          );
        })}
      </Animated.View>

      {/* Static logo content */}
      <View style={styles.content} pointerEvents="box-none">
        {children}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbit: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default LogoFireTail;
