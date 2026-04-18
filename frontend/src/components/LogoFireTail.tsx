import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { useFireTailAlert } from '../context/FireTailAlertContext';

interface LogoFireTailProps {
  size: number;                 // diameter of the (square) logo container
  children: React.ReactNode;
  normalDurationMs?: number;    // one full revolution in normal mode; default 30_000 (30s)
  wicketDurationMs?: number;    // fast mode duration; default 5_000 (5s)
  /**
   * Legacy alias — older callers passed `durationMs`. Treated as `normalDurationMs`.
   */
  durationMs?: number;
}

/**
 * LogoFireTail — wraps the app logo and animates a SINGLE fireball around a
 * RECTANGULAR orbit hugging the logo's square border. Behind the fireball trails
 * a soft rainbow "smoke tail" — several smaller dots that fade and shrink into
 * multi-color smoke, so the whole effect reads as one comet/fireball with a
 * rainbow flame rather than a ring of dots.
 *
 * Modes (via FireTailAlertContext):
 *   - `normal`:  slow orbit (default 30s per revolution), rainbow-colored flame
 *   - `wicket`:  fast orbit (default 5s per revolution), pure-red burst flame
 */
const RAINBOW = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#007AFF', '#AF52DE'];
const RED_BURST = ['#FF1744', '#FF5252', '#FF8A80'];

const TAIL_COUNT = 10; // fireball + 9 smoke-tail dots (rainbow gradient)

const LogoFireTail: React.FC<LogoFireTailProps> = ({
  size,
  children,
  normalDurationMs,
  wicketDurationMs = 5000,
  durationMs,
}) => {
  const { mode } = useFireTailAlert();

  // `durationMs` is a legacy prop — treat it as `normalDurationMs` if provided
  const effectiveNormalDuration = normalDurationMs ?? durationMs ?? 30000;
  const duration = mode === 'wicket' ? wicketDurationMs : effectiveNormalDuration;

  // One Animated.Value per orbiter (leader + tail) so we can stagger their phase
  // offsets naturally by delayed start.
  const anims = useRef(Array.from({ length: TAIL_COUNT }, () => new Animated.Value(0))).current;

  // (Re)start all loops whenever duration changes (mode flip).
  useEffect(() => {
    const loops: Animated.CompositeAnimation[] = [];
    const timers: ReturnType<typeof setTimeout>[] = [];

    // Tail spacing in ms: how far behind leader each subsequent dot lags.
    // We want the full tail to cover ~18% of the cycle so smoke trails naturally
    // behind the leader without lapping it.
    const tailSpanFraction = mode === 'wicket' ? 0.14 : 0.10;
    const perDotDelayMs = (duration * tailSpanFraction) / TAIL_COUNT;

    anims.forEach((anim, i) => {
      // Snap to 0 so restart begins cleanly.
      anim.setValue(0);

      const loop = Animated.loop(
        Animated.timing(anim, {
          toValue: 1,
          duration,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );

      // Stagger start: leader (i=0) starts immediately, each tail dot starts i
      // ticks later, so at steady state the tail sits behind the leader.
      const timer = setTimeout(() => {
        loop.start();
      }, Math.round(perDotDelayMs * i));

      loops.push(loop);
      timers.push(timer);
    });

    return () => {
      timers.forEach((t) => clearTimeout(t));
      loops.forEach((l) => l.stop());
    };
  }, [duration, mode, anims]);

  // === Rectangular path ===
  // The fireball's center traces a square of side (size + 2*margin), centered
  // on the logo. Corners at t = {0, 0.25, 0.5, 0.75, 1}.
  const margin = Math.max(2, Math.round(size * 0.03));       // outer padding
  const half = size / 2 + margin;                            // half side of orbit square
  const leaderRadius = Math.round(size * 0.085);             // fireball core radius
  const containerSize = size + margin * 2 + leaderRadius * 2;

  // Keyframes: TL → TR → BR → BL → TL (clockwise, starting at top-left)
  const TX_OUT = [-half, half, half, -half, -half];
  const TY_OUT = [-half, -half, half, half, -half];
  const INPUT_CORNERS = [0, 0.25, 0.5, 0.75, 1];

  const palette = mode === 'wicket' ? RED_BURST : RAINBOW;
  // Repeat/cycle palette across all tail dots (so rainbow smoke covers full trail)
  const paletteFor = (i: number) => {
    if (i === 0) return '#FFF8E1'; // leader core = bright cream/white (fireball glow)
    return palette[(i - 1) % palette.length];
  };

  return (
    <View
      style={[styles.wrap, { width: containerSize, height: containerSize }]}
      pointerEvents="box-none"
    >
      {anims.map((anim, i) => {
        const tx = anim.interpolate({ inputRange: INPUT_CORNERS, outputRange: TX_OUT });
        const ty = anim.interpolate({ inputRange: INPUT_CORNERS, outputRange: TY_OUT });

        // Tail sizing: leader largest + crisp, smoke tail progressively smaller/softer
        const t = i / Math.max(1, TAIL_COUNT - 1);
        const dotRadius = leaderRadius * (1 - t * 0.55);   // shrink along tail
        const dotOpacity = i === 0 ? 1 : 0.85 * (1 - t * 0.80); // fade into smoke
        const color = paletteFor(i);

        // Leader gets an additional outer "fireball halo" layer for the classic
        // burning-ball look (darker orange/red aura around white-hot core).
        const isLeader = i === 0;
        const haloColor = mode === 'wicket' ? '#FF1744' : '#FF6B00';
        const haloColor2 = mode === 'wicket' ? '#D50000' : '#FF3B30';

        return (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={[
              styles.dotWrap,
              {
                // Parked at container center; transform moves it onto the orbit.
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
              <View style={{ width: dotRadius * 2, height: dotRadius * 2 }}>
                {/* Outer halo — aura */}
                <View
                  style={{
                    position: 'absolute',
                    left: -dotRadius * 0.6,
                    top: -dotRadius * 0.6,
                    width: dotRadius * 3.2,
                    height: dotRadius * 3.2,
                    borderRadius: dotRadius * 1.6,
                    backgroundColor: haloColor2,
                    opacity: 0.25,
                  }}
                />
                {/* Middle halo — flame */}
                <View
                  style={{
                    position: 'absolute',
                    left: -dotRadius * 0.3,
                    top: -dotRadius * 0.3,
                    width: dotRadius * 2.6,
                    height: dotRadius * 2.6,
                    borderRadius: dotRadius * 1.3,
                    backgroundColor: haloColor,
                    opacity: 0.5,
                  }}
                />
                {/* Inner flame ring */}
                <View
                  style={{
                    position: 'absolute',
                    left: -dotRadius * 0.1,
                    top: -dotRadius * 0.1,
                    width: dotRadius * 2.2,
                    height: dotRadius * 2.2,
                    borderRadius: dotRadius * 1.1,
                    backgroundColor: '#FFB300',
                    opacity: 0.7,
                  }}
                />
                {/* White-hot core */}
                <View
                  style={{
                    width: dotRadius * 2,
                    height: dotRadius * 2,
                    borderRadius: dotRadius,
                    backgroundColor: color,
                    shadowColor: haloColor,
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 1,
                    shadowRadius: dotRadius * 1.5,
                    elevation: 12,
                  }}
                />
              </View>
            ) : (
              // Smoke-tail dot — soft rainbow puff
              <View
                style={{
                  width: dotRadius * 2,
                  height: dotRadius * 2,
                  borderRadius: dotRadius,
                  backgroundColor: color,
                  // Diffuse glow grows with tail index → smoke effect
                  shadowColor: color,
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

      {/* Static logo content */}
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
