import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { Commentary, Language } from '../types/match';
import { usePro } from '../context/ProContext';
import { useAdMob } from '../context/AdMobContext.native';
import NativeAdCard from './NativeAdCard';

interface CommentarySectionProps {
  commentary: Commentary[];
  matchId?: string;
  isLive?: boolean;
  matchStatus?: 'live' | 'recent' | 'upcoming';
  onLoadMore?: () => Promise<void>;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  /**
   * Optional name → Cricbuzz faceImageId map (lowercase name key).
   * Used to render avatars inside OUT / NEW BATSMAN / BOWLER event cards.
   */
  playerImgMap?: Record<string, string>;
}

// Small avatar for event cards (photo next to player name)
function EventAvatar({ imageId, size = 42 }: { imageId?: string; size?: number }) {
  if (imageId) {
    return (
      <Image
        source={{ uri: `https://www.cricbuzz.com/a/img/v1/152x152/i1/c${imageId}/player.jpg` }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: '#F5F5F5',
          borderWidth: 2,
          borderColor: '#FFF',
        }}
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: '#FFFFFF',
        borderWidth: 2,
        borderColor: '#E0E0E0',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name="person" size={size * 0.55} color="#999" />
    </View>
  );
}

// Normalize player name for imageMap lookup
function lookupImg(name: string | undefined, map?: Record<string, string>): string | undefined {
  if (!name || !map) return undefined;
  const key = name.replace(/\s*\((c|wk)\)/gi, '').toLowerCase().trim();
  return map[key];
}

// ============ TEXT FORMATTING ENGINE (v1.0.11 simplified) ============
//
// User reported that commentators' metaphorical use of words like "OUT",
// "WICKET", "FOUR", "SIX", "BOWLED" was getting BOLD + UPPERCASED + RED
// in the app — looking like a real dismissal when it wasn't (e.g. "split
// backward point and short third man OUT so perfectly" is praise, not a
// wicket). We now do NOT perform keyword-based highlighting at all for
// regular commentary rows — the actual event type (six/four/wicket) is
// conveyed via the colored event badge + the Cricbuzz-style event card.
//
// Only player names in "Bowler to Batter, …" remain bolded because those
// are unambiguous and help readability.

// Pattern: "PlayerName to PlayerName" - detect bowler-to-batter format
const BOWLER_BATTER_REGEX = /^([A-Z][a-z]+(?: [A-Z][a-z]+)*)\s+to\s+([A-Z][a-z]+(?: [A-Z][a-z]+)*)/;

// Pattern: Bowling figures like "[3.0-0-18-4]"
const BOWLING_FIGURES_REGEX = /\[[\d.]+-\d+-\d+-\d+\]/g;

// Pattern: Speaker name for quotes (e.g., "Virat Kohli:" at start of line)
const SPEAKER_REGEX = /^([A-Z][a-z]+(?: [A-Z][a-z]+)+):\s*/;

/**
 * Parse commentary text into light-weight segments.
 * - Speaker prefix (e.g., "Virat Kohli:") → bold blue
 * - "Bowler to Batter, …" lead-in → both names bold
 * - Bowling figures like "[3.0-0-18-4]" → bold blue
 * - Everything else → plain text, NO uppercase / NO keyword coloring
 */
function parseRichText(text: string, isWicketRow: boolean = false): Array<{ text: string; bold: boolean; color?: string }> {
  if (!text) return [];

  const segments: Array<{ text: string; bold: boolean; color?: string }> = [];
  let remaining = text;

  // Speaker pattern (post-match quotes)
  const speakerMatch = remaining.match(SPEAKER_REGEX);
  if (speakerMatch) {
    segments.push({ text: speakerMatch[1] + ':', bold: true, color: '#1565C0' });
    remaining = remaining.slice(speakerMatch[0].length);
    if (remaining.startsWith(' ')) remaining = remaining.slice(1);
  }

  // Bowler-to-batter lead-in
  const btbMatch = remaining.match(BOWLER_BATTER_REGEX);
  if (btbMatch && !speakerMatch) {
    segments.push({ text: btbMatch[1], bold: true }); // Bowler
    segments.push({ text: ' to ', bold: false });
    segments.push({ text: btbMatch[2], bold: true }); // Batter
    remaining = remaining.slice(btbMatch[0].length);
    const afterNames = remaining.match(/^,\s*/);
    if (afterNames) {
      segments.push({ text: ', ', bold: false });
      remaining = remaining.slice(afterNames[0].length);
    }
  }

  // Bowling figures highlighting in the remaining text
  if (remaining.length > 0) {
    const matches = Array.from(remaining.matchAll(BOWLING_FIGURES_REGEX));
    if (matches.length === 0) {
      segments.push({ text: remaining, bold: false });
    } else {
      let cursor = 0;
      for (const m of matches) {
        const idx = m.index ?? 0;
        if (idx > cursor) segments.push({ text: remaining.slice(cursor, idx), bold: false });
        segments.push({ text: m[0], bold: true, color: '#1565C0' });
        cursor = idx + m[0].length;
      }
      if (cursor < remaining.length) segments.push({ text: remaining.slice(cursor), bold: false });
    }
  }

  return segments.length > 0 ? segments : [{ text, bold: false }];
}

/**
 * Render rich text with bold formatting.
 * Pass `isWicketRow` when the parent row is a confirmed wicket event so that
 * the OUT / CAUGHT / BOWLED keywords are rendered in red. In plain commentary
 * rows they stay bold but un-colored.
 */
function RichCommentaryText({ text, style, isWicketRow = false }: { text: string; style?: any; isWicketRow?: boolean }) {
  const segments = parseRichText(text, isWicketRow);

  return (
    <Text style={style}>
      {segments.map((seg, i) => (
        <Text
          key={i}
          style={[
            seg.bold && { fontWeight: '800' },
            seg.color && { color: seg.color },
          ]}
        >
          {seg.text}
        </Text>
      ))}
    </Text>
  );
}

const CommentarySection: React.FC<CommentarySectionProps> = ({
  commentary,
  matchId,
  isLive = false,
  matchStatus,
  onLoadMore,
  hasMore = false,
  isLoadingMore = false,
  playerImgMap,
}) => {
  const [language, setLanguage] = useState<Language>('english');
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);

  const { isPro } = usePro();
  // BannerAdComponent is no longer used — CommentarySection renders
  // <NativeAdCard /> directly (v1.0.11 Native Advanced migration). The
  // useAdMob() hook is kept for any future call sites that need context.
  useAdMob();

  const speakCommentary = (text: string, index: number) => {
    try {
      Speech.stop();
      setSpeakingIndex(index);
      Speech.speak(text, {
        language: 'en-IN',
        pitch: 1.0,
        rate: 0.9,
        onDone: () => setSpeakingIndex(null),
        onStopped: () => setSpeakingIndex(null),
        onError: () => setSpeakingIndex(null),
      });
    } catch {
      setSpeakingIndex(null);
    }
  };

  const handleViewFullDetails = () => {
    if (!matchId) return;
    const url = `https://www.cricbuzz.com/live-cricket-scores/${matchId}`;
    Alert.alert(
      'View Full Match Details',
      'Open full ball-by-ball coverage on the web for this match? This will open in your browser.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open', onPress: () => Linking.openURL(url).catch(() => {}) },
      ]
    );
  };

  const getEventColor = (event?: string) => {
    switch (event) {
      case 'wicket': return '#FF4444';
      case 'six': return '#9C27B0';
      case 'four': return '#4CAF50';
      case 'wide': return '#FF9800';
      case 'dot': return '#999';
      default: return '#2196F3';
    }
  };

  const getEventIcon = (event?: string): string => {
    switch (event) {
      case 'wicket': return 'alert-circle';
      case 'six': return 'star';
      case 'four': return 'flash';
      case 'wide': return 'resize-outline';
      case 'dot': return 'ellipse-outline';
      default: return 'radio-button-on';
    }
  };

  const getEventLabel = (event?: string) => {
    switch (event) {
      case 'wicket': return 'WICKET';
      case 'six': return 'SIX';
      case 'four': return 'FOUR';
      case 'wide': return 'WIDE';
      case 'dot': return 'DOT';
      default: return '';
    }
  };

  // Alternating row background colors - only 2 pastel shades (yellow + green) for soft look
  // per v1.0.8 spec. No red on regular rows (red reserved for OUT event cards only).
  const getAlternatingBg = (index: number): string => {
    // 60% solid / 40% transparent — matches Scorecard & Squads tiles
    const colors = [
      'rgba(255, 249, 196, 0.70)', // Pastel yellow
      'rgba(200, 230, 201, 0.70)', // Pastel green
    ];
    return colors[index % 2];
  };

  // Detect special visual events from commentary text.
  // Returns a category or null; drives Cricbuzz-style event cards.
  //
  // STRICT wicket detection — only the API's explicit `event === 'wicket'`
  // flag is trusted. Previously we also pattern-matched "out/wkt/bowled"
  // in the text, but that produced false positives when commentators used
  // these words metaphorically ("squeezes it OUT so perfectly", "bowled him
  // at the nets") → user saw bogus OUT cards and red highlighting on FOUR
  // balls. The Cricbuzz API reliably sets eventtype=WICKET for real
  // dismissals, so the heuristic is redundant and harmful.
  const detectEventType = (item: Commentary): 'wicket' | 'new-batsman' | 'bowler-change' | null => {
    if (item.event === 'wicket') return 'wicket';
    if (/(takes guard|walks to the crease|new batsman|comes to the crease|is the new batter|walks in)/i.test(item.english || '')) return 'new-batsman';
    if (/(bowling change|takes the ball|into the attack|new spell|will bowl|replaces [a-z]+ [a-z]+ into the attack)/i.test(item.english || '')) return 'bowler-change';
    return null;
  };

  // Extract player name + runs/balls + partnership from a wicket commentary line
  // e.g. "Bumrah to Kohli, OUT, caught! Kohli 45(32) ... partnership of 67(58) runs"
  const parseWicketDetails = (text: string): { player?: string; runs?: string; balls?: string; dismissal?: string; partnershipRuns?: string; partnershipBalls?: string } => {
    const out: { player?: string; runs?: string; balls?: string; dismissal?: string; partnershipRuns?: string; partnershipBalls?: string } = {};
    // Score pattern: 45(32) or 45*(32)
    const scoreM = text.match(/(\b[A-Z][a-zA-Z'\- ]{1,30}?)\s+(\d+)\*?\((\d+)\)/);
    if (scoreM) {
      out.player = scoreM[1].trim();
      out.runs = scoreM[2];
      out.balls = scoreM[3];
    }
    // Dismissal phrase
    const dismissM = text.match(/\b(c\s+[A-Za-z.'\- ]+?\s+b\s+[A-Za-z.'\- ]+|b\s+[A-Za-z.'\- ]+|lbw\s+b\s+[A-Za-z.'\- ]+|run out|stumped|hit wicket)/i);
    if (dismissM) out.dismissal = dismissM[0].trim();
    // Partnership: Cricbuzz text like
    //   "...partnership of 67(58) runs..."
    //   "...67-run stand off 58 balls..."
    //   "...the stand is worth 67 runs from 58 balls..."
    //   "...45-ball 67-run stand..."
    const patterns: RegExp[] = [
      /partnership[^0-9]{0,20}(\d{1,3})\s*\(\s*(\d{1,3})\s*\)/i,
      /partnership[^0-9]{0,10}of\s+(\d{1,3})\s+runs?\s+(?:from|off|in)\s+(\d{1,3})\s+balls?/i,
      /(\d{1,3})-run\s+(?:stand|partnership)\s+(?:off|from|in)\s+(\d{1,3})\s+balls?/i,
      /(\d{1,3})\s+runs?\s+(?:from|off|in)\s+(\d{1,3})\s+balls?\s+(?:stand|partnership)/i,
      /stand[^0-9]{0,10}(?:is\s+worth|was\s+worth)?\s*(\d{1,3})\s+runs?\s+(?:from|off)\s+(\d{1,3})\s+balls?/i,
    ];
    for (const re of patterns) {
      const m = text.match(re);
      if (m) {
        out.partnershipRuns = m[1];
        out.partnershipBalls = m[2];
        break;
      }
    }
    return out;
  };

  // Extract incoming batsman name from "new batsman" lines
  const parseNewBatsman = (text: string): string | undefined => {
    const m = text.match(/([A-Z][a-zA-Z'\- ]{1,30})\s+(?:takes guard|walks to the crease|comes to the crease|is the new batter|walks in)/);
    return m ? m[1].trim() : undefined;
  };

  // Extract bowler name from bowler-change lines
  const parseBowlerChange = (text: string): string | undefined => {
    const m = text.match(/([A-Z][a-zA-Z'\- ]{1,30})\s+(?:takes the ball|comes into the attack|will bowl|into the attack|with a new spell)/);
    return m ? m[1].trim() : undefined;
  };

  // Parse \n escape sequences in text to actual line breaks
  const parseText = (text: string) => {
    if (!text) return '';
    return text.replace(/\\n/g, '\n').replace(/\\r/g, '').trim().replace(/^\s+|\s+$/g, '');
  };

  // v1.0.11 — build a crisp outcome prefix from the API's STRUCTURED fields
  // (event / runs / extras). Added to the commentary text ONLY when the
  // text itself does not already state the outcome clearly in its opening
  // ~50 chars. Guarantees every ball shows "1 run. / FOUR! / SIX! / OUT! /
  // Wide." up front even if the commentator went straight into description.
  // 100% sourced from the scoreboard-driven API fields — no text tukkebaazi.
  const buildStructuredPrefix = (item: Commentary): string => {
    const head = (item.english || '').slice(0, 50).toLowerCase();
    const hasOutcome = /\b(no run|1 run|one run|2 runs?|two runs?|3 runs?|three runs?|4 runs?|5 runs?|6 runs?|four|six|out|wide|no ball|no-ball|dot|byes?|leg byes?)\b/.test(head);
    if (hasOutcome) return '';

    if (item.event === 'wicket') return 'OUT! ';
    if (item.event === 'six') return 'SIX! ';
    if (item.event === 'four') return 'FOUR! ';
    if (item.event === 'wide') return 'Wide. ';
    if (item.extras === 'noball') return 'No ball. ';
    if (item.extras === 'legbye') return 'Leg bye. ';
    if (item.extras === 'bye') return 'Bye. ';

    if (typeof item.runs === 'number') {
      if (item.runs === 0) return 'No run. ';
      if (item.runs === 1) return '1 run. ';
      return `${item.runs} runs. `;
    }
    return '';
  };

  // v1.0.11 — trim flowery long commentary (>220 chars) at the nearest
  // sentence boundary so the row stays concise. Only kicks in if the picked
  // version is still too long (should be rare after the medium-version
  // scoring above).
  const trimLongCommentary = (text: string, maxLen: number = 220): string => {
    if (text.length <= maxLen) return text;
    const soft = Math.floor(maxLen * 0.7);
    // Prefer sentence boundary
    for (let i = maxLen; i >= soft; i--) {
      if (text[i] === '.' || text[i] === '!' || text[i] === '?') {
        return text.slice(0, i + 1).trim();
      }
    }
    // Fallback: trim at nearest space, add ellipsis
    const hard = text.lastIndexOf(' ', maxLen);
    const cut = hard > soft ? hard : maxLen;
    return text.slice(0, cut).trim() + '…';
  };

  /**
   * Check if a commentary entry is a stats/record block
   * These are multi-line entries without a ball number
   */
  const isStatsBlock = (item: Commentary): boolean => {
    if (!item.english) return false;
    const text = item.english;
    // Stats blocks typically: no valid ball number, contain multiple lines or record-like content
    const hasMultipleLines = text.includes('\n') || text.includes('\\n');
    const isNonBall = !item.over || item.over === '0' || item.over === '' || !/\d/.test(item.over);
    // Contains patterns like "Successful 200-plus chases", "Most runs in", stats headers
    const hasStatsPattern = /(?:chases|records?|most|highest|lowest|fastest|first time|last \d|scores? vs)/i.test(text);
    return isNonBall && (hasMultipleLines || hasStatsPattern);
  };

  /**
   * Render a stats/record block with bold headers and bullet formatting
   */
  const renderStatsBlock = (text: string) => {
    const lines = parseText(text).split('\n').filter(l => l.trim());
    return (
      <View style={styles.statsBlock}>
        {lines.map((line, i) => {
          const trimmed = line.trim();
          // First line or lines ending with ':' are headers
          const isHeader = i === 0 || trimmed.endsWith(':') || trimmed.endsWith('-');
          // Lines starting with dash or number are list items
          const isListItem = /^[-•]\s/.test(trimmed) || /^\d+[\.\)]\s/.test(trimmed);

          if (isHeader) {
            return (
              <Text key={i} style={styles.statsHeader}>{trimmed}</Text>
            );
          } else if (isListItem) {
            return (
              <Text key={i} style={styles.statsListItem}>{trimmed}</Text>
            );
          } else {
            return (
              <RichCommentaryText key={i} text={trimmed} style={styles.statsText} />
            );
          }
        })}
      </View>
    );
  };

  // === Multi-innings filter + per-ball deduplication ===
  // Cricbuzz API returns multiple commentary versions for the same ball as
  // the commentator enriches text over seconds ("great shot!" → "great shot!
  // Wide yorker outside off..." → "great shot! Wide yorker... to split
  // backward point"). Without dedupe the app shows each version as a
  // separate row → user sees 10.6 appearing 3 times.
  //
  // We also keep only the latest innings so completed matches don't show
  // over numbers from both innings mixed together (RR 19.4 + KKR 19.4).
  //
  // v1.0.11 — additionally drop rows whose `english` is empty / whitespace.
  // These used to render an empty pink wicket card that appeared before the
  // API finished streaming the wicket commentary text (user report).
  //
  // v1.0.11 (user feedback fix) — pick the MEDIUM-length commentary version
  // instead of the longest. Cricbuzz pushes ~3 versions per ball:
  //   v1 (~30-50 chars):  "1 run"
  //   v2 (~80-180 chars): "Bumrah to Kohli, 1 run, pushed to mid-off"
  //   v3 (~250-400 chars): flowery metaphor-heavy enrichment that often
  //                        drops the crisp "1 run / FOUR / SIX" keyword
  // The user wants concise-but-complete info: bowler → batter, runs, shot
  // direction, fielder. v2 delivers exactly that. We score each version
  // and pick the one closest to the ideal length of ~120 chars, with a
  // bonus for the "Bowler to Batter" pattern and clear outcome keyword.
  const displayedCommentary = React.useMemo(() => {
    if (!commentary || commentary.length === 0) return commentary || [];

    // Step 0 — drop rows with no usable text so we never render empty cards
    const nonEmpty = commentary.filter(c => (c.english || '').replace(/\\n|\\r/g, '').trim().length > 0);

    // Step 1 — innings filter (latest only)
    const ids = nonEmpty
      .map(c => (typeof c.inningsId === 'number' ? c.inningsId : undefined))
      .filter((v): v is number => v !== undefined);
    const latestInnings = ids.length > 0 ? Math.max(...ids) : undefined;
    const innings = latestInnings === undefined
      ? nonEmpty
      : nonEmpty.filter(c => c.inningsId === undefined || c.inningsId === latestInnings);

    // Helper — score a commentary version; higher score = better pick.
    const scoreVersion = (text: string): number => {
      const len = text.length;
      if (len === 0) return -Infinity;
      // Ideal length ~120 chars. Score = 1000 - distance from ideal.
      const ideal = 120;
      let score = 1000 - Math.abs(len - ideal);
      // Bonus: "Bowler to Batter" structured lead-in
      if (/^[A-Z][a-zA-Z'\-]+(?: [A-Z][a-zA-Z'\-]+)*\s+to\s+[A-Z][a-zA-Z'\-]+/.test(text)) {
        score += 150;
      }
      // Bonus: crisp outcome keyword within first 60 chars
      const head = text.slice(0, 60).toLowerCase();
      if (/\b(no run|1 run|one run|2 runs?|two runs?|3 runs?|three runs?|four|six|out|wide|no ball|no-ball|dot)\b/.test(head)) {
        score += 80;
      }
      // Penalty: flowery metaphor territory (>250 chars)
      if (len > 250) score -= (len - 250);
      return score;
    };

    // Step 2 — dedupe by (inningsId || 0, over). Keep the BEST-SCORING
    // (≈ medium length + structured) version per ball.
    const byKey = new Map<string, Commentary>();
    for (const c of innings) {
      // Skip rows without a real over number — these are session / stats
      // blocks and should pass through untouched.
      if (!c.over || c.over === '0' || c.over === '' || !/\d/.test(c.over)) {
        byKey.set(`raw-${c.id}`, c);
        continue;
      }
      const key = `${c.inningsId ?? 0}-${c.over}`;
      const existing = byKey.get(key);
      const existingScore = existing ? scoreVersion(existing.english || '') : -Infinity;
      const currentScore = scoreVersion(c.english || '');
      if (currentScore > existingScore) {
        byKey.set(key, c);
      }
    }

    // Preserve original order (API returns newest-first). We iterate `innings`
    // and pick the rep for each unique key only once.
    const seen = new Set<string>();
    const out: Commentary[] = [];
    for (const c of innings) {
      const key = (!c.over || c.over === '0' || c.over === '' || !/\d/.test(c.over))
        ? `raw-${c.id}`
        : `${c.inningsId ?? 0}-${c.over}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const rep = byKey.get(key);
      if (rep) out.push(rep);
    }
    return out;
  }, [commentary]);

  // Track previous over to decide when to inject a Native Advanced ad.
  // User wants the ad to appear at the *start of every over* in the
  // commentary stream.
  //
  // v1.0.11 policy-spacing tweak: we deliberately SKIP the first
  // over-transition ad (the one at the very first visible ball). Reason —
  // the match screen now renders a top NativeAdCard right below the
  // scoreboard + pitch. Showing another native ad on the very first
  // commentary row would violate AdMob's "two ads too close together"
  // policy. By starting over-break ads from the *second* transition
  // onward, we keep at least one full over of content between any two
  // native ads on-screen.
  //
  // We also track `overBreakAdCounter` — purely for debugging/telemetry.
  // v1.0.12 spec change: ALL over-break ads are pinned to **slot 2**
  // which maps to Banner #3 (LARGE_BANNER 320×100) — the dedicated
  // over-break creative. User brief: "Banner 3 ko (300x100) ... Jab sizes
  // alag honge, to Google ads repeat nahi karega." Keeping every
  // over-break on the same unit ID + size means AdMob rotates creatives
  // within that unit naturally (no duplicate creatives on same screen
  // because Banner #1/#2 use different sizes AND different unit IDs).
  let lastOverInt: number | null = null;
  let overBreakAdCounter = 0;
  const shouldShowBannerForItem = (item: Commentary, index: number): boolean => {
    const overStr = item?.over || '';
    const overFloat = parseFloat(overStr);
    if (isNaN(overFloat)) return false;
    const overInt = Math.floor(overFloat);
    // SKIP the very first row — top NativeAdCard is already above the feed.
    if (index === 0 && overInt >= 0) {
      lastOverInt = overInt;
      return false;
    }
    if (lastOverInt === null) {
      lastOverInt = overInt;
      return false;
    }
    if (overInt !== lastOverInt) {
      lastOverInt = overInt;
      return true;
    }
    return false;
  };

  /**
   * Returns slot index for the NEXT over-break ad. v1.0.12: always 2
   * (Banner #3 LARGE_BANNER 320×100). Counter still advances so we can
   * tell from logs how many over-break slots were rendered on a given
   * page load, but every slot uses the same unit ID + size.
   */
  const nextOverBreakSlot = (): number => {
    overBreakAdCounter += 1;
    return 2;
  };

  /**
   * Per-instance stagger delay (ms) for over-break ads.
   * Because every over-break ad on the page uses the SAME unit ID
   * (Banner #3), firing multiple requests back-to-back risks AdMob
   * returning the same creative twice. We give each instance an
   * increasing stagger (starting at slot-2's base 7000ms + 1500ms per
   * subsequent ad) so AdMob has time to rotate creatives.
   */
  const nextOverBreakDelayMs = (): number => {
    // counter was already incremented by nextOverBreakSlot(); subtract
    // 1 so the first over-break uses the base delay.
    const idx = Math.max(0, overBreakAdCounter - 1);
    return 7000 + idx * 1500;
  };

  return (
    <View style={styles.container}>
      {matchStatus === 'upcoming' ? (
        <View style={styles.header}>
          <View style={styles.titleContainer}>
            <Ionicons name="analytics" size={20} color="#FF9800" />
            <Text style={styles.title}>Expert Analysis</Text>
          </View>
        </View>
      ) : (
        <View style={styles.header}>
          <View style={styles.titleContainer}>
            <Ionicons name="chatbubbles" size={20} color="#4CAF50" />
            <Text style={styles.title}>Ball by Ball Commentary</Text>
          </View>
        </View>
      )}

      <ScrollView style={styles.commentaryList} nestedScrollEnabled>
        {/* Upcoming match: show expert analysis */}
        {matchStatus === 'upcoming' && displayedCommentary.length > 0 && (
          <View style={{ padding: 12 }}>
            {displayedCommentary.map((item, idx) => (
              <View key={idx} style={styles.analysisCard}>
                <Ionicons name="newspaper-outline" size={16} color="#FF9800" style={{ marginRight: 8, marginTop: 2 }} />
                <RichCommentaryText text={item.english} style={styles.analysisText} />
              </View>
            ))}
            {/* Single Native ad after the analysis list — rotator slot 1 */}
            <NativeAdCard slotIndex={1} marginVertical={8} />
          </View>
        )}

        {/* No commentary placeholder */}
        {displayedCommentary.length === 0 && (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <Ionicons name="chatbox-outline" size={40} color="#999" />
            <Text style={{ color: '#666', fontSize: 14, marginTop: 10, textAlign: 'center' }}>
              No ball-by-ball commentary available yet.{'\n'}Commentary will appear as the match progresses.
            </Text>
            {/* v1.0.11 — policy safe: only ONE native ad in this empty
                state (was 2 banners sandwiching a button → "two ads too
                close together" AdMob violation risk). */}
            <View style={{ width: '100%' }}>
              <NativeAdCard slotIndex={1} marginVertical={12} />
            </View>
            <TouchableOpacity
              style={styles.externalLinkBtn}
              onPress={() => {
                if (matchId) {
                  Alert.alert('External Link', 'Open live commentary in browser?', [
                    { text: 'No', style: 'cancel' },
                    { text: 'Yes', onPress: () => Linking.openURL(`https://www.cricbuzz.com/live-cricket-scores/${matchId}`) },
                  ]);
                }
              }}
            >
              <Ionicons name="globe-outline" size={20} color="#FFF" />
              <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 14 }}>View Live Commentary</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Ball-by-ball commentary */}
        {matchStatus !== 'upcoming' && displayedCommentary.map((item, index) => {
          // Banner ad shows once per new over (and before the very first ball).
          // The helper updates `lastOverInt` internally, so we call it exactly
          // once per row. Kept outside the early event-card returns so every
          // code path below renders the same banner-placement behaviour.
          const showOverBanner = shouldShowBannerForItem(item, index);
          const isActualDelivery = item.over && item.over !== '0' && item.over !== '' && /\d/.test(item.over);
          const isStats = isStatsBlock(item);
          const eventType = detectEventType(item);

          // ===== Cricbuzz-style EVENT CARD rendering =====
          // v1.0.11 — safety: if wicket row arrives with empty / very short
          // text (Cricbuzz is still streaming commentary), skip the event
          // card on this render pass. An empty pink card showing up for
          // 5-10 seconds before the text lands was the bug users reported.
          const wicketTextReady = !!(item.english && item.english.trim().length > 20);
          if (eventType === 'wicket' && wicketTextReady) {
            const d = parseWicketDetails(item.english || '');
            const imgId = lookupImg(d.player, playerImgMap);
            const overBreakSlot = showOverBanner ? nextOverBreakSlot() : -1;
            const overBreakDelay = showOverBanner ? nextOverBreakDelayMs() : 0;
            return (
              <View key={index}>
                {showOverBanner && (
                  <NativeAdCard slotIndex={overBreakSlot} marginVertical={16} loadDelayMs={overBreakDelay} />
                )}
                <View style={[styles.eventCard, styles.eventCardOut]}>
                  <View style={styles.eventCardHeader}>
                    <Ionicons name="alert-circle" size={18} color="#FFF" />
                    <Text style={styles.eventCardTitle}>OUT · {item.over}</Text>
                  </View>
                  <View style={styles.eventCardBody}>
                    <EventAvatar imageId={imgId} />
                    <View style={styles.eventCardInfo}>
                      <Text style={styles.eventCardName}>{d.player || 'Batsman'}</Text>
                      {(d.runs && d.balls) ? (
                        <Text style={styles.eventCardStats}>
                          {d.runs} runs · {d.balls} balls · SR {((Number(d.runs) / Math.max(1, Number(d.balls))) * 100).toFixed(1)}
                        </Text>
                      ) : null}
                      {(d.partnershipRuns && d.partnershipBalls) ? (
                        <Text style={styles.eventCardPartnership}>
                          Partnership: {d.partnershipRuns} runs ({d.partnershipBalls} balls)
                        </Text>
                      ) : null}
                      {d.dismissal ? (
                        <Text style={styles.eventCardDismissal} numberOfLines={2}>{d.dismissal}</Text>
                      ) : null}
                    </View>
                  </View>
                  <RichCommentaryText
                    text={parseText(item.english || '')}
                    style={styles.eventCardCommentary}
                    isWicketRow
                  />
                </View>
              </View>
            );
          }

          if (eventType === 'new-batsman') {
            const name = parseNewBatsman(item.english || '');
            const imgId = lookupImg(name, playerImgMap);
            const overBreakSlot = showOverBanner ? nextOverBreakSlot() : -1;
            const overBreakDelay = showOverBanner ? nextOverBreakDelayMs() : 0;
            return (
              <View key={index}>
                {showOverBanner && (
                  <NativeAdCard slotIndex={overBreakSlot} marginVertical={16} loadDelayMs={overBreakDelay} />
                )}
                <View style={[styles.eventCard, styles.eventCardNewBatsman]}>
                  <View style={[styles.eventCardHeader, { backgroundColor: '#388E3C' }]}>
                    <Ionicons name="person-add" size={18} color="#FFF" />
                    <Text style={styles.eventCardTitle}>NEW BATSMAN {item.over ? `· ${item.over}` : ''}</Text>
                  </View>
                  <View style={styles.eventCardBody}>
                    <EventAvatar imageId={imgId} />
                    <View style={styles.eventCardInfo}>
                      <Text style={styles.eventCardName}>{name || 'Incoming batsman'}</Text>
                      <Text style={styles.eventCardStatsGreen}>Fresh at the crease</Text>
                    </View>
                  </View>
                  <RichCommentaryText
                    text={parseText(item.english || '')}
                    style={styles.eventCardCommentary}
                  />
                </View>
              </View>
            );
          }

          if (eventType === 'bowler-change') {
            const name = parseBowlerChange(item.english || '');
            const imgId = lookupImg(name, playerImgMap);
            const overBreakSlot = showOverBanner ? nextOverBreakSlot() : -1;
            const overBreakDelay = showOverBanner ? nextOverBreakDelayMs() : 0;
            return (
              <View key={index}>
                {showOverBanner && (
                  <NativeAdCard slotIndex={overBreakSlot} marginVertical={16} loadDelayMs={overBreakDelay} />
                )}
                <View style={[styles.eventCard, styles.eventCardBowler]}>
                  <View style={[styles.eventCardHeader, { backgroundColor: '#1976D2' }]}>
                    <Ionicons name="baseball" size={18} color="#FFF" />
                    <Text style={styles.eventCardTitle}>BOWLING CHANGE {item.over ? `· ${item.over}` : ''}</Text>
                  </View>
                  <View style={styles.eventCardBody}>
                    <EventAvatar imageId={imgId} />
                    <View style={styles.eventCardInfo}>
                      <Text style={styles.eventCardName}>{name || 'New bowler'}</Text>
                      <Text style={styles.eventCardStatsBlue}>Into the attack</Text>
                    </View>
                  </View>
                  <RichCommentaryText
                    text={parseText(item.english || '')}
                    style={styles.eventCardCommentary}
                  />
                </View>
              </View>
            );
          }

          const overBreakSlot = showOverBanner ? nextOverBreakSlot() : -1;
            const overBreakDelay = showOverBanner ? nextOverBreakDelayMs() : 0;
          return (
            <View key={index}>
              {showOverBanner && (
                <NativeAdCard slotIndex={overBreakSlot} marginVertical={16} loadDelayMs={overBreakDelay} />
              )}

              {isStats ? (
                /* Stats/Record block - special formatting */
                <View style={[styles.commentaryItem, styles.statsBlockContainer, { backgroundColor: getAlternatingBg(index) }]}>
                  {renderStatsBlock(item.english)}
                </View>
              ) : (
                /* Regular ball-by-ball commentary */
                <View style={[styles.commentaryItem, { backgroundColor: getAlternatingBg(index) }]}>
                  {isActualDelivery ? (
                    <View style={styles.overBall}>
                      <Text style={styles.overText}>{item.over}</Text>
                    </View>
                  ) : (
                    <View style={styles.overBallPlaceholder} />
                  )}

                  <View style={styles.commentaryContent}>
                    {item.event && item.event !== 'normal' && item.event !== 'wicket' && (
                      <View style={[styles.eventBadge, { backgroundColor: getEventColor(item.event) }]}>
                        <Ionicons name={getEventIcon(item.event) as any} size={12} color="#FFF" />
                        <Text style={styles.eventText}>{getEventLabel(item.event)}</Text>
                      </View>
                    )}
                    {(() => {
                      // v1.0.11 — concise commentary: trim overly long text +
                      // prepend structured outcome prefix from API fields.
                      // Hindi path is used only when the user has toggled
                      // language; we still apply the same prefix/trim pipeline
                      // on either language so the crisp outcome is visible.
                      const raw = parseText(language === 'english' ? item.english : (item.hindi || item.english));
                      const trimmed = trimLongCommentary(raw);
                      const prefix = language === 'english' ? buildStructuredPrefix(item) : '';
                      return (
                        <RichCommentaryText
                          text={`${prefix}${trimmed}`}
                          style={styles.commentaryText}
                        />
                      );
                    })()}
                  </View>

                  {isPro && (
                    <TouchableOpacity
                      style={styles.speakButton}
                      onPress={() => speakCommentary(item.english, index)}
                    >
                      <Ionicons
                        name={speakingIndex === index ? 'stop-circle' : 'play-circle'}
                        size={24}
                        color={speakingIndex === index ? '#FF4444' : '#4CAF50'}
                      />
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          );
        })}

        {/* Load More */}
        {hasMore && onLoadMore ? (
          <View style={styles.actionContainer}>
            <TouchableOpacity
              style={styles.loadMoreButton}
              onPress={onLoadMore}
              disabled={isLoadingMore}
              data-testid="load-more-commentary"
            >
              {isLoadingMore ? (
                <ActivityIndicator size="small" color="#4CAF50" />
              ) : (
                <Ionicons name="chevron-down-outline" size={20} color="#4CAF50" />
              )}
              <Text style={styles.loadMoreText}>
                {isLoadingMore ? 'Loading...' : 'Load More Commentary'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* View Full Details */}
        <View style={styles.actionContainer}>
          <TouchableOpacity
            style={styles.viewFullBtn}
            onPress={handleViewFullDetails}
            data-testid="view-full-details-btn"
          >
            <Ionicons name="globe-outline" size={20} color="#FFF" />
            <Text style={styles.viewFullTxt}>View Full Match Details on Web</Text>
            <Ionicons name="open-outline" size={16} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.infoText}>
            {hasMore
              ? 'Tap "Load More" for older commentary or view full coverage on the web'
              : 'All loaded commentary shown. Tap above for full live coverage on the web'}
          </Text>
        </View>

        <View style={styles.countContainer}>
          <Text style={styles.countText}>
            {displayedCommentary.length} commentary items loaded
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(255, 255, 255, 0.70)',
    borderRadius: 10,
    marginHorizontal: 0,
    marginVertical: 4,
    padding: 4,
    elevation: 3,
    minHeight: 200,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingBottom: 8,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.18)',
  },
  titleContainer: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  title: { fontSize: 16, fontWeight: '700', color: '#333' },
  commentaryList: { flex: 1 },
  commentaryItem: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.15)',
    gap: 10,
    borderRadius: 4,
    marginVertical: 1,
  },
  overBall: { width: 42, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 4 },
  overBallPlaceholder: { width: 42 },
  overText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4CAF50',
    backgroundColor: 'rgba(76, 175, 80, 0.20)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  commentaryContent: { flex: 1 },
  eventBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  eventText: { fontSize: 11, fontWeight: '700', color: '#FFF', letterSpacing: 0.5 },
  commentaryText: { fontSize: 14, lineHeight: 20, color: '#222', marginBottom: 2 },
  speakButton: { padding: 4, justifyContent: 'center' },

  // Stats/Record block styles
  statsBlockContainer: {
    flexDirection: 'column',
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  statsBlock: {
    flex: 1,
  },
  statsHeader: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1B5E20',
    marginBottom: 4,
    marginTop: 6,
    lineHeight: 20,
  },
  statsListItem: {
    fontSize: 13,
    lineHeight: 20,
    color: '#333',
    paddingLeft: 4,
  },
  statsText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#333',
    marginBottom: 2,
  },

  // Banner ads
  bannerAdContainer: {
    minHeight: 80,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
    width: '100%',
  },

  // External link button
  externalLinkBtn: {
    backgroundColor: '#022d5d',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 12,
  },

  // Action containers
  actionContainer: { paddingVertical: 12, alignItems: 'center' },
  loadMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(76, 175, 80, 0.20)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  loadMoreText: { fontSize: 13, fontWeight: '600', color: '#4CAF50' },
  viewFullBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#022d5d',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 24,
    width: '100%',
    justifyContent: 'center',
  },
  viewFullTxt: { fontSize: 13, fontWeight: '700', color: '#FFF' },
  infoText: {
    fontSize: 11,
    color: '#888',
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 10,
    fontStyle: 'italic',
  },
  countContainer: { paddingVertical: 12, alignItems: 'center' },
  countText: { fontSize: 11, color: '#999', fontStyle: 'italic' },
  analysisCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 152, 0, 0.18)',
    borderLeftWidth: 3,
    borderLeftColor: '#FF9800',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  analysisText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 22,
    color: '#333',
    textAlign: 'justify',
  },

  // ============ Event Cards (Cricbuzz-style) ============
  eventCard: {
    marginHorizontal: 0,
    marginVertical: 12,
    borderRadius: 14,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    borderWidth: 1,
    width: '100%',
  },
  eventCardOut: {
    backgroundColor: 'rgba(255, 205, 210, 0.70)',  // Soft red — 60% solid, 40% transparent
    borderColor: 'rgba(255, 82, 82, 0.75)',
  },
  eventCardNewBatsman: {
    backgroundColor: 'rgba(200, 230, 201, 0.70)',  // Pastel green — 60% solid, 40% transparent
    borderColor: 'rgba(76, 175, 80, 0.75)',
  },
  eventCardBowler: {
    backgroundColor: 'rgba(187, 222, 251, 0.70)',  // Light blue — 60% solid, 40% transparent
    borderColor: 'rgba(25, 118, 210, 0.75)',
  },
  eventCardHeader: {
    backgroundColor: '#D32F2F',
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  eventCardTitle: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  eventCardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
  },
  eventCardInfo: {
    flex: 1,
    minWidth: 0,
  },
  eventCardName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1A1A1A',
  },
  eventCardStats: {
    fontSize: 13,
    fontWeight: '700',
    color: '#B71C1C',
    marginTop: 2,
  },
  eventCardPartnership: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6A1B9A',
    marginTop: 2,
  },
  eventCardStatsGreen: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1B5E20',
    marginTop: 2,
  },
  eventCardStatsBlue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0D47A1',
    marginTop: 2,
  },
  eventCardDismissal: {
    fontSize: 12,
    color: '#555',
    marginTop: 4,
    fontStyle: 'italic',
  },
  eventCardCommentary: {
    fontSize: 13,
    lineHeight: 20,
    color: '#222',
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
});

export default CommentarySection;
