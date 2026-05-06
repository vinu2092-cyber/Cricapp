import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View, Easing } from 'react-native';
import { Commentary, Match } from '../types/match';

/**
 * Cricbuzz-web-style "Over-end summary card".
 *
 * After each over completes, this card slides down from the top of the
 * commentary area and displays:
 *
 *     Over 12      8 runs    0 wkts    CRR 9.25
 *
 * The card auto-hides after ~4.5 seconds with a slide-out. White card with
 * a blue border per user preference. Data is derived from the commentary
 * feed (runs + wickets per over) and the current team's overall score
 * (current run rate = runs / overs).
 *
 * Trigger: whenever `match.currentOver` crosses into a new integer (the
 * previous over has just finished). We guard with `lastShownOverRef` so
 * the same over is never shown twice.
 */
interface Props {
  match: Match;
}

interface OverSummary {
  overLabel: number;   // 1-indexed human label (cricbuzz style)
  runs: number;
  wickets: number;
  rr: string;
}

const OverEndCard: React.FC<Props> = ({ match }) => {
  const slideAnim = useRef(new Animated.Value(-120)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const lastShownOverRef = useRef<number>(-1);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [summary, setSummary] = useState<OverSummary | null>(null);

  useEffect(() => {
    if (match.status !== 'live') return;
    if (match.currentOver === undefined || match.currentOver === null) return;

    const curFloat = Number(match.currentOver);
    if (isNaN(curFloat)) return;
    const curInt = Math.floor(curFloat);
    const fractionBalls = Math.round((curFloat - curInt) * 10); // .1 → 1

    // An over has just completed when the current ball number is 0 or 1 of
    // a NEW over AND that new over index is strictly greater than anything
    // we've already shown a card for. `completedOver` = the previous integer.
    const completedOver = curInt - 1;
    if (completedOver < 0) return;
    if (completedOver <= lastShownOverRef.current) return;
    if (fractionBalls > 1) return; // already deep into the new over, skip

    // Build summary from the commentary feed for the just-finished over.
    const comm: Commentary[] = match.commentary || [];
    const overItems = comm.filter((c) => {
      const f = parseFloat(c.over);
      return !isNaN(f) && Math.floor(f) === completedOver;
    });

    // If we haven't received commentary for this over yet (API latency),
    // wait for the next render — don't show a broken "0 runs, 0 wkts" card.
    if (overItems.length === 0) return;

    const runsInOver = overItems.reduce(
      (sum, c) => sum + (typeof c.runs === 'number' ? c.runs : 0),
      0,
    );
    const wicketsInOver = overItems.filter((c) => c.event === 'wicket').length;

    // Current Run Rate — use the batting team (the one whose score grew
    // with this over). We pick the team with a higher-or-equal overs count.
    let battingTeam = match.teams[0];
    for (const t of match.teams) {
      if ((t.overs || 0) >= (battingTeam.overs || 0)) battingTeam = t;
    }
    const teamOvers = Number(battingTeam.overs || 0);
    const teamRuns = Number(battingTeam.runs || 0);
    // teamOvers stores cricket-format ("19.4"); convert to decimal overs.
    const ti = Math.floor(teamOvers);
    const tf = Math.round((teamOvers - ti) * 10);
    const decimalOvers = ti + tf / 6;
    const rr = decimalOvers > 0 ? (teamRuns / decimalOvers).toFixed(2) : '0.00';

    const next: OverSummary = {
      overLabel: completedOver + 1, // 1-indexed (Over 0 → "Over 1")
      runs: runsInOver,
      wickets: wicketsInOver,
      rr,
    };

    lastShownOverRef.current = completedOver;
    setSummary(next);

    // Cancel any previous timer so overlapping over-ends don't fight.
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    // Slide down + fade in.
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 260,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto-hide after 4.5s.
    hideTimerRef.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -120,
          duration: 280,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 240,
          useNativeDriver: true,
        }),
      ]).start(() => setSummary(null));
    }, 4500);
  }, [match.currentOver, match.commentary, match.status, match.teams, slideAnim, opacityAnim]);

  useEffect(
    () => () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    },
    [],
  );

  if (!summary) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
      pointerEvents="none"
    >
      <View style={styles.card} data-testid="over-end-card">
        <Text style={styles.overLabel}>Over {summary.overLabel}</Text>
        <View style={styles.divider} />
        <View style={styles.statBlock}>
          <Text style={styles.statValue}>{summary.runs}</Text>
          <Text style={styles.statKey}>runs</Text>
        </View>
        <View style={styles.statBlock}>
          <Text style={[styles.statValue, summary.wickets > 0 && styles.wicketValue]}>
            {summary.wickets}
          </Text>
          <Text style={styles.statKey}>{summary.wickets === 1 ? 'wkt' : 'wkts'}</Text>
        </View>
        <View style={styles.statBlock}>
          <Text style={styles.statValue}>{summary.rr}</Text>
          <Text style={styles.statKey}>CRR</Text>
        </View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 8,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
    elevation: 8,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#1565C0',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
  },
  overLabel: {
    color: '#1565C0',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  divider: {
    width: 1,
    height: 22,
    backgroundColor: '#BBDEFB',
    marginHorizontal: 4,
  },
  statBlock: {
    alignItems: 'center',
    minWidth: 42,
  },
  statValue: {
    color: '#0D0D0D',
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 18,
  },
  wicketValue: {
    color: '#C62828',
  },
  statKey: {
    color: '#616161',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 1,
  },
});

export default OverEndCard;
