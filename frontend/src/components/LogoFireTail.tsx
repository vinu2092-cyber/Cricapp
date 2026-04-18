import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { useFireTailAlert } from '../context/FireTailAlertContext';

interface LogoFireTailProps {
  size: number;                 // diameter (should match the logo container size)
  children: React.ReactNode;
  normalDurationMs?: number;    // one full revolution in normal mode; default 30_000 (30s)
  wicketDurationMs?: number;    // fast mode duration; default 5_000 (5s)
}

/**
 * Wraps the app logo and renders a rainbow "fire-tail" that orbits the logo
 * clockwise. Reads the global FireTailAlert mode:
 *   - `normal`: rainbow dots, slow (30s per revolution)
 *   - `wicket`: all-red dots, fast (5s per revolution) — triggered for 10s on wicket
 *
 * Auto-swaps between the two modes without re-mounting so the orbit animation
 * is never interrupted (we just restart the Animated loop with a new duration).
 */
const RAINBOW = [
  { color: '#FF3B30', opacity: 1.00, offset: 0 },
  { color: '#FF9500', opacity: 0.85, offset: 1 },
  { color: '#FFCC00', opacity: 0.70, offset: 2 },
  { color: '#34C759', opacity: 0.55, offset: 3 },
  { color: '#007AFF', opacity: 0.40, offset: 4 },
  { color: '#AF52DE', opacity: 0.25, offset: 5 },
];

const RED_BURST = [
  { color: '#FF1744', opacity: 1.00, offset: 0 },
  { color: '#FF1744', opacity: 0.90, offset: 1 },
  { color: '#FF5252', opacity: 0.78, offset: 2 },
  { color: '#FF5252', opacity: 0.62, offset: 3 },
  { color: '#FF8A80', opacity: 0.45, offset: 4 },
  { color: '#FF8A80', opacity: 0.28, offset: 5 },
];

const LogoFireTail: React.FC<LogoFireTailProps> = ({
  size,
  children,
  normalDurationMs = 30000,
  wicketDurationMs = 5000,
}) => {
  const { mode } = useFireTailAlert();
  const spin = useRef(new Animated.Value(0)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  // Start / restart the orbit loop whenever mode changes so speed updates live.
  useEffect(() => {
    const duration = mode === 'wicket' ? wicketDurationMs : normalDurationMs;
    if (loopRef.current) {
      loopRef.current.stop();
    }
    spin.setValue(0);
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loopRef.current = loop;
    loop.start();
    return () => {
      loop.stop();
    };
  }, [mode, normalDurationMs, wicketDurationMs, spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const radius = size / 2;
  const baseDotSize = mode === 'wicket' ? Math.round(size * 0.17) : Math.round(size * 0.14);
  const trailLen = Math.round(size * 0.42);

  const palette = mode === 'wicket' ? RED_BURST : RAINBOW;

  const step = trailLen / palette.length;

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
        {palette.map((t, i) => {
          // Each tail dot sits at a slightly smaller angle behind the leader,
          // simulated by translating along the X axis from the center.
          const angle = (t.offset * 6) * (Math.PI / 180); // 6° between dots
          const tx = Math.cos(angle) * (radius - baseDotSize / 2);
          const ty = Math.sin(angle) * (radius - baseDotSize / 2);
          const dSize = Math.max(3, baseDotSize - i * 1.4);
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
                // Glow-like halo via elevation on Android (stronger in wicket mode)
                elevation: i === 0 ? (mode === 'wicket' ? 10 : 6) : 0,
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
