import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Dimensions, Modal, Alert, Linking, Platform, ImageBackground, AppState, Image, Share
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { fetchMatchById, fetchMoreCommentary, fetchMatchInfo, fetchTeamSquad } from '../../src/services/api';
import { Match, Commentary } from '../../src/types/match';
import ErrorScreen from '../../src/components/ErrorScreen';
import LiveIndicator, { MatchStatusBadge } from '../../src/components/LiveIndicator';
import CricketField from '../../src/components/CricketField';
import CommentarySection from '../../src/components/CommentarySection';
import ScorecardSection from '../../src/components/ScorecardSection';
import SquadsSection from '../../src/components/SquadsSection';
import NativeAdCard from '../../src/components/NativeAdCard';
import FloatingScoreboard from '../../src/components/FloatingScoreboard';
import AppBackground from '../../src/components/AppBackground';
import MatchMoodMeter from '../../src/components/MatchMoodMeter';
import LiveInteractions from '../../src/components/LiveInteractions';
import { saveCommentary, loadCommentary, mergeCommentary, shouldPersistCommentary } from '../../src/services/CommentaryStorage';
import { usePro } from '../../src/context/ProContext';
import { useAdMob } from '../../src/context/AdMobContext.native';
import { useNotifications } from '../../src/context/NotificationContext';
import {
  isFloatingWidgetAvailable,
  checkOverlayPermission,
  requestOverlayPermission,
  showFloatingWidget,
  updateFloatingWidget,
  hideFloatingWidget,
} from '../../src/services/FloatingWidgetService';
import { getVoiceMode, isVoiceMuted } from '../../src/services/VoicePrefs';

const AUTO_REFRESH = 30000; // 30 seconds refresh for live commentary
const MATCH_CACHE_FLUSH = 1800000; // 30 minutes

// Format over summary with wickets in RED, 6 in Purple, 4 in Green
const formatOverSummary = (summary: string, currentOver?: number): React.ReactNode[] => {
  const elements: React.ReactNode[] = [];
  
  // Cricbuzz recentOvsStr format: "23.6 1, 24.1 4, 24.2 W, 24.3 4" (ball-number result pairs)
  // Also handle simple format: "1 4 W 0 2 6" or "1|4|W|0|2|6"
  // IMPORTANT: In Cricbuzz recentOvsStr, "W" means WIDE (not wicket!)
  // Wickets are represented as "WKT", "OUT", or "WICKET"
  
  let balls: string[] = [];
  
  if (summary.includes(',')) {
    // Cricbuzz comma-separated format: "23.6 1, 24.1 4, 24.2 W"
    const entries = summary.split(',').map(s => s.trim()).filter(Boolean);
    let prevOver = -1;
    
    for (const entry of entries) {
      const parts = entry.split(/\s+/);
      if (parts.length >= 2) {
        const ballNum = parts[0]; // e.g. "24.3"
        const result = parts.slice(1).join(' '); // e.g. "4" or "W" or "no run"
        
        // Detect over change for separator
        const overNum = Math.floor(parseFloat(ballNum) || 0);
        if (prevOver >= 0 && overNum !== prevOver) {
          balls.push('|'); // Over separator
        }
        prevOver = overNum;
        
        // Normalize the result
        const r = result.toUpperCase().trim();
        if (r.includes('WICKET') || r === 'WKT' || r.includes('OUT') || r === 'OW') {
          balls.push('WKT'); // Explicit wicket markers only
        } else if (r === 'W' || r.includes('WIDE') || r === 'WD') {
          balls.push('Wd'); // W in Cricbuzz = Wide, not wicket
        } else if (r === '6' || r.includes('SIX')) {
          balls.push('6');
        } else if (r === '4' || r.includes('FOUR')) {
          balls.push('4');
        } else if (r.includes('NO BALL') || r === 'NB') {
          balls.push('Nb');
        } else if (r === '0' || r.includes('NO RUN') || r === '.' || r === '•') {
          balls.push('0');
        } else if (/^\d+$/.test(r)) {
          balls.push(r);
        } else {
          balls.push('•');
        }
      } else if (parts.length === 1) {
        // Just a result without ball number
        const val = parts[0].toUpperCase();
        if (val === 'W') {
          balls.push('Wd'); // W = Wide in Cricbuzz
        } else if (val === 'WKT' || val === 'OUT' || val === 'WICKET') {
          balls.push('WKT');
        } else {
          balls.push(val);
        }
      }
    }
  } else {
    // Simple space/pipe separated format: "1 4 W 0 2 6 | 0 1"
    // In Cricbuzz recentOvsStr: W = Wide, WKT/OUT = Wicket
    const rawBalls = summary.split(/[\s]+/).filter(b => b.trim());
    balls = rawBalls.map(b => {
      const val = b.trim().toUpperCase();
      // Convert W to Wd (wide) - Cricbuzz uses W for wide in recentOvsStr
      if (val === 'W') return 'Wd';
      // Keep explicit wicket markers
      if (val === 'WKT' || val === 'OUT' || val === 'WICKET') return 'WKT';
      return val;
    });
  }
  
  let ballCount = 0;
  
  balls.forEach((b, idx) => {
    if (!b) return;
    
    if (b.includes('OVER')) return;
    
    // Handle pipe separator
    if (b === '|') {
      elements.push(
        <Text key={`sep-${idx}`} style={{ color: '#2E7D32', marginHorizontal: 6, fontWeight: 'bold', fontSize: 16 }}>
          |
        </Text>
      );
      return;
    }
    
    // Auto-add separator every 6 balls (only for non-comma format)
    if (!summary.includes(',') && ballCount > 0 && ballCount % 6 === 0) {
      elements.push(
        <Text key={`autosep-${idx}`} style={{ color: '#2E7D32', marginHorizontal: 6, fontWeight: 'bold', fontSize: 16 }}>
          |
        </Text>
      );
    }
    
    // Style based on ball type. Tuned for the NEW white scoreboard:
    //   - dots / runs = dark text, boundaries still get brand colour but
    //     slightly darkened so they stay readable on the light strip.
    let style: any = { marginHorizontal: 4, fontSize: 15, fontWeight: '700' };

    if (b === 'WKT' || b === 'WICKET' || b === 'OUT') {
      style = { ...style, color: '#D32F2F', fontWeight: '900', fontSize: 16 };
    } else if (b === '6') {
      style = { ...style, color: '#7B1FA2', fontWeight: '900', fontSize: 16 };
    } else if (b === '4') {
      style = { ...style, color: '#2E7D32', fontWeight: '900', fontSize: 16 };
    } else if (b === 'WD' || b === 'Wd' || b === 'WIDE' || b === 'W') {
      style = { ...style, color: '#EF6C00', fontSize: 13 };
    } else if (b === 'NB' || b === 'Nb' || b === 'NOBALL') {
      style = { ...style, color: '#EF6C00', fontSize: 13 };
    } else if (b === '0' || b === '.' || b === '•') {
      style = { ...style, color: '#9E9E9E' };
    } else {
      style = { ...style, color: '#212121' };
    }
    
    // Display text
    let displayText = b;
    if (b === '.' || b === '•') displayText = '0';
    if (b === 'WKT') displayText = 'W';
    if (b === 'Wd') displayText = 'WD';
    
    elements.push(
      <Text key={`ball-${idx}`} style={style}>
        {displayText}
      </Text>
    );
    
    ballCount++;
  });
  
  return elements;
};

export default function MatchDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isPro: globalIsPro, setProFromAdMob, canShareUnlockToday, markSharedUnlockToday } = usePro();
  const { trackClick, showRewardedAd } = useAdMob();
  const { isTracking, toggleTracking, notificationsEnabled, enableNotifications } = useNotifications();

  const [match, setMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [showOverlay, setShowOverlay] = useState(false);

  // Commentary pagination state
  const [allCommentary, setAllCommentary] = useState<Commentary[]>([]);
  const [nextTimestamp, setNextTimestamp] = useState<number | undefined>(undefined);
  const [nextIid, setNextIid] = useState<number | undefined>(undefined);
  const [loadingMoreComm, setLoadingMoreComm] = useState(false);
  // Name → Cricbuzz faceImageId for rendering player photos inside event cards
  const [playerImgMap, setPlayerImgMap] = useState<Record<string, string>>({});

  // Content tab: 'commentary' or 'scorecard' or 'squads'
  const [activeDetailTab, setActiveDetailTab] = useState<'commentary' | 'scorecard' | 'squads'>('commentary');

  // Mood event for emotional animations
  const [moodEvent, setMoodEvent] = useState<'wicket' | 'four' | 'six' | 'dot' | 'wide' | 'normal' | null>(null);
  const prevCommRef = useRef<string | null>(null);

  // Pro unlock states
  const [tempPro, setTempPro] = useState(false);
  const [proExpiry, setProExpiry] = useState<number | null>(null);
  const [adsWatchedCount, setAdsWatchedCount] = useState(0);
  const [showProModal, setShowProModal] = useState(false);
  const [adWatchLoading, setAdWatchLoading] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);

  // Native floating widget states
  const [nativeOverlayActive, setNativeOverlayActive] = useState(false);
  const [hasOverlayPermission, setHasOverlayPermission] = useState(false);

  // Auto-scroll ref for commentary updates
  const mainScrollRef = useRef<ScrollView>(null);
  const prevCommCountRef = useRef<number>(0);
  // Sync-on-Open guard: run full-history sync exactly ONCE per match screen open.
  // Re-armed on AppState.active (below) so cold-start returning users also trigger a sync.
  const syncDoneRef = useRef<boolean>(false);

  // v1.0.16 — Build the score-data payload for the native floating
  // overlay. Centralised so both the on-permission-granted flow and the
  // 30s auto-refresh push identical data:
  //   • battingTeam: 'team1' or 'team2' (the native widget hides the
  //     other team's row entirely until they come out to bat).
  //   • bowlerOverBalls: ball-by-ball string of ONLY the current over
  //     (extracted from commentary entries whose over int matches the
  //     bowler's current over). No previous-over balls included.
  //   • batsmanName: on-strike batter (with score/balls).
  //   • bowlerName: current bowler (with figures).
  const buildFloatingScoreData = (m: Match) => {
    const team1Short = m.teams[0]?.shortName || 'TM1';
    const team2Short = m.teams[1]?.shortName || 'TM2';
    const battingShort = m.battingTeamShortName || team1Short;
    const battingTeam: 'team1' | 'team2' = battingShort === team2Short ? 'team2' : 'team1';

    // Striker / bowler labels (with quick stats so users can see context).
    const striker = (m.batsmen || []).find(b => b.isStriker) || (m.batsmen || [])[0];
    const batsmanLabel = striker
      ? `${striker.name} ${striker.runs}(${striker.balls})`
      : '';

    // v1.0.16 Rev 8 — Source of truth for "current bowler" and
    // "current over" is now the LATEST commentary entry, NOT the
    // miniscore.bowlerstriker field. User reported (build #126,
    // 2026-05-06) that miniscore lags by ~1 over: it kept showing
    // "Michelle Mavunga" while the live commentary already had
    // "Lindokuhle Mabhero to Gull Feroza, no run" at over 30.5.
    //
    // Cricbuzz commentary text follows the format:
    //     "<Bowler Name> to <Batter Name>, <result>"
    // We extract the bowler segment with a tolerant regex that allows
    // names with apostrophes, hyphens, dots and unicode letters.
    let liveBowlerName: string | null = null;
    let liveOverFloat: number | null = null;
    if (m.commentary && m.commentary.length > 0) {
      // Walk newest → oldest until we find a row that looks like a
      // delivery (has both an `over` and a "X to Y" English text).
      for (const c of m.commentary) {
        if (!c.over || !c.english) continue;
        const f = parseFloat(c.over);
        if (Number.isNaN(f)) continue;
        const m1 = c.english.match(/^([\p{L}'.\- ]{2,40}?)\s+to\s+/u);
        if (m1) {
          liveBowlerName = m1[1].trim();
          liveOverFloat = f;
          break;
        }
        // First delivery commentary that simply has a valid `over`
        // even if the bowler can't be parsed — still pin currentOver.
        if (liveOverFloat === null) liveOverFloat = f;
      }
    }

    // v1.0.16 Rev 7/8 — bowler label is JUST the name. Bowler stats
    // ("O-M-R-W" e.g. "5.1-0-27-0") are intentionally OMITTED because
    // the user (2026-05-06 directive) interprets the embedded "5.1"
    // (= 5 overs + 1 ball) as a "ball number" — confusing. The
    // ball-by-ball strip below the player row already shows runs/W/Wd/
    // Nb per delivery, which is the only over-progress info needed.
    // Prefer the live commentary bowler over the (often stale)
    // miniscore.bowlerstriker name.
    const bowlerLabel = liveBowlerName
      || (m.bowler && m.bowler.name ? m.bowler.name : '');

    // v1.0.16 Rev 8 — Current-over balls strip.
    // currentOverInt comes from the LATEST commentary row's `over`
    // (which is always in sync with the actual live over), not from
    // miniscore. Pre-Rev 8 we floored m.bowler.overs which was stale,
    // producing an empty strip whenever a new bowler started a fresh
    // over before miniscore caught up.
    let bowlerOverBalls = '';
    if (m.commentary && m.commentary.length > 0 && liveOverFloat !== null) {
      const currentOverInt = Math.floor(liveOverFloat);
      const balls: string[] = [];
      for (const c of m.commentary) {
        if (!c.over) continue;
        const f = parseFloat(c.over);
        if (Number.isNaN(f)) continue;
        if (Math.floor(f) !== currentOverInt) continue;
        // Translate the ball into a short symbol.
        if (c.event === 'wicket') balls.push('W');
        else if (c.extras === 'wide') balls.push('Wd');
        else if (c.extras === 'noball') balls.push('Nb');
        else if (c.event === 'six') balls.push('6');
        else if (c.event === 'four') balls.push('4');
        else if (c.runs !== undefined && c.runs !== null) balls.push(String(c.runs));
        else if (c.event === 'dot') balls.push('.');
        else balls.push('.');
      }
      // Commentary is newest-first → reverse so balls read left-to-right.
      bowlerOverBalls = balls.reverse().join(' ');
    }

    // v1.0.16 Rev 5 — voice prefs from CommentarySection picker.
    // Default mode is 'english_excited'; user can switch via the picker
    // pill. Both modes now use the "excited" rate/pitch profile — the
    // only difference is the speech locale. We pass commentaryHindi
    // explicitly so the native side can speak Hindi only when a real
    // Devanagari string is available.
    const mode = getVoiceMode();
    const muted = isVoiceMuted();
    let voiceLanguage: 'en-IN' | 'hi-IN' = 'en-IN';
    const voiceRate = 1.15;
    const voicePitch = 1.05;
    if (mode === 'hindi_excited') {
      voiceLanguage = 'hi-IN';
    }
    const latestHindi = m.commentary?.[0]?.hindi || '';

    return {
      team1Name: team1Short,
      team2Name: team2Short,
      team1Score: m.teams[0]?.runs !== undefined
        ? `${m.teams[0].runs}/${m.teams[0].wickets || 0}`
        : '-',
      team2Score: m.teams[1]?.runs !== undefined
        ? `${m.teams[1].runs}/${m.teams[1].wickets || 0}`
        : '-',
      team1Overs: m.teams[0]?.overs?.toString() || '',
      team2Overs: m.teams[1]?.overs?.toString() || '',
      statusText: m.statusText || '',
      batsmanName: batsmanLabel,
      bowlerName: bowlerLabel,
      battingTeam,
      bowlerOverBalls,
      commentary: m.commentary?.[0]?.english || '',
      // Voice prefs + Hindi text for the native overlay TTS.
      voiceLanguage,
      voiceRate,
      voicePitch,
      voiceMuted: muted,
      commentaryHindi: latestHindi,
    };
  };

  const effectiveIsPro = globalIsPro || tempPro;

  // Pending overlay request - track if user was sent to settings
  const [pendingOverlayRequest, setPendingOverlayRequest] = useState(false);

  // Check overlay permission on mount and when app returns from settings
  useEffect(() => {
    if (isFloatingWidgetAvailable()) {
      checkOverlayPermission().then(setHasOverlayPermission);
    }
  }, []);

  // Listen for app state changes to detect when user returns from settings
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      if (nextAppState === 'active' && pendingOverlayRequest) {
        // User came back from settings, check permission again
        const granted = await checkOverlayPermission();
        setHasOverlayPermission(granted);
        setPendingOverlayRequest(false);
        
        if (granted && match) {
          // Permission granted! Start the floating widget automatically
          const scoreData = buildFloatingScoreData(match);
          const success = await showFloatingWidget(scoreData);
          if (success) {
            setNativeOverlayActive(true);
            Alert.alert(
              'Floating Widget Active!',
              'Score will now show over other apps. Minimize CricApp and check!',
              [{ text: 'Got it!' }]
            );
          }
        }
      }
    });
    return () => subscription.remove();
  }, [pendingOverlayRequest, match]);

  // Update native floating widget when score changes (for Pro users with active overlay)
  useEffect(() => {
    if (nativeOverlayActive && effectiveIsPro && match) {
      const scoreData = buildFloatingScoreData(match);
      updateFloatingWidget(scoreData);
    }
  }, [match?.teams[0]?.runs, match?.teams[1]?.runs, match?.commentary?.[0]?.english, match?.battingTeamShortName, match?.bowler?.name, nativeOverlayActive, effectiveIsPro]);

  // 30-Min Pro Expiry (Logic D)
  useEffect(() => {
    if (!tempPro || !proExpiry) return;
    const interval = setInterval(() => {
      if (Date.now() >= proExpiry) {
        setTempPro(false);
        setProExpiry(null);
        setProFromAdMob(false);
        Alert.alert('Pro Expired', 'Watch 2 ads again to unlock Pro!');
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [tempPro, proExpiry]);

  // Refs for timers - cleanup on unmount
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cacheFlushIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Initial load
    loadMatch();
    loadPlayerImageMap();
    
    // 50-second auto-refresh for live commentary updates
    refreshIntervalRef.current = setInterval(() => {
      loadMatch();
    }, AUTO_REFRESH);

    // 30-minute absolute cache flush
    cacheFlushIntervalRef.current = setInterval(() => {
      console.log('[Memory] Match page - 30 min cache flush');
      setMatch(null);
      loadMatch();
    }, MATCH_CACHE_FLUSH);

    // ============ SYNC-ON-FOREGROUND ============
    // When user brings the app back to the foreground (after phone sleep / app switch),
    // re-arm the sync-on-open gate and re-run loadMatch so any balls missed during
    // the blackout get fetched from ball 0.1 and merged into AsyncStorage.
    const fgSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        syncDoneRef.current = false;
        loadMatch();
      }
    });

    // Cleanup on unmount - kills ALL background fetching instantly
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
      if (cacheFlushIntervalRef.current) {
        clearInterval(cacheFlushIntervalRef.current);
        cacheFlushIntervalRef.current = null;
      }
      fgSub.remove();
      Speech.stop();
      // Stop native overlay when leaving the page
      if (nativeOverlayActive) {
        hideFloatingWidget();
      }
    };
  }, [id]);

  // Fetch match info once, build name → Cricbuzz faceImageId map for commentary event cards.
  // Also pulls full team squads (including subs+bench) so photos render for incoming
  // batsmen / bowling-change cards even when the player isn't in the basic Playing XI.
  const loadPlayerImageMap = useCallback(async () => {
    if (!id) return;
    try {
      const info = await fetchMatchInfo(id);
      if (!info) return;
      const map: Record<string, string> = {};
      const collect = (arr: any) => {
        if (!Array.isArray(arr)) return;
        for (const p of arr) {
          const name = (p?.name || p?.fullName || p?.fullname || p?.nickName || p?.playerName || '')
            .replace(/\s*\((c|wk)\)/gi, '').toLowerCase().trim();
          const imgId = p?.faceImageId || p?.imageId || p?.image_id || p?.faceimageid || p?.id;
          if (name && imgId) map[name] = String(imgId);
        }
      };
      const addTeam = (t: any) => {
        if (!t) return;
        const pl = t.players;
        if (pl && typeof pl === 'object' && !Array.isArray(pl)) {
          collect(pl['playing XI']); collect(pl['playingXI']); collect(pl['Playing XI']);
          collect(pl['bench']); collect(pl['Bench']);
          collect(pl['substitutes']); collect(pl['Substitutes']);
          collect(pl['impact players']); collect(pl['support staff']);
        } else if (Array.isArray(pl)) {
          collect(pl);
        }
        collect(t.playerDetails); collect(t.squad); collect(t.playerDtls);
        collect(t.bench); collect(t.substitutes);
      };
      addTeam(info.team1); addTeam(info.team2);
      addTeam(info?.teams?.team1); addTeam(info?.teams?.team2);
      addTeam(info?.matchInfo?.team1); addTeam(info?.matchInfo?.team2);

      // Pull full per-team squads (Cricbuzz "Squads" tab data) for richer photo coverage
      const t1Id = info?.team1?.teamid || info?.team1?.teamId;
      const t2Id = info?.team2?.teamid || info?.team2?.teamId;
      const [t1Full, t2Full] = await Promise.all([
        t1Id ? fetchTeamSquad(id, t1Id).catch(() => null) : Promise.resolve(null),
        t2Id ? fetchTeamSquad(id, t2Id).catch(() => null) : Promise.resolve(null),
      ]);
      if (t1Full) addTeam(t1Full.team || t1Full);
      if (t2Full) addTeam(t2Full.team || t2Full);

      setPlayerImgMap(map);
    } catch {}
  }, [id]);

  const loadMatch = useCallback(async () => {
    if (!id) return;
    try {
      const data = await fetchMatchById(id);
      if (data) {        // Detect new events for mood animations
        if (data.commentary && data.commentary.length > 0) {
          const latest = data.commentary[0];
          const latestKey = `${latest.over}-${latest.english?.substring(0, 30)}`;
          if (prevCommRef.current && prevCommRef.current !== latestKey) {
            const evt = latest.event || 'normal';
            setMoodEvent(evt);
            setTimeout(() => setMoodEvent(null), 3000);
          }
          prevCommRef.current = latestKey;
        }
        setMatch(data);

        // Commentary persistence: merge fresh + stored, save
        const freshComm = data.commentary || [];
        const shouldPersist = shouldPersistCommentary(data.category, data.seriesName, data.matchType);

        if (shouldPersist && freshComm.length > 0) {
          // Load stored history and merge
          const stored = await loadCommentary(id);
          const merged = mergeCommentary(freshComm, stored);
          setAllCommentary(merged);

          // Save merged commentary back to storage
          saveCommentary(id, merged);
        } else if (shouldPersist) {
          // No fresh commentary, but load stored
          const stored = await loadCommentary(id);
          if (stored.length > 0) {
            setAllCommentary(stored);
          } else {
            setAllCommentary(freshComm);
          }
        } else {
          setAllCommentary(freshComm);
        }

        setNextTimestamp(data.commentaryNextTimestamp);
        setNextIid(data.commentaryNextIid);

        // ============ SYNC-ON-OPEN: fetch ENTIRE commentary history ============
        // Cricbuzz pagination requires BOTH tms (timestamp) AND iid (innings id).
        // Without iid the server keeps returning the latest page (the bug the user
        // was seeing). We walk back iid-by-iid until we find ball 0.1 of innings 1.
        // Persists to AsyncStorage so offline / phone-off users see full history next open.
        if (shouldPersist && !syncDoneRef.current) {
          syncDoneRef.current = true;
          const MAX_SYNC_PAGES = 80; // ~80 pages × ~25 balls ≈ 2000 balls (covers ODI × 2 innings comfortably)

          let autoLoadedComm: Commentary[] = [
            ...(await loadCommentary(id)),
            ...freshComm,
          ];

          // Fast-path: if we already have the opening ball of INNINGS 1, no need to hit API
          const hasOpeningBall = (arr: Commentary[]) =>
            arr.some(c => c.over === '0.1' || c.over === '0.2' || /^0\.[12]$/.test(c.over || ''));

          if (!hasOpeningBall(autoLoadedComm)) {
            // Start with API-provided tms+iid. If tms missing, use Date.now() so we
            // still get the latest page and then walk backwards from there.
            let ts: number | undefined = data.commentaryNextTimestamp || Date.now();
            let currentIid: number | undefined = data.commentaryNextIid;
            let lastKey: string | undefined = undefined;

            for (let page = 0; page < MAX_SYNC_PAGES && ts; page++) {
              const key = `${ts}-${currentIid ?? 'x'}`;
              if (key === lastKey) break; // server echoed same page → stop
              lastKey = key;

              try {
                const moreResult = await fetchMoreCommentary(id, ts, currentIid);
                if (!moreResult.commentary || moreResult.commentary.length === 0) break;

                // Dedup by id before merging
                const existingIds = new Set(autoLoadedComm.map(c => c.id));
                const newOnes = moreResult.commentary.filter(c => !existingIds.has(c.id));

                if (newOnes.length > 0) {
                  autoLoadedComm = [...autoLoadedComm, ...newOnes];
                  // Progressive UI update so user sees history loading in real time
                  const progressMerged = mergeCommentary(autoLoadedComm, []);
                  setAllCommentary(progressMerged);
                }

                // Early exit once we reach the very first ball of the match
                if (hasOpeningBall(autoLoadedComm) && (currentIid === 1 || currentIid === undefined)) {
                  ts = undefined;
                  break;
                }

                // No new items returned — either duplicate page or end-of-history.
                // fetchMoreCommentary will have already tried stepping iid internally,
                // so if we still got nothing new AND iid didn't change, we're done.
                if (newOnes.length === 0) {
                  if (!moreResult.nextIid || moreResult.nextIid === currentIid) break;
                }

                ts = moreResult.nextTimestamp;
                currentIid = moreResult.nextIid;
              } catch {
                break;
              }
            }

            const finalMerged = mergeCommentary(autoLoadedComm, []);
            setAllCommentary(finalMerged);
            if (shouldPersist) saveCommentary(id, finalMerged);
            setNextTimestamp(ts); // may be undefined → "Load More" button hides correctly
            setNextIid(currentIid);
          } else {
            // Already have full history — no more Load More needed
            setNextTimestamp(undefined);
            setNextIid(undefined);
          }
        }

        // Auto-scroll to top when new commentary arrives
        if (freshComm.length > 0 && freshComm.length !== prevCommCountRef.current && (data.status === 'live' || data.status === 'recent')) {
          prevCommCountRef.current = freshComm.length;
          setTimeout(() => mainScrollRef.current?.scrollTo({ y: 0, animated: true }), 300);
        }
        setError(false);
        setRetryCount(0);
      } else if (retryCount < 3) {
        setRetryCount(r => r + 1);
        setTimeout(loadMatch, 2000);
      } else {
        setError(true);
      }
    } catch {
      if (retryCount < 3) {
        setRetryCount(r => r + 1);
        setTimeout(loadMatch, 2000);
      } else {
        setError(true);
      }
    } finally {
      setLoading(false);
    }
  }, [id, retryCount]);

  // Handle "Load More" commentary pagination (manual button for when Sync-on-Open
  // hit the safety cap). Uses both tms and iid from the last response.
  const handleLoadMoreCommentary = useCallback(async () => {
    if (!id || !nextTimestamp || loadingMoreComm) return;
    setLoadingMoreComm(true);
    try {
      const result = await fetchMoreCommentary(id, nextTimestamp, nextIid);
      if (result.commentary.length > 0) {
        const existingIds = new Set(allCommentary.map(c => c.id));
        const newItems = result.commentary.filter(c => !existingIds.has(c.id));
        if (newItems.length > 0) {
          const merged = [...allCommentary, ...newItems];
          setAllCommentary(merged);
          setMatch(prev => prev ? { ...prev, commentary: merged } : prev);

          // Persist merged commentary
          if (match && shouldPersistCommentary(match.category, match.seriesName, match.matchType)) {
            saveCommentary(id, merged);
          }
        }
        setNextTimestamp(result.nextTimestamp);
        setNextIid(result.nextIid);
      } else {
        setNextTimestamp(undefined);
        setNextIid(undefined);
      }
    } catch {
      console.log('[Commentary] Load more failed');
    } finally {
      setLoadingMoreComm(false);
    }
  }, [id, nextTimestamp, nextIid, loadingMoreComm, allCommentary, match]);


  // Logic B: Interstitial click tracker — delegated to AdMobContext.
  // AdMobContext.trackClick() implements the 10/15 preload/show flow.
  const handleInteraction = () => {
    if (effectiveIsPro) return;
    trackClick();
  };

  // Logic C: Watch 1 Rewarded Ad for Pro (v1.0.15 - reduced from 3→1 ad)
  // Ad must be watched to progress. No fallback, no automatic unlock.
  const handleWatchAd = async () => {
    if (adWatchLoading) return;
    setAdWatchLoading(true);
    
    const success = await showRewardedAd();
    setAdWatchLoading(false);
    
    if (success) {
      const newCount = adsWatchedCount + 1;
      setAdsWatchedCount(newCount);

      if (newCount >= 1) {
        // Ad watched - unlock Pro!
        setTempPro(true);
        setProExpiry(Date.now() + 30 * 60 * 1000);
        setProFromAdMob(true);
        setAdsWatchedCount(0);
        setShowProModal(false);
        Alert.alert(
          'Pro Unlocked!',
          'Voice Commentary, Floating Scoreboard and Ad-free for 30 minutes!',
          [{ text: 'Enjoy!' }]
        );
      }
    }
    // If ad failed, no progress. User must try again. NO automatic unlock.
  };

  if (loading) {
    return (
      <AppBackground style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator color="#4CAF50" size="large" />
          <Text style={styles.loadingText}>Loading match...</Text>
        </View>
      </AppBackground>
    );
  }

  if (error || !match) {
    return (
      <ErrorScreen
        onGoBack={() => router.back()}
        onRetry={() => { setError(false); setLoading(true); setRetryCount(0); loadMatch(); }}
        message="Could not load match. Check connection."
      />
    );
  }

  return (
    <AppBackground style={styles.container}>
      <SafeAreaView style={styles.container} onTouchStart={handleInteraction}>
        {/* Emotional animations overlay - 4, 6, Out, Wide */}
        <MatchMoodMeter event={moodEvent} />

      {/*
        Scoreboard used to be a sticky header (stickyHeaderIndices=[0]). User
        asked for Cricbuzz-style behaviour where the scoreboard scrolls with
        the page so commentary can take the full screen. Removed sticky so the
        scoreboard naturally scrolls away. Users can still quick-scroll back
        to the top with the FAB / back press.
      */}
      <ScrollView ref={mainScrollRef} contentContainerStyle={styles.mainScrollContent}>
        {/*
          Banner #1 — HEADER ad (ANCHORED_ADAPTIVE_BANNER, full-width).
          v1.0.12 rev-3 spec: "Top Banner (Banner 1) ko screen ke edges
          tak stretch karein (width: 100%). Container ki har tarah ki
          horizontal padding/margin hata dein taaki ad mobile screen ke
          edges tak touch kare."
          - Container: full-screen width, zero horizontal padding.
          - Ad creative: ANCHORED_ADAPTIVE_BANNER (native full-width size).
          - Unit ID: Banner #1 (distinct from Banner #2/#3 so AdMob serves
            different creatives across the three slots).
        */}
        <View style={styles.headerAdWrap}>
          <NativeAdCard slotIndex={0} marginVertical={0} />
        </View>

        {/* Scoreboard (scrolls with page) */}
        <View style={styles.scoreHeader}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color="#1B5E20" />
            </TouchableOpacity>
            {/* Prefer status text (live context: "Day 3 Lunch", "Won by X runs")
                over series name — more useful & prevents overlap with team scores.
                We additionally replace full team names with their short-name (e.g.
                "Lucknow Super Giants" → "LSG") so the strip stays compact on
                phones — user reported full names eating too much space. */}
            <Text
              style={match.statusText ? styles.headerStatus : styles.seriesName}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {(() => {
                const raw = match.statusText || match.seriesName || '';
                if (!raw) return '';
                let out = raw;
                // Replace each team's full name with shortName (case-insensitive,
                // word-boundary aware). Longest-first to avoid partial overlap.
                const pairs = (match.teams || [])
                  .map(t => ({ full: (t?.name || '').trim(), short: (t?.shortName || '').trim() }))
                  .filter(p => p.full && p.short && p.full.toLowerCase() !== p.short.toLowerCase())
                  .sort((a, b) => b.full.length - a.full.length);
                for (const p of pairs) {
                  try {
                    const esc = p.full.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    out = out.replace(new RegExp(`\\b${esc}\\b`, 'gi'), p.short);
                  } catch {}
                }
                return out;
              })()}
            </Text>
            
            <View style={styles.headerActions}>
              {/* Overlay Button - Non-Pro: opens Pro Modal, Pro: toggles overlay */}
              <TouchableOpacity
                style={[styles.actionBtn, nativeOverlayActive && styles.actionBtnActive]}
                onPress={async () => {
                  // Non-Pro users: show Pro Modal to watch ads first
                  if (!effectiveIsPro) {
                    setShowProModal(true);
                    return;
                  }
                  
                  // Pro users: toggle overlay directly
                  if (nativeOverlayActive) {
                    await hideFloatingWidget();
                    setNativeOverlayActive(false);
                    return;
                  }
                  
                  // Check permission first
                  const hasPermission = await checkOverlayPermission();
                  if (!hasPermission) {
                    Alert.alert(
                      'Permission Required',
                      'Enable "Display over other apps" permission for CricApp.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { 
                          text: 'Open Settings', 
                          onPress: async () => {
                            setPendingOverlayRequest(true);
                            await requestOverlayPermission();
                          }
                        }
                      ]
                    );
                    return;
                  }
                  
                  // Show floating widget
                  const scoreData = buildFloatingScoreData(match);
                  const success = await showFloatingWidget(scoreData);
                  if (success) {
                    setNativeOverlayActive(true);
                  }
                }}
                data-testid="pin-score-button"
              >
                <Ionicons
                  name={nativeOverlayActive ? 'layers' : 'layers-outline'}
                  size={20}
                  color={nativeOverlayActive ? '#2E7D32' : '#616161'}
                />
              </TouchableOpacity>

              {/* Notification Toggle */}
              <TouchableOpacity
                style={[styles.actionBtn, isTracking(id || '') && styles.actionBtnActive]}
                onPress={async () => {
                  if (!notificationsEnabled) await enableNotifications();
                  toggleTracking(id || '', match.teams[0]?.shortName || 'TM1', match.teams[1]?.shortName || 'TM2');
                }}
              >
                <Ionicons
                  name={isTracking(id || '') ? 'notifications' : 'notifications-outline'}
                  size={20}
                  color={isTracking(id || '') ? '#2E7D32' : '#616161'}
                />
              </TouchableOpacity>

              {/* v1.0.16 — Cricbuzz external link button removed per user
                  directive 2026-05-06. */}
            </View>
          </View>

          {/* Score Row - Compact horizontal layout: logo + (name / score / overs) */}
          <View style={styles.teamRow}>
            <View style={styles.teamBlock}>
              {match.teams[0].imageId || match.teams[0].teamId ? (
                <Image
                  source={{ uri: `https://www.cricbuzz.com/a/img/v1/72x54/i1/c${match.teams[0].imageId || match.teams[0].teamId}/team.jpg` }}
                  style={styles.teamLogo}
                  resizeMode="contain"
                />
              ) : null}
              <View style={styles.teamMeta}>
                <Text style={styles.teamName} numberOfLines={1}>{match.teams[0].shortName}</Text>
                <Text style={styles.teamScore} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                  {match.teams[0].runs !== undefined ? `${match.teams[0].runs}/${match.teams[0].wickets || 0}` : '-'}
                  {match.teams[0].overs !== undefined ? <Text style={styles.overs}>  ({match.teams[0].overs} ov)</Text> : null}
                </Text>
              </View>
            </View>

            <View style={styles.centerCol}>
              <MatchStatusBadge state={match.status} isLive={match.status === 'live'} />
            </View>

            <View style={styles.teamBlock}>
              {match.teams[1].imageId || match.teams[1].teamId ? (
                <Image
                  source={{ uri: `https://www.cricbuzz.com/a/img/v1/72x54/i1/c${match.teams[1].imageId || match.teams[1].teamId}/team.jpg` }}
                  style={styles.teamLogo}
                  resizeMode="contain"
                />
              ) : null}
              <View style={styles.teamMeta}>
                <Text style={styles.teamName} numberOfLines={1}>{match.teams[1].shortName}</Text>
                <Text style={styles.teamScore} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                  {match.teams[1].runs !== undefined ? `${match.teams[1].runs}/${match.teams[1].wickets || 0}` : '-'}
                  {match.teams[1].overs !== undefined ? <Text style={styles.overs}>  ({match.teams[1].overs} ov)</Text> : null}
                </Text>
              </View>
            </View>
          </View>

          {/*
            Cricbuzz-style structured stat tables. Batters and bowler live in
            their own small tables with column headers (R/B/4s/6s/SR and
            O/M/R/W/ECO). Replaces the compact text rows "CREASE *name 4(4)"
            and "BOWLER name 3.2-0-18-2" per user's reference image.
          */}
          {(match.status === 'live' || match.status === 'recent') && match.batsmen && match.batsmen.length > 0 && (
            <View style={styles.statTableContainer}>
              {/* Batter header */}
              <View style={styles.statTableHeaderRow}>
                <Text style={[styles.statHeaderCell, styles.statNameCol]}>Batter</Text>
                <Text style={[styles.statHeaderCell, styles.statNumCol]}>R</Text>
                <Text style={[styles.statHeaderCell, styles.statNumCol]}>B</Text>
                <Text style={[styles.statHeaderCell, styles.statNumCol]}>4s</Text>
                <Text style={[styles.statHeaderCell, styles.statNumCol]}>6s</Text>
                <Text style={[styles.statHeaderCell, styles.statSrCol]}>SR</Text>
              </View>
              {/* Batter rows */}
              {match.batsmen.map((bat, idx) => {
                const sr = bat.balls > 0 ? ((bat.runs / bat.balls) * 100).toFixed(2) : '0.00';
                return (
                  <View key={idx} style={styles.statTableRow}>
                    <Text style={[styles.statPlayerName, styles.statNameCol]} numberOfLines={1}>
                      {bat.name}{bat.isStriker ? ' *' : ''}
                    </Text>
                    <Text style={[styles.statValueCell, styles.statNumCol]}>{bat.runs}</Text>
                    <Text style={[styles.statValueCell, styles.statNumCol]}>{bat.balls}</Text>
                    <Text style={[styles.statValueCell, styles.statNumCol]}>{bat.fours ?? 0}</Text>
                    <Text style={[styles.statValueCell, styles.statNumCol]}>{bat.sixes ?? 0}</Text>
                    <Text style={[styles.statValueCell, styles.statSrCol]}>{sr}</Text>
                  </View>
                );
              })}
            </View>
          )}

          {(match.status === 'live' || match.status === 'recent') && match.bowler && match.bowler.name && (
            <View style={styles.statTableContainer}>
              {/* Bowler header */}
              <View style={styles.statTableHeaderRow}>
                <Text style={[styles.statHeaderCell, styles.statNameCol]}>Bowler</Text>
                <Text style={[styles.statHeaderCell, styles.statNumCol]}>O</Text>
                <Text style={[styles.statHeaderCell, styles.statNumCol]}>M</Text>
                <Text style={[styles.statHeaderCell, styles.statNumCol]}>R</Text>
                <Text style={[styles.statHeaderCell, styles.statNumCol]}>W</Text>
                <Text style={[styles.statHeaderCell, styles.statSrCol]}>ECO</Text>
              </View>
              {/* Bowler row. ECO = runs / oversFloat (Cricbuzz stores overs as
                  "1.2" meaning 1 over 2 balls; we convert to 1.333... balls). */}
              {(() => {
                const b = match.bowler!;
                const oStr = String(b.overs || 0);
                const [whole, ballsPart] = oStr.split('.');
                const totalBalls = (Number(whole) || 0) * 6 + (Number(ballsPart) || 0);
                const eco = totalBalls > 0 ? ((b.runs * 6) / totalBalls).toFixed(2) : '0.00';
                return (
                  <View style={styles.statTableRow}>
                    <Text style={[styles.statPlayerName, styles.statNameCol]} numberOfLines={1}>
                      {b.name} *
                    </Text>
                    <Text style={[styles.statValueCell, styles.statNumCol]}>{b.overs}</Text>
                    <Text style={[styles.statValueCell, styles.statNumCol]}>{b.maidens}</Text>
                    <Text style={[styles.statValueCell, styles.statNumCol]}>{b.runs}</Text>
                    <Text style={[styles.statValueCell, styles.statNumCol]}>{b.wickets}</Text>
                    <Text style={[styles.statValueCell, styles.statSrCol]}>{eco}</Text>
                  </View>
                );
              })()}
            </View>
          )}

          {/* THIS OVER chip strip removed per user request (v1.0.11): the
              recentOvsStr data was unreliable — often showed stale / mis-
              sequenced balls ("1 0 6 1 0 0 | 0 0" when over was only at ball 1).
              Users can see ball-by-ball in the commentary feed below. */}

          {/* Pro Overlay Toggles — moved to a pin button in the header actions row
              above (line 731) for screen-space optimisation. Removed from here so the
              scoreboard stays compact (user's "space optimization" request). */}
        </View>

        {/* Content Tab Bar - Commentary / Scorecard / Squads */}
        <View style={styles.contentTabBar} data-testid="content-tab-bar">
          <TouchableOpacity
            style={[styles.contentTab, activeDetailTab === 'commentary' && styles.contentTabActive]}
            onPress={() => setActiveDetailTab('commentary')}
            data-testid="tab-commentary"
          >
            <Ionicons name="chatbox-outline" size={14} color={activeDetailTab === 'commentary' ? '#FFF' : '#999'} />
            <Text style={[styles.contentTabText, activeDetailTab === 'commentary' && styles.contentTabTextActive]}>Commentary</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.contentTab, activeDetailTab === 'scorecard' && styles.contentTabActive]}
            onPress={() => setActiveDetailTab('scorecard')}
            data-testid="tab-scorecard"
          >
            <Ionicons name="stats-chart-outline" size={14} color={activeDetailTab === 'scorecard' ? '#FFF' : '#999'} />
            <Text style={[styles.contentTabText, activeDetailTab === 'scorecard' && styles.contentTabTextActive]}>Scorecard</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.contentTab, activeDetailTab === 'squads' && styles.contentTabActive]}
            onPress={() => setActiveDetailTab('squads')}
            data-testid="tab-squads"
          >
            <Ionicons name="people-outline" size={14} color={activeDetailTab === 'squads' ? '#FFF' : '#999'} />
            <Text style={[styles.contentTabText, activeDetailTab === 'squads' && styles.contentTabTextActive]}>Squads</Text>
          </TouchableOpacity>
        </View>

        {/* Content Area - Toggle between Commentary, Scorecard, and Squads */}
        {activeDetailTab === 'scorecard' ? (
          <ScorecardSection matchId={id || ''} isLive={match.status === 'live'} />
        ) : activeDetailTab === 'squads' ? (
          <SquadsSection matchId={id || ''} isLive={match.status === 'live'} />
        ) : (
          <>
            {/* Cricket Field */}
            <CricketField
              lastCommentary={match.commentary?.[0]}
              battingTeam={match.teams[0].shortName}
              bowlingTeam={match.teams[1].shortName}
            />

            {/*
              v1.0.17 (rev-6) — Banner #2 sits between the scoreboard area
              (Cricket Field) and the first row of ball-by-ball commentary,
              exactly as the user wants: scoreboard → Banner #2 → latest
              commentary ball. Full-width INLINE_ADAPTIVE_BANNER, slot-1
              rotator so creative differs from Banner #1.
            */}
            <NativeAdCard slotIndex={1} marginVertical={12} />

            {/* Commentary - with error boundary */}
            {match.commentary && match.commentary.length > 0 ? (
              <React.Suspense fallback={<View style={styles.noComm}><ActivityIndicator color="#4CAF50" /></View>}>
                <CommentarySection
                  commentary={allCommentary.length > 0 ? allCommentary : (match.commentary || [])}
                  matchId={id}
                  isLive={match.status === 'live'}
                  matchStatus={match.status as 'live' | 'recent' | 'upcoming'}
                  onLoadMore={handleLoadMoreCommentary}
                  hasMore={!!nextTimestamp}
                  isLoadingMore={loadingMoreComm}
                  playerImgMap={playerImgMap}
                />
              </React.Suspense>
            ) : (
              <View style={styles.noComm}>
                <Ionicons name="chatbox-outline" size={40} color="#999" />
                <Text style={styles.noCommText}>
                  {match.status === 'upcoming' ? 'Match has not started yet' : 'Commentary not available'}
                </Text>

                {/* NOTE: removed the pair of placeholder banner ads here.
                    The top-of-content NativeAdCard above already provides a
                    single premium slot — rendering more ads in this small
                    empty-state view would violate AdMob's "two ads too
                    close" policy for low-content screens. */}

                {/* v1.0.16 — Cricbuzz "View Full Scorecard" external
                    link button removed per user directive 2026-05-06. */}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Live Interactions — v1.0.17: Live Reactions (🔥) + Chat Room (💬) */}
      <LiveInteractions
        matchId={id || ''}
        team1={match.teams[0]?.name || match.teams[0]?.shortName || ''}
        team2={match.teams[1]?.name || match.teams[1]?.shortName || ''}
        team1Short={match.teams[0]?.shortName || ''}
        team2Short={match.teams[1]?.shortName || ''}
      />

      {/* Pro Modal - 3 Rewarded Ads */}
      <Modal visible={showProModal} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalBox}>
            <Text style={styles.mTitle}>Unlock Special Access</Text>

            <View style={styles.featureList}>
              {[
                { icon: 'mic', text: 'Voice Commentary (TTS)' },
                { icon: 'layers', text: 'Floating Scoreboard' },
                { icon: 'notifications', text: 'Score Notifications' },
                { icon: 'close-circle', text: 'No Ads for 30 mins' },
              ].map((f, i) => (
                <View key={i} style={styles.featureRow}>
                  <Ionicons name={f.icon as any} size={18} color="#4CAF50" />
                  <Text style={styles.featureTxt}>{f.text}</Text>
                </View>
              ))}
            </View>

            {/* Progress Bar — 3 ads required for Pro unlock (matches handler logic) */}
            <View style={styles.progressWrap}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${(adsWatchedCount / 1) * 100}%` }]} />
              </View>
              <Text style={styles.progressLabel}>{adsWatchedCount}/1 Ad Watched</Text>
            </View>

            <TouchableOpacity
              style={[styles.watchBtn, adWatchLoading && { opacity: 0.6 }]}
              disabled={adWatchLoading}
              onPress={handleWatchAd}
            >
              {adWatchLoading ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Ionicons name="play-circle" size={22} color="#FFF" />
              )}
              <Text style={styles.watchBtnTxt}>
                {adWatchLoading ? 'Loading ad…' : `Watch Ad ${adsWatchedCount + 1} of 1`}
              </Text>
            </TouchableOpacity>

            {/* OR divider */}
            <View style={styles.orDividerRow}>
              <View style={styles.orDividerLine} />
              <Text style={styles.orDividerText}>OR</Text>
              <View style={styles.orDividerLine} />
            </View>

            {/* v1.0.15 — Share to unlock 30 min Pro (1/day quota).
                Native ACTION_SEND intent — user can pick any installed
                share-compatible app. */}
            <TouchableOpacity
              style={[styles.shareUnlockBtn, shareLoading && { opacity: 0.6 }]}
              disabled={shareLoading}
              onPress={async () => {
                if (shareLoading) return;
                setShareLoading(true);
                try {
                  const allowed = await canShareUnlockToday();
                  if (!allowed) {
                    Alert.alert(
                      'Daily Share Limit Reached',
                      'Aap aaj ki free share unlock use kar chuke hain. Next 30 min Pro ke liye "Watch Ad" button use karein. Share quota kal reset hogi.'
                    );
                    return;
                  }
                  const result = await Share.share({
                    message:
                      'Hey! Check out CricApp — live cricket scores, commentary & more: https://play.google.com/store/apps/details?id=com.cricapp.live',
                    url: 'https://play.google.com/store/apps/details?id=com.cricapp.live',
                    title: 'CricApp — Live Cricket',
                  });
                  if (result.action === Share.sharedAction) {
                    await markSharedUnlockToday();
                    setTempPro(true);
                    setProExpiry(Date.now() + 30 * 60 * 1000);
                    setProFromAdMob(true);
                    setAdsWatchedCount(0);
                    setShowProModal(false);
                    Alert.alert(
                      'Pro Unlocked!',
                      'Thanks for sharing! Voice Commentary, Floating Scoreboard and Ad-free mode are active for 30 minutes.',
                      [{ text: 'Enjoy!' }]
                    );
                  } else if (result.action === Share.dismissedAction) {
                    Alert.alert('Share Cancelled', 'Please share the app with a friend to unlock 30 mins Pro for free.');
                  }
                } catch (err) {
                  console.warn('[Share] error:', err);
                } finally {
                  setShareLoading(false);
                }
              }}
              data-testid="share-unlock-pro-button"
            >
              {shareLoading ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Ionicons name="share-social" size={20} color="#FFF" />
              )}
              <Text style={styles.shareUnlockBtnTxt}>
                {shareLoading ? 'Opening share…' : 'Share to unlock 30 min free (1/day)'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setShowProModal(false)}>
              <Text style={styles.laterTxt}>Maybe Later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Floating Scoreboard - Pro Only */}
      {showOverlay && effectiveIsPro && (
        <FloatingScoreboard
          match={match}
          visible={showOverlay}
          onClose={() => setShowOverlay(false)}
          isPro={effectiveIsPro}
        />
      )}
    </SafeAreaView>
    </AppBackground>
  );
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
// Scoreboard sizing. User requested a significantly taller scoreboard to
// fit the Cricbuzz-style batter / bowler tables. We bumped minHeight to
// 26% of screen (from 18%) so the new table rows fit comfortably without
// overlapping on short / zoomed phones. Max cap removed earlier so batter
// rows + THIS OVER strip are always fully visible when the user scrolls.
const IS_SHORT_SCREEN = SCREEN_H < 700;
const SCOREBOARD_MAX_HEIGHT = Math.round(SCREEN_H * (IS_SHORT_SCREEN ? 0.50 : 0.45));
const SCOREBOARD_MIN_HEIGHT = Math.round(SCREEN_H * 0.26);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'transparent' },
  loadingText: { color: '#999', marginTop: 12, fontSize: 14 },
  // v1.0.12 rev-3: ScrollView's contentContainerStyle — zero horizontal
  // padding so the header ad below can go edge-to-edge. Scoreboard below
  // adds its own paddingHorizontal via styles.scoreHeader.
  mainScrollContent: {
    paddingHorizontal: 0,
  },
  // Full-screen-width wrapper for Banner #1 — no margin, no padding, no
  // border. Overrides any ancestor horizontal inset.
  headerAdWrap: {
    width: '100%',
    alignSelf: 'stretch',
    marginHorizontal: 0,
    paddingHorizontal: 0,
    backgroundColor: 'transparent',
  },
  scoreHeader: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 13,
    paddingTop: 7,
    paddingBottom: 5,
    minHeight: SCOREBOARD_MIN_HEIGHT,
    // v1.0.11 — dark blue full-border (user brief 2026-04-20). We bumped
    // the horizontal paddings slightly above (13/7) to guarantee the 2px
    // frame never clips player names or score digits. Rounded corners are
    // intentional but subtle (10px) so the scoreboard still reads as a
    // "card" rather than an oversized rounded button.
    borderWidth: 2,
    borderColor: '#0D47A1',
    borderRadius: 10,
    overflow: 'hidden',
    marginHorizontal: 6,
    marginTop: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  backBtn: { padding: 4, marginRight: 6 },
  // +10% on top of previous 20% bump (16→18). Dark on white.
  seriesName: { color: '#1B5E20', fontSize: 18, flex: 1, fontWeight: '800' },
  headerStatus: { color: '#2E7D32', fontSize: 18, flex: 1, fontWeight: '800', fontStyle: 'italic' },
  headerActions: { flexDirection: 'row', gap: 6 },
  actionBtn: {
    padding: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(46,125,50,0.10)',
  },
  actionBtnActive: { backgroundColor: 'rgba(46,125,50,0.25)' },
  teamRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  centerCol: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, flexShrink: 0 },
  teamBlock: { flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'center', gap: 7, flexShrink: 1, minWidth: 0 },
  teamLogo: { width: 35, height: 35, borderRadius: 18, backgroundColor: '#F0F0F0' },
  teamMeta: { alignItems: 'flex-start', flexShrink: 1, minWidth: 0 },
  teamName: { color: '#424242', fontSize: 15, fontWeight: '800', lineHeight: 19 },
  teamScore: { color: '#0D0D0D', fontSize: 22, fontWeight: '900', lineHeight: 27 },
  overs: { color: '#616161', fontSize: 13, lineHeight: 16, fontWeight: '600' },
  statusTxt: { color: '#2E7D32', fontSize: 15, textAlign: 'center', marginBottom: 2, fontStyle: 'italic' },
  statusTxtCentered: { color: '#2E7D32', fontSize: 15, textAlign: 'center', marginTop: 2, fontStyle: 'italic', maxWidth: 200, fontWeight: '700' },
  // ========== Cricbuzz-style stat tables (Batter / Bowler) ==========
  statTableContainer: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingVertical: 8,
    paddingHorizontal: 2,
    marginTop: 4,
  },
  statTableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  statTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  statHeaderCell: {
    fontSize: 13,
    fontWeight: '600',
    color: '#757575',
  },
  statPlayerName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1565C0',
  },
  statValueCell: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0D0D0D',
    textAlign: 'center',
  },
  statNameCol: {
    flex: 3,
    textAlign: 'left',
  },
  statNumCol: {
    flex: 1,
    textAlign: 'center',
  },
  statSrCol: {
    flex: 1.4,
    textAlign: 'right',
    paddingRight: 4,
  },

  // Legacy compact rows — no longer used, kept for backward compatibility
  // (some code paths / snapshots reference these; removing caused style-lookup
  // warnings). Safe to delete in a later cleanup pass.
  batsmenContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F7FA',
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
    marginBottom: 4,
    gap: 9,
  },
  batsmenTitle: {
    color: '#2E7D32',
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    minWidth: 55,
  },
  batsmenRow: { flexDirection: 'row', flex: 1, justifyContent: 'space-around' },
  batsmanItem: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, minWidth: 0 },
  batsmanName: { color: '#212121', fontSize: 14, fontWeight: '700' },
  strikerName: { color: '#C62828', fontWeight: '900' },
  batsmanScore: { color: '#0D0D0D', fontSize: 15, fontWeight: '900' },
  bowlerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
    marginBottom: 4,
    gap: 9,
  },
  bowlerTitle: { color: '#E65100', fontSize: 13, fontWeight: '900', minWidth: 55 },
  bowlerName: { color: '#0D0D0D', fontSize: 14, fontWeight: '800', flexShrink: 1 },
  bowlerFigures: { color: '#424242', fontSize: 14, fontWeight: '700', marginLeft: 6 },
  overSummaryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECEFF1',
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
    marginBottom: 4,
    gap: 9,
  },
  overSummaryTitle: {
    color: '#2E7D32',
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    minWidth: 66,
  },
  overSummaryScroll: {
    flex: 1,
    minHeight: 30,
    backgroundColor: '#FFFFFF',
    borderRadius: 5,
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderWidth: 1,
    borderColor: '#CFD8DC',
  },
  overSummaryScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 10,
    gap: 2,
  },
  proRow: { alignItems: 'center', marginTop: 2, marginBottom: 2 },
  // Content tab bar (Commentary / Scorecard)
  contentTabBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(34,34,34,0.9)',
    marginHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(76,175,80,0.3)',
  },
  contentTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 6,
  },
  contentTabActive: {
    borderBottomWidth: 3,
    borderBottomColor: '#4CAF50',
    backgroundColor: 'rgba(76,175,80,0.1)',
  },
  contentTabText: {
    color: '#999',
    fontSize: 13,
    fontWeight: '600',
  },
  contentTabTextActive: {
    color: '#FFF',
  },
  unlockBtn: {
    backgroundColor: 'rgba(51,51,51,0.9)',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  unlockTxt: { color: '#FFF', fontWeight: 'bold', fontSize: 10 },
  noComm: { padding: 40, alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)', margin: 16, borderRadius: 12 },
  noCommText: { color: '#999', fontSize: 16, marginTop: 12, marginBottom: 16, textAlign: 'center' },
  externalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFA500',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    gap: 8,
  },
  externalTxt: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
  modalBox: { backgroundColor: '#FFF', padding: 24, borderRadius: 20, width: '85%', alignItems: 'center' },
  mTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 16, color: '#333' },
  featureList: { width: '100%', marginBottom: 16, gap: 10 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureTxt: { fontSize: 14, color: '#555' },
  progressWrap: { width: '100%', marginBottom: 16, alignItems: 'center' },
  progressTrack: { width: '100%', height: 10, backgroundColor: '#E0E0E0', borderRadius: 5, overflow: 'hidden', marginBottom: 6 },
  progressFill: { height: '100%', backgroundColor: '#4CAF50', borderRadius: 5 },
  progressLabel: { fontSize: 14, fontWeight: '700', color: '#4CAF50' },
  watchBtn: {
    backgroundColor: '#4CAF50',
    padding: 14,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 10,
  },
  watchBtnTxt: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  orDividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 10,
    width: '100%',
  },
  orDividerLine: { flex: 1, height: 1, backgroundColor: '#DDD' },
  orDividerText: { marginHorizontal: 10, color: '#999', fontSize: 12, fontWeight: '700' },
  shareUnlockBtn: {
    backgroundColor: '#1976D2',
    borderRadius: 22,
    paddingVertical: 13,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
    elevation: 3,
  },
  shareUnlockBtnTxt: { color: '#FFF', fontWeight: 'bold', fontSize: 15 },
  laterTxt: { marginTop: 8, color: '#999', fontSize: 14 },
});
