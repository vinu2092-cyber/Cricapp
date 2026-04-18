import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { useFireTailAlert } from '../context/FireTailAlertContext';

interface LogoFireTailProps {
  size: number;                 // diameter of the (square) logo container
  children: React.ReactNode;
  normalDurationMs?: number;    // one full revolution in normal mode; default 30_000 (30s)
  wicketDurationMs?: number;    // fast mode duration; default 5_000 (5s)
  /** Legacy alias (older Header passed this) — treated as `normalDurationMs`. */
  durationMs?: number;
}

/**
 * LogoFireTail — wraps the app logo and animates a SINGLE fireball with a
 * rainbow "smoke tail" around a RECTANGULAR orbit that TOUCHES the logo border.
 *
 * Design:
 *   - The fireball orbits on the *exact* edge of the logo square (no gap).
 *   - The ball itself is a speckled multi-colour fireball: inner core + rainbow
 *     pixel grains sprayed over the core that emit simultaneous rainbow light.
 *   - Behind the ball, a trail of softer dots forms the smoke, each carrying a
 *     different rainbow hue with increasing shadow radius → reads as rainbow smoke.
 *   - Wicket alert mode: switches to a pure red-burst palette + faster orbit.
 */
const RAINBOW = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#007AFF', '#AF52DE'];
const RED_BURST = ['#FF1744', '#FF5252', '#FF8A80'];

const TAIL_COUNT = 10; // 1 fireball leader + 9 rainbow smoke dots

const LogoFireTail: React.FC<LogoFireTailProps> = ({
  size,
  children,
  normalDurationMs,
  wicketDurationMs = 5000,
  durationMs,
}) => {
  const { mode } = useFireTailAlert();

  const effectiveNormalDuration = normalDurationMs ?? durationMs ?? 30000;
  const duration = mode === 'wicket' ? wicketDurationMs : effectiveNormalDuration;

  const anims = useRef(Array.from({ length: TAIL_COUNT }, () => new Animated.Value(0))).current;

  useEffect(() => {
    const loops: Animated.CompositeAnimation[] = [];
    const timers: ReturnType<typeof setTimeout>[] = [];

    // Tail span: how far behind the leader the furthest smoke dot sits (as a
    // fraction of the full revolution).
    const tailSpanFraction = mode === 'wicket' ? 0.14 : 0.10;
    const perDotDelayMs = (duration * tailSpanFraction) / TAIL_COUNT;

    anims.forEach((anim, i) => {
      anim.setValue(0);
      const loop = Animated.loop(
        Animated.timing(anim, {
          toValue: 1,
          duration,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      const timer = setTimeout(() => loop.start(), Math.round(perDotDelayMs * i));
      loops.push(loop);
      timers.push(timer);
    });

    return () => {
      timers.forEach((t) => clearTimeout(t));
      loops.forEach((l) => l.stop());
    };
  }, [duration, mode, anims]);

  // ===== Geometry =====
  // The fireball's CENTER traces a square of side = logo size → so the outer
  // edge of the ball just kisses the logo border. Container must be slightly
  // larger than size so the ball (radius) doesn't clip outside.
  const leaderRadius = Math.round(size * 0.075); // fireball core radius (smaller so it hugs logo tightly)
  const halfOrbit = size / 2;                    // orbit rectangle half-side == logo half-side
  const containerPad = leaderRadius + 2;         // room for the ball + subtle shadow
  const containerSize = size + containerPad * 2;

  const TX_OUT = [-halfOrbit, halfOrbit, halfOrbit, -halfOrbit, -halfOrbit];
  const TY_OUT = [-halfOrbit, -halfOrbit, halfOrbit, halfOrbit, -halfOrbit];
  const INPUT_CORNERS = [0, 0.25, 0.5, 0.75, 1];

  const palette = mode === 'wicket' ? RED_BURST : RAINBOW;
  const smokeColorFor = (i: number) => palette[(i - 1) % palette.length];

  return (
    <View
      style={[styles.wrap, { width: containerSize, height: containerSize }]}
      pointerEvents="box-none"
    >
      {/* Static logo content — mount FIRST so fireball orbits ABOVE the logo */}
      <View
        style={[
          styles.content,
          {
            width: size,
            height: size,
            position: 'absolute',
            left: (containerSize - size) / 2,
            top: (containerSize - size) / 2,
          },
        ]}
        pointerEvents="box-none"
      >
        {children}
      </View>

      {anims.map((anim, i) => {
        const tx = anim.interpolate({ inputRange: INPUT_CORNERS, outputRange: TX_OUT });
        const ty = anim.interpolate({ inputRange: INPUT_CORNERS, outputRange: TY_OUT });

        const t = i / Math.max(1, TAIL_COUNT - 1);
        const dotRadius = leaderRadius * (1 - t * 0.55);
        const dotOpacity = i === 0 ? 1 : 0.85 * (1 - t * 0.75);

        const isLeader = i === 0;

        return (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={[
              styles.dotWrap,
              {
                left: containerSize / 2 - dotRadius,
                top: containerSize / 2 - dotRadius,
                width: dotRadius * 2,
                height: dotRadius * 2,
                opacity: dotOpacity,
                transform: [{ translateX: tx }, { translateY: ty }],
              },
            ]}
          >
            {isLeader ? (
              <Fireball radius={leaderRadius} mode={mode} />
            ) : (
              <View
                style={{
                  width: dotRadius * 2,
                  height: dotRadius * 2,
                  borderRadius: dotRadius,
                  backgroundColor: smokeColorFor(i),
                  shadowColor: smokeColorFor(i),
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.9,
                  shadowRadius: dotRadius * (1.2 + t * 1.4),
                  elevation: Math.max(2, 8 - i),
                }}
              />
            )}
          </Animated.View>
        );
      })}
    </View>
  );
};

/**
 * Fireball — single speckled multi-colour ball with a fiery aura. Renders:
 *  - 3 concentric glow rings (aura / flame / inner-flame)
 *  - Bright inner core
 *  - Rainbow "pixel grains" sprayed across the core so the ball spits multiple
 *    colours simultaneously (as user requested: single ball, many colour grains).
 */
const Fireball: React.FC<{ radius: number; mode: 'normal' | 'wicket' }> = ({ radius, mode }) => {
  const haloOuter = mode === 'wicket' ? '#D50000' : '#FF3B30';
  const haloMid = mode === 'wicket' ? '#FF1744' : '#FF6B00';
  const haloInner = mode === 'wicket' ? '#FF5252' : '#FFB300';
  const coreColor = mode === 'wicket' ? '#FFEBEE' : '#FFF8E1';

  // Grain positions & colours: sprayed rainbow pixels on the fireball surface.
  // In wicket mode grains go red-only so the whole ball reads "emergency red".
  const GRAIN_LAYOUT = [
    { x: 0.30, y: 0.30, size: 0.24, color: '#FF3B30' }, // red
    { x: 0.65, y: 0.25, size: 0.20, color: '#FF9500' }, // orange
    { x: 0.75, y: 0.60, size: 0.22, color: '#FFCC00' }, // yellow
    { x: 0.40, y: 0.72, size: 0.20, color: '#34C759' }, // green
    { x: 0.25, y: 0.55, size: 0.18, color: '#007AFF' }, // blue
    { x: 0.55, y: 0.45, size: 0.18, color: '#AF52DE' }, // purple
  ];

  const grainColor = (base: string) => (mode === 'wicket' ? '#FF1744' : base);

  return (
    <View style={{ width: radius * 2, height: radius * 2 }}>
      {/* Outer halo — aura */}
      <View
        style={{
          position: 'absolute',
          left: -radius * 0.75,
          top: -radius * 0.75,
          width: radius * 3.5,
          height: radius * 3.5,
          borderRadius: radius * 1.75,
          backgroundColor: haloOuter,
          opacity: 0.22,
        }}
      />
      {/* Middle halo — flame */}
      <View
        style={{
          position: 'absolute',
          left: -radius * 0.4,
          top: -radius * 0.4,
          width: radius * 2.8,
          height: radius * 2.8,
          borderRadius: radius * 1.4,
          backgroundColor: haloMid,
          opacity: 0.5,
        }}
      />
      {/* Inner flame ring */}
      <View
        style={{
          position: 'absolute',
          left: -radius * 0.15,
          top: -radius * 0.15,
          width: radius * 2.3,
          height: radius * 2.3,
          borderRadius: radius * 1.15,
          backgroundColor: haloInner,
          opacity: 0.7,
        }}
      />
      {/* Bright core */}
      <View
        style={{
          width: radius * 2,
          height: radius * 2,
          borderRadius: radius,
          backgroundColor: coreColor,
          overflow: 'hidden',
          shadowColor: haloMid,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 1,
          shadowRadius: radius * 1.5,
          elevation: 12,
        }}
      >
        {/* Rainbow grains (pixels) sprayed over the core — the fireball emits
            multiple rainbow colours at once while remaining one single ball. */}
        {GRAIN_LAYOUT.map((g, idx) => {
          const gs = radius * 2 * g.size;
          return (
            <View
              key={idx}
              style={{
                position: 'absolute',
                left: radius * 2 * g.x - gs / 2,
                top: radius * 2 * g.y - gs / 2,
                width: gs,
                height: gs,
                borderRadius: gs / 2,
                backgroundColor: grainColor(g.color),
                opacity: 0.92,
              }}
            />
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  dotWrap: {
    position: 'absolute',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default LogoFireTail;
