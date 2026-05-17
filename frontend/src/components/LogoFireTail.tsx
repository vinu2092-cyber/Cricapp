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
  /**
   * Fraction of `size` actually occupied by the *visible* logo graphic.
   * Most PNG icons have ~16% transparent padding baked in, so the orbit
   * should hug the visible content, not the canvas box. Defaults to 0.68
   * (matches our CricApp logo's 67.2% content ratio).
   */
  logoContentFraction?: number;
}

/**
 * LogoFireTail — wraps the app logo with an animated RAINBOW PIXEL LINE that
 * orbits a rounded-rectangle path hugging the logo's border.
 *
 * • The line is composed of ~55 tiny 1.6–3.2 px pixels, each a different
 *   rainbow colour, positioned a few ms apart on the shared orbit loop so
 *   they collectively *look* like one continuous flowing line.
 * • Line length on the orbit ≈ the logo's visible width (per user spec).
 * • One full clockwise revolution in 30 s (configurable).
 * • The leader of the line is a slightly brighter "tip" that emits 24 ultra-
 *   tiny rainbow sparks which burst outward and fade — the "fire ember"
 *   particles the user asked for.
 * • 7 bottom-edge ember drops fall with gravity and fade — additional ambient
 *   fire-drip effect.
 * • Wicket mode (5 s per revolution, red palette) still works.
 */
const RAINBOW = ['#FF3B30', '#FF7A00', '#FFD60A', '#34C759', '#00C7BE', '#007AFF', '#AF52DE', '#FF2D92'];
const RED_BURST = ['#FF1744', '#FF5252', '#D50000', '#FF8A80'];

// Line density — 55 pixels → ~1.2 px gap on the line so it looks continuous.
const LINE_PIXEL_COUNT = 55;
const SPARK_COUNT = 24;
const CORNER_STEPS = 6;           // sub-steps per rounded corner → smoother arc

const LogoFireTail: React.FC<LogoFireTailProps> = ({
  size,
  children,
  normalDurationMs,
  wicketDurationMs = 5000,
  durationMs,
  logoContentFraction = 0.68,
}) => {
  const { mode } = useFireTailAlert();

  const effectiveNormalDuration = normalDurationMs ?? durationMs ?? 30000;
  const duration = mode === 'wicket' ? wicketDurationMs : effectiveNormalDuration;

  // ===== Orbit geometry — the pixel line's CENTER traces a rounded rectangle
  // that matches the *visible* logo graphic (not the padded PNG canvas), so
  // the line kisses the logo border with zero visible gap.
  const visibleSize = size * logoContentFraction;                          // visible logo edge length
  const halfOrbit = visibleSize / 2;                                       // orbit rect half-side
  const cornerRadius = Math.max(5, Math.round(visibleSize * 0.22));        // rounded corner radius
  const leaderRadius = Math.max(1.8, visibleSize * 0.032);                 // leading tip pixel radius
  const containerPad = Math.max(6, Math.round(leaderRadius * 3));          // room outside orbit for glow/sparks
  const containerSize = size + containerPad * 2;

  // Approximate perimeter of the rounded rectangle: 4 straight segments of
  // length (visibleSize - 2r) plus one full circle of radius r for the four
  // rounded corners (πr per two corners × 2 = 2πr).
  const approxPerimeter = useMemo(() => {
    const r = Math.min(cornerRadius, halfOrbit * 0.9);
    return 4 * (visibleSize - 2 * r) + 2 * Math.PI * r;
  }, [visibleSize, halfOrbit, cornerRadius]);

  // The LINE occupies roughly `visibleSize` of the orbit perimeter at any
  // given moment → same as logo width, per user spec.
  const lineFraction = Math.min(0.45, visibleSize / approxPerimeter);

  // Build rounded-rect keyframes (clockwise from midpoint of top edge)
  const { inputs, txOut, tyOut } = useMemo(() => {
    const pts: { x: number; y: number }[] = [];
    const r = Math.min(cornerRadius, halfOrbit * 0.9);
    const side = halfOrbit;

    const addArc = (cx: number, cy: number, startAngle: number) => {
      for (let k = 1; k <= CORNER_STEPS; k++) {
        const a = startAngle + (Math.PI / 2) * (k / CORNER_STEPS);
        pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
      }
    };

    pts.push({ x: -side + r, y: -side });             // TL corner end (top edge start)
    pts.push({ x: +side - r, y: -side });             // TR corner start
    addArc(+side - r, -side + r, -Math.PI / 2);       // TR corner arc → right edge start
    pts.push({ x: +side, y: +side - r });             // BR corner start
    addArc(+side - r, +side - r, 0);                  // BR corner arc → bottom edge start
    pts.push({ x: -side + r, y: +side });             // BL corner start
    addArc(-side + r, +side - r, Math.PI / 2);        // BL corner arc → left edge start
    pts.push({ x: -side, y: -side + r });             // TL corner start
    addArc(-side + r, -side + r, Math.PI);            // TL corner arc → back to start

    // Arc-length parameterised inputs so the line moves at constant visual
    // speed (no stalls at corners where keyframes cluster).
    const segLen: number[] = [0];
    for (let i = 1; i < pts.length; i++) {
      segLen.push(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    }
    const cum: number[] = [];
    let acc = 0;
    for (const d of segLen) {
      acc += d;
      cum.push(acc);
    }
    const total = Math.max(1e-6, cum[cum.length - 1]);
    const inp = cum.map((c) => c / total);
    for (let i = 1; i < inp.length; i++) {
      if (inp[i] <= inp[i - 1]) inp[i] = inp[i - 1] + 1e-6;
    }

    return {
      inputs: inp,
      txOut: pts.map((p) => p.x),
      tyOut: pts.map((p) => p.y),
    };
  }, [halfOrbit, cornerRadius]);

  // ===== Animated values
  const anims = useRef(
    Array.from({ length: LINE_PIXEL_COUNT }, () => new Animated.Value(0))
  ).current;
  const sparkAnims = useRef(
    Array.from({ length: SPARK_COUNT }, () => new Animated.Value(0))
  ).current;
  const EMBER_COUNT = 7;
  const emberAnims = useRef(
    Array.from({ length: EMBER_COUNT }, () => new Animated.Value(0))
  ).current;

  const emberParams = useMemo(() => {
    return Array.from({ length: EMBER_COUNT }, (_, i) => {
      const baseX = -halfOrbit + (halfOrbit * 2 * (i + 0.5)) / EMBER_COUNT;
      const jitter = ((i * 37) % 14) - 7;
      return {
        x: baseX + jitter,
        period: 1700 + ((i * 233) % 900),
        delay: (i * 260) % 1800,
        travel: Math.round(halfOrbit * 0.9) + ((i * 3) % 6),
        color: RAINBOW[i % RAINBOW.length],
        pxSize: 1.8 + ((i * 5) % 3) * 0.4,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [halfOrbit]);

  const sparkParams = useMemo(() => {
    return Array.from({ length: SPARK_COUNT }, (_, i) => {
      const angle = (i / SPARK_COUNT) * Math.PI * 2 + (i % 3) * 0.37;
      const period = 1400 + ((i * 173) % 1400);
      const delay = (i * 91) % 1600;
      const travel = leaderRadius * (2.2 + ((i * 7) % 10) / 10);
      const color = RAINBOW[i % RAINBOW.length];
      const pxSize = 1.4 + ((i * 3) % 3) * 0.5;
      return { angle, period, delay, travel, color, pxSize };
    });
  }, [leaderRadius]);

  // Per-pixel static config (size, colour, opacity) so the tail looks like a
  // smoky tapered rainbow line.
  const linePixels = useMemo(() => {
    return Array.from({ length: LINE_PIXEL_COUNT }, (_, i) => {
      const t = i / Math.max(1, LINE_PIXEL_COUNT - 1);          // 0 at leader → 1 at tail
      // Leader tip is slightly larger + brighter, pixels taper towards the tail
      const pxSize = leaderRadius * 2 * (1 - t * 0.65) + 1.0;
      const opacity = i === 0 ? 1 : Math.max(0.08, 1 - t * 0.9);
      // Rainbow colour cycles roughly twice along the line so the user sees
      // "alag alag rainbow colour nikalti" at every instant.
      const paletteIdx = Math.floor(t * (RAINBOW.length * 2)) % RAINBOW.length;
      const color = RAINBOW[paletteIdx];
      const glow = pxSize * (1.4 + (1 - t) * 1.2);             // softer for tail
      return { t, pxSize, opacity, color, glow };
    });
  }, [leaderRadius]);

  // Main orbit loop — one shared 0→1 cycle, staggered start time per pixel so
  // they form a line of length `lineFraction * perimeter` at every instant.
  useEffect(() => {
    const loops: Animated.CompositeAnimation[] = [];
    const timers: ReturnType<typeof setTimeout>[] = [];

    const perPixelDelayMs = (duration * lineFraction) / LINE_PIXEL_COUNT;

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
      const timer = setTimeout(() => loop.start(), Math.round(perPixelDelayMs * i));
      loops.push(loop);
      timers.push(timer);
    });

    return () => {
      timers.forEach((t) => clearTimeout(t));
      loops.forEach((l) => l.stop());
    };
  }, [duration, mode, anims, lineFraction]);

  // Spark bursts — each particle runs its own tiny 0→1 loop.
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

  // Ember-drop loops — accelerating fall (gravity) with opacity fade.
  useEffect(() => {
    const loops: Animated.CompositeAnimation[] = [];
    const timers: ReturnType<typeof setTimeout>[] = [];

    emberAnims.forEach((anim, i) => {
      anim.setValue(0);
      const { period, delay } = emberParams[i];
      const loop = Animated.loop(
        Animated.timing(anim, {
          toValue: 1,
          duration: period,
          easing: Easing.in(Easing.quad),
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
  }, [emberAnims, emberParams, mode]);

  const palette = mode === 'wicket' ? RED_BURST : RAINBOW;

  return (
    <View
      style={[styles.wrap, { width: containerSize, height: containerSize }]}
      pointerEvents="box-none"
    >
      {/* Static logo content — bottom-most so the line + sparks render ABOVE */}
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

      {/* Ember drops — tiny rainbow pixels fall from the orbit's bottom edge,
          accelerating as if by gravity and fading out. Ambient shedding-embers
          vibe behind the line but in front of the logo. */}
      {emberAnims.map((anim, i) => {
        const p = emberParams[i];
        const ty = anim.interpolate({ inputRange: [0, 1], outputRange: [0, p.travel] });
        const tx = anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, ((i % 2 === 0 ? 1 : -1) * (i % 3 + 1) * 1.2)],
        });
        const opacity = anim.interpolate({
          inputRange: [0, 0.15, 0.7, 1],
          outputRange: [0, 0.95, 0.5, 0],
        });
        return (
          <Animated.View
            key={`ember-${i}`}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: containerSize / 2 + p.x - p.pxSize / 2,
              top: containerSize / 2 + halfOrbit - p.pxSize / 2,
              width: p.pxSize,
              height: p.pxSize,
              borderRadius: p.pxSize / 2,
              backgroundColor: p.color,
              shadowColor: p.color,
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 1,
              shadowRadius: p.pxSize * 1.3,
              elevation: 7,
              opacity,
              transform: [{ translateX: tx }, { translateY: ty }],
            }}
          />
        );
      })}

      {/* The RAINBOW LINE — 55 staggered pixels that collectively form a
          continuous line of length ≈ logo width, with smoky tapering tail. */}
      {anims.map((anim, i) => {
        const tx = anim.interpolate({ inputRange: inputs, outputRange: txOut });
        const ty = anim.interpolate({ inputRange: inputs, outputRange: tyOut });

        const cfg = linePixels[i];
        const isLeader = i === 0;
        // In wicket mode, override colours with red palette but keep the tapers
        const color = mode === 'wicket'
          ? palette[i % palette.length]
          : cfg.color;

        return (
          <Animated.View
            key={`line-${i}`}
            pointerEvents="none"
            style={[
              styles.dotWrap,
              {
                left: containerSize / 2 - cfg.pxSize / 2,
                top: containerSize / 2 - cfg.pxSize / 2,
                width: cfg.pxSize,
                height: cfg.pxSize,
                opacity: cfg.opacity,
                transform: [{ translateX: tx }, { translateY: ty }],
              },
            ]}
          >
            <View
              style={{
                width: cfg.pxSize,
                height: cfg.pxSize,
                borderRadius: cfg.pxSize / 2,
                backgroundColor: color,
                shadowColor: color,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: isLeader ? 1 : 0.85,
                shadowRadius: cfg.glow,
                elevation: isLeader ? 14 : Math.max(2, 9 - Math.floor(i / 6)),
              }}
            />
            {isLeader && (
              <LeaderSparks
                radius={leaderRadius}
                mode={mode}
                sparkAnims={sparkAnims}
                sparkParams={sparkParams}
              />
            )}
          </Animated.View>
        );
      })}
    </View>
  );
};

/** Leader sparks — 24 ultra-tiny rainbow particles radiate out from the front
 *  of the line + fade back, giving the "fire ember" effect the user asked
 *  for. Sparks disappear (opacity → 0) within ~1 cycle so they feel ephemeral. */
const LeaderSparks: React.FC<{
  radius: number;
  mode: 'normal' | 'wicket';
  sparkAnims: Animated.Value[];
  sparkParams: { angle: number; period: number; delay: number; travel: number; color: string; pxSize: number }[];
}> = ({ radius, sparkAnims, sparkParams }) => {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: -radius,
        top: -radius,
        width: radius * 2,
        height: radius * 2,
      }}
    >
      {sparkParams.map((sp, i) => {
        const anim = sparkAnims[i];
        const offset = anim.interpolate({
          inputRange: [0, 0.55, 1],
          outputRange: [0, sp.travel, 0],
        });
        const opacity = anim.interpolate({
          inputRange: [0, 0.1, 0.55, 0.9, 1],
          outputRange: [0, 1, 0.9, 0.15, 0],
        });
        const dx = Animated.multiply(offset, Math.cos(sp.angle));
        const dy = Animated.multiply(offset, Math.sin(sp.angle));

        return (
          <Animated.View
            key={`spark-${i}`}
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
              shadowRadius: sp.pxSize * 1.4,
              elevation: 9,
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
