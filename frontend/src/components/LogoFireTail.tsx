import React, { useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { useFireTailAlert } from '../context/FireTailAlertContext';

interface LogoFireTailProps {
  size: number;                 // side length of the (square) logo container
  children: React.ReactNode;
  normalDurationMs?: number;    // one full revolution in normal mode; default 30_000 (30s)
  wicketDurationMs?: number;    // fast mode duration; default 5_000 (5s)
  /** Legacy alias (older Header passed this) — treated as `normalDurationMs`. */
  durationMs?: number;
}

/**
 * LogoFireTail — wraps the app logo and animates a single SMOOTH fireball with
 * a rainbow smoke tail and occasional subtle rainbow spark bursts, orbiting a
 * ROUNDED-RECTANGLE path that hugs the logo's border.
 *
 * Path       : 30-keyframe rounded rectangle (soft corners like the logo's own
 *              shape), clockwise, 30 s per revolution (5 s in wicket mode).
 * Fireball   : solid smooth core + layered halos — NO visible pixel grains.
 * Sparks     : 24 ultra-tiny rainbow particles that burst outward from the
 *              fireball and fade back, each with its own random delay & period
 *              so they look uncountable.
 * Smoke tail : 9 soft rainbow dots trailing the fireball with increasing blur.
 */
const RAINBOW = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#00C7BE', '#007AFF', '#AF52DE', '#FF2D92'];
const RED_BURST = ['#FF1744', '#FF5252', '#D50000', '#FF8A80'];

const TAIL_COUNT = 10;        // 1 fireball leader + 9 smoke-tail dots
const SPARK_COUNT = 24;       // tiny rainbow "burst" pixels around the fireball
const CORNER_STEPS = 5;       // sub-steps per rounded corner → smoother arc

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

  // ===== Orbit geometry — the fireball's CENTER traces a rounded rectangle of
  // the same side length as the logo, so the ball kisses the logo border.
  const leaderRadius = Math.max(3, Math.round(size * 0.065)); // smaller, smoother
  const halfOrbit = size / 2;
  const cornerRadius = Math.max(6, Math.round(size * 0.18)); // visual corner radius of the logo shape
  const containerPad = leaderRadius + 2; // room for the ball outside the orbit
  const containerSize = size + containerPad * 2;

  // Build rounded-rect keyframes (clockwise from top-left corner start)
  const { inputs, txOut, tyOut } = useMemo(() => {
    const pts: { x: number; y: number }[] = [];
    const r = Math.min(cornerRadius, halfOrbit * 0.9);
    const side = halfOrbit; // orbit is +/- side

    // Helper to push points along a 90° arc
    const addArc = (cx: number, cy: number, startAngle: number) => {
      for (let k = 1; k <= CORNER_STEPS; k++) {
        const a = startAngle + (Math.PI / 2) * (k / CORNER_STEPS);
        pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
      }
    };

    // Start at the midpoint of the top edge so motion feels centered
    pts.push({ x: -side + r, y: -side });             // TL corner end (top edge start)
    pts.push({ x: +side - r, y: -side });             // TR corner start
    addArc(+side - r, -side + r, -Math.PI / 2);       // TR corner arc → right edge start
    pts.push({ x: +side, y: +side - r });             // BR corner start
    addArc(+side - r, +side - r, 0);                  // BR corner arc → bottom edge start
    pts.push({ x: -side + r, y: +side });             // BL corner start
    addArc(-side + r, +side - r, Math.PI / 2);        // BL corner arc → left edge start
    pts.push({ x: -side, y: -side + r });             // TL corner start
    addArc(-side + r, -side + r, Math.PI);            // TL corner arc → back to start

    const n = pts.length;
    const inp = pts.map((_, i) => i / (n - 1));
    return {
      inputs: inp,
      txOut: pts.map((p) => p.x),
      tyOut: pts.map((p) => p.y),
    };
  }, [halfOrbit, cornerRadius]);

  // ===== Animated values
  const anims = useRef(Array.from({ length: TAIL_COUNT }, () => new Animated.Value(0))).current;
  // Spark particles have their own small cyclic animators (0→1 loop)
  const sparkAnims = useRef(Array.from({ length: SPARK_COUNT }, () => new Animated.Value(0))).current;

  // Deterministic per-spark parameters (angle / period / delay) — memoised so
  // sparks don't "jump" to new positions on every re-render.
  const sparkParams = useMemo(() => {
    return Array.from({ length: SPARK_COUNT }, (_, i) => {
      const angle = (i / SPARK_COUNT) * Math.PI * 2 + (i % 3) * 0.37;
      const period = 1400 + ((i * 173) % 1400); // 1.4s – 2.8s
      const delay = (i * 91) % 1600;
      const travel = leaderRadius * (1.6 + ((i * 7) % 10) / 10); // 1.6R – 2.5R
      const color = RAINBOW[i % RAINBOW.length];
      const pxSize = 1.5 + ((i * 3) % 3) * 0.6; // 1.5 – 3.3 px
      return { angle, period, delay, travel, color, pxSize };
    });
  }, [leaderRadius]);

  // Main orbit loop (leader + smoke tail)
  useEffect(() => {
    const loops: Animated.CompositeAnimation[] = [];
    const timers: ReturnType<typeof setTimeout>[] = [];

    const tailSpanFraction = mode === 'wicket' ? 0.14 : 0.09;
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

  // Spark burst loops — each particle runs its own tiny 0→1 loop; the scale /
  // opacity / radial-offset interpolations make it fly out then fade/return.
  useEffect(() => {
    const loops: Animated.CompositeAnimation[] = [];
    const timers: ReturnType<typeof setTimeout>[] = [];

    sparkAnims.forEach((anim, i) => {
      anim.setValue(0);
      const { period, delay } = sparkParams[i];
      const loop = Animated.loop(
        Animated.timing(anim, {
          toValue: 1,
          duration: period,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        })
      );
      const timer = setTimeout(() => loop.start(), delay);
      loops.push(loop);
      timers.push(timer);
    });

    return () => {
      timers.forEach((t) => clearTimeout(t));
      loops.forEach((l) => l.stop());
    };
  }, [sparkAnims, sparkParams, mode]);

  const palette = mode === 'wicket' ? RED_BURST : RAINBOW;
  const smokeColorFor = (i: number) => palette[(i - 1) % palette.length];

  return (
    <View
      style={[styles.wrap, { width: containerSize, height: containerSize }]}
      pointerEvents="box-none"
    >
      {/* Static logo content — bottom-most so fireball + sparks orbit ABOVE */}
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
        const tx = anim.interpolate({ inputRange: inputs, outputRange: txOut });
        const ty = anim.interpolate({ inputRange: inputs, outputRange: tyOut });

        const t = i / Math.max(1, TAIL_COUNT - 1);
        const dotRadius = leaderRadius * (1 - t * 0.55);
        const dotOpacity = i === 0 ? 1 : 0.82 * (1 - t * 0.75);

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
              <Fireball
                radius={leaderRadius}
                mode={mode}
                sparkAnims={sparkAnims}
                sparkParams={sparkParams}
              />
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

/** Smooth fireball — no visible pixel grains on the core; instead a ring of
 *  tiny rainbow sparks is emitted around it and fades back, creating an
 *  "uncountable-pixels" burst effect that feels organic, not pixelated. */
const Fireball: React.FC<{
  radius: number;
  mode: 'normal' | 'wicket';
  sparkAnims: Animated.Value[];
  sparkParams: { angle: number; period: number; delay: number; travel: number; color: string; pxSize: number }[];
}> = ({ radius, mode, sparkAnims, sparkParams }) => {
  const haloOuter = mode === 'wicket' ? '#D50000' : '#FF3B30';
  const haloMid = mode === 'wicket' ? '#FF1744' : '#FF6B00';
  const haloInner = mode === 'wicket' ? '#FF5252' : '#FFB300';
  const coreColor = mode === 'wicket' ? '#FFEBEE' : '#FFF8E1';

  return (
    <View style={{ width: radius * 2, height: radius * 2 }}>
      {/* Outer halo — aura */}
      <View
        style={{
          position: 'absolute',
          left: -radius * 0.9,
          top: -radius * 0.9,
          width: radius * 3.8,
          height: radius * 3.8,
          borderRadius: radius * 1.9,
          backgroundColor: haloOuter,
          opacity: 0.22,
        }}
      />
      {/* Middle halo — flame */}
      <View
        style={{
          position: 'absolute',
          left: -radius * 0.45,
          top: -radius * 0.45,
          width: radius * 2.9,
          height: radius * 2.9,
          borderRadius: radius * 1.45,
          backgroundColor: haloMid,
          opacity: 0.5,
        }}
      />
      {/* Inner flame ring */}
      <View
        style={{
          position: 'absolute',
          left: -radius * 0.18,
          top: -radius * 0.18,
          width: radius * 2.35,
          height: radius * 2.35,
          borderRadius: radius * 1.175,
          backgroundColor: haloInner,
          opacity: 0.7,
        }}
      />
      {/* Smooth bright core (solid, no grains) */}
      <View
        style={{
          width: radius * 2,
          height: radius * 2,
          borderRadius: radius,
          backgroundColor: coreColor,
          shadowColor: haloMid,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 1,
          shadowRadius: radius * 1.8,
          elevation: 14,
        }}
      />

      {/* Rainbow spark burst — 24 ultra-tiny particles radiate out + fade back.
          In wicket mode the rainbow palette is still used so the spark burst
          stays lively (the emergency look comes from the red halos, not the
          sparks). */}
      {sparkParams.map((sp, i) => {
        const anim = sparkAnims[i];
        // Offset along the spark's angle from 0 → travel → 0
        const offset = anim.interpolate({
          inputRange: [0, 0.55, 1],
          outputRange: [0, sp.travel, 0],
        });
        const opacity = anim.interpolate({
          inputRange: [0, 0.1, 0.55, 0.9, 1],
          outputRange: [0, 1, 0.95, 0.2, 0],
        });
        // Convert polar offset → x/y deltas from the fireball's center
        const dx = Animated.multiply(offset, Math.cos(sp.angle));
        const dy = Animated.multiply(offset, Math.sin(sp.angle));

        return (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: radius - sp.pxSize / 2,
              top: radius - sp.pxSize / 2,
              width: sp.pxSize,
              height: sp.pxSize,
              borderRadius: sp.pxSize / 2,
              backgroundColor: sp.color,
              shadowColor: sp.color,
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 1,
              shadowRadius: sp.pxSize * 1.2,
              elevation: 8,
              opacity,
              transform: [{ translateX: dx }, { translateY: dy }],
            }}
          />
        );
      })}
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
