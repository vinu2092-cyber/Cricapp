import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  TouchableOpacity,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Commentary } from '../types/match';

interface CricketFieldProps {
  lastCommentary?: Commentary;
  battingTeam?: string;
  bowlingTeam?: string;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const FIELD_SIZE = Math.min(SCREEN_WIDTH - 64, 154);

// v1.0.12 collapsible spec:
//   • Default state: COLLAPSED so user sees Banner#1 + Scoreboard +
//     Banner#2 + latest commentary in ONE frame on page load.
//   • Tap the toggle handle to expand → plays "last ball movement"
//     animation → auto-collapses after AUTO_COLLAPSE_MS.
//   • Tap handle again while expanded to collapse immediately.
const AUTO_COLLAPSE_MS = 10000; // 10 seconds per user confirmation
const EXPAND_ANIM_MS = 280;

// Enable LayoutAnimation on Android (no-op on iOS).
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Helper: convert literal \\n to actual newline for display
const cleanDisplayText = (text: string): string => {
  if (!text) return '';
  return text.replace(/\\n/g, '\n').replace(/\\r/g, '');
};
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _unusedCleanDisplayText = cleanDisplayText;

const CricketField: React.FC<CricketFieldProps> = ({
  lastCommentary,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  battingTeam = 'BAT',
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  bowlingTeam = 'BOWL',
}) => {
  const ballPosition = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const ballOpacity = useRef(new Animated.Value(0)).current;

  // Collapsed by default (user brief confirmation: option "a").
  const [expanded, setExpanded] = useState(false);
  const autoCollapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAutoCollapse = useCallback(() => {
    if (autoCollapseTimer.current) {
      clearTimeout(autoCollapseTimer.current);
      autoCollapseTimer.current = null;
    }
  }, []);

  const scheduleAutoCollapse = useCallback(() => {
    clearAutoCollapse();
    autoCollapseTimer.current = setTimeout(() => {
      LayoutAnimation.configureNext(
        LayoutAnimation.create(EXPAND_ANIM_MS, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity),
      );
      setExpanded(false);
    }, AUTO_COLLAPSE_MS);
  }, [clearAutoCollapse]);

  const animateBall = useCallback(
    (event?: string) => {
      // Reset ball position to bowler
      ballPosition.setValue({ x: 0, y: -30 });
      ballOpacity.setValue(1);

      let destination = { x: 0, y: 0 };
      switch (event) {
        case 'six':
          destination = { x: 0, y: -FIELD_SIZE / 2 + 20 };
          break;
        case 'four':
          destination = { x: FIELD_SIZE / 3, y: -FIELD_SIZE / 3 };
          break;
        case 'wicket':
          destination = { x: 0, y: 20 };
          break;
        case 'dot':
          destination = { x: -20, y: 10 };
          break;
        default:
          destination = { x: 30, y: -20 };
      }

      Animated.sequence([
        Animated.timing(ballPosition, {
          toValue: destination,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.delay(1000),
        Animated.timing(ballOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    },
    [ballPosition, ballOpacity],
  );

  // When the ground expands, replay the last-ball animation + start
  // the auto-collapse countdown. When it collapses, cancel any pending timer.
  useEffect(() => {
    if (expanded) {
      if (lastCommentary) animateBall(lastCommentary.event);
      scheduleAutoCollapse();
    } else {
      clearAutoCollapse();
    }
    return () => clearAutoCollapse();
    // lastCommentary identity changes intentionally don't re-trigger while
    // expanded — only the initial expand triggers the animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  // Reset animation when a new ball arrives while the ground is already expanded.
  useEffect(() => {
    if (expanded && lastCommentary) {
      animateBall(lastCommentary.event);
      // Reset the auto-collapse countdown so user gets a fresh 10s to watch.
      scheduleAutoCollapse();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastCommentary?.id]);

  const toggleExpanded = useCallback(() => {
    LayoutAnimation.configureNext(
      LayoutAnimation.create(EXPAND_ANIM_MS, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity),
    );
    setExpanded((prev) => !prev);
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getEventColor = (event?: string) => {
    switch (event) {
      case 'wicket':
        return '#FF4444';
      case 'six':
        return '#9C27B0';
      case 'four':
        return '#4CAF50';
      case 'dot':
        return '#666';
      default:
        return '#2196F3';
    }
  };

  return (
    <View style={styles.container}>
      {/*
        Toggle handle — ALWAYS visible (whether collapsed or expanded).
        User spec: "Toggle button jisko kinchna h isko tum new add karoge."
        Tapping it flips expand state. Visual drag-indicator chevron +
        3-dash "grab" bar convey the pull-down affordance.
      */}
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Hide field position' : 'Show field position'}
        activeOpacity={0.7}
        onPress={toggleExpanded}
        style={styles.handle}
        hitSlop={{ top: 8, bottom: 8, left: 20, right: 20 }}
      >
        <View style={styles.grabBar} />
        <View style={styles.handleRow}>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color="#1B5E20"
            style={{ marginRight: 4 }}
          />
          <Text style={styles.title}>
            {expanded ? 'Field Position' : 'Pull down for Field Position'}
          </Text>
        </View>
      </TouchableOpacity>

      {/*
        Collapsible body — only mounted when expanded. Keeping it
        un-mounted when collapsed means ZERO CPU cost on old phones
        (which was a key perf concern from user brief: "purane phones par
        CPU load badha rahi hain"). Animated chunks only run while visible.
      */}
      {expanded && (
        <View style={styles.body}>
          <View style={[styles.field, { width: FIELD_SIZE, height: FIELD_SIZE }]}>
            <View style={styles.outfield}>
              <View style={styles.innerCircle}>
                <View style={styles.pitch}>
                  <View style={styles.crease} />
                  <View style={[styles.crease, styles.bowlerCrease]} />
                  <View style={styles.stumpsContainer}>
                    <View style={styles.stumps}>
                      <View style={styles.stump} />
                      <View style={styles.stump} />
                      <View style={styles.stump} />
                    </View>
                    <Text style={styles.playerLabel}>🏏</Text>
                  </View>
                  <View style={[styles.stumpsContainer, styles.bowlerStumps]}>
                    <View style={styles.stumps}>
                      <View style={styles.stump} />
                      <View style={styles.stump} />
                      <View style={styles.stump} />
                    </View>
                    <Text style={styles.playerLabel}>⚾</Text>
                  </View>
                </View>
              </View>

              <View style={[styles.fielder, styles.slipFielder]}>
                <Ionicons name="person" size={16} color="#FFF" />
              </View>
              <View style={[styles.fielder, styles.pointFielder]}>
                <Ionicons name="person" size={16} color="#FFF" />
              </View>
              <View style={[styles.fielder, styles.coverFielder]}>
                <Ionicons name="person" size={16} color="#FFF" />
              </View>
              <View style={[styles.fielder, styles.midwicketFielder]}>
                <Ionicons name="person" size={16} color="#FFF" />
              </View>
              <View style={[styles.fielder, styles.fineleg]}>
                <Ionicons name="person" size={16} color="#FFF" />
              </View>
              <View style={[styles.fielder, styles.thirdman]}>
                <Ionicons name="person" size={16} color="#FFF" />
              </View>
              <View style={[styles.fielder, styles.longon]}>
                <Ionicons name="person" size={16} color="#FFF" />
              </View>
              <View style={[styles.fielder, styles.longoff]}>
                <Ionicons name="person" size={16} color="#FFF" />
              </View>
              <View style={[styles.fielder, styles.deepmidwicket]}>
                <Ionicons name="person" size={16} color="#FFF" />
              </View>

              <Animated.View
                style={[
                  styles.ball,
                  {
                    opacity: ballOpacity,
                    transform: [
                      { translateX: ballPosition.x },
                      { translateY: ballPosition.y },
                    ],
                  },
                ]}
              />
            </View>

            <View style={styles.boundaryRope} />
          </View>

          {/* Legend */}
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <Text style={styles.legendEmoji}>🏏</Text>
              <Text style={styles.legendText}>Batsman</Text>
            </View>
            <View style={styles.legendItem}>
              <Text style={styles.legendEmoji}>⚾</Text>
              <Text style={styles.legendText}>Bowler</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={styles.legendFielder}>
                <Ionicons name="person" size={10} color="#FFF" />
              </View>
              <Text style={styles.legendText}>Fielder</Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 4,
    paddingHorizontal: 8,
    paddingBottom: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  // Handle: grab bar + title + chevron — always visible.
  handle: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  grabBar: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#9E9E9E',
    marginBottom: 4,
    opacity: 0.6,
  },
  handleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  body: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 4,
  },
  field: {
    borderRadius: 999,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  outfield: {
    width: '92%',
    height: '92%',
    borderRadius: 999,
    backgroundColor: '#66BB6A',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  innerCircle: {
    width: '55%',
    height: '55%',
    borderRadius: 999,
    backgroundColor: '#81C784',
    borderWidth: 2,
    borderColor: '#FFF',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pitch: {
    width: 20,
    height: 80,
    backgroundColor: '#D4A574',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    position: 'relative',
  },
  crease: {
    width: 30,
    height: 2,
    backgroundColor: '#FFF',
    position: 'absolute',
    top: 10,
  },
  bowlerCrease: {
    top: undefined,
    bottom: 10,
  },
  stumpsContainer: {
    alignItems: 'center',
    position: 'absolute',
    top: 5,
  },
  bowlerStumps: {
    top: undefined,
    bottom: 5,
  },
  stumps: {
    flexDirection: 'row',
    gap: 2,
  },
  stump: {
    width: 2,
    height: 10,
    backgroundColor: '#8D6E63',
  },
  playerLabel: {
    fontSize: 14,
    marginTop: 2,
  },
  fielder: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#1976D2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  slipFielder: { right: '22%', top: '55%' },
  pointFielder: { right: '15%', top: '40%' },
  coverFielder: { right: '20%', top: '25%' },
  midwicketFielder: { left: '20%', top: '35%' },
  fineleg: { left: '25%', bottom: '20%' },
  thirdman: { right: '25%', bottom: '20%' },
  longon: { left: '35%', top: '12%' },
  longoff: { right: '35%', top: '12%' },
  deepmidwicket: { left: '15%', top: '50%' },
  boundaryRope: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 999,
    borderWidth: 3,
    borderColor: '#FFF',
  },
  ball: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#D32F2F',
    borderWidth: 1,
    borderColor: '#B71C1C',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    width: '100%',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendEmoji: {
    fontSize: 12,
  },
  legendFielder: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#1976D2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  legendText: {
    fontSize: 11,
    color: '#666',
  },
});

export default CricketField;
