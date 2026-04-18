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

// ============ BOLD TEXT FORMATTING ENGINE ============

// Keywords to bold (case-insensitive match, display in uppercase)
const BOLD_KEYWORDS = [
  'FOUR', 'SIX', 'OUT', 'WICKET', 'FIFTY', 'CENTURY', 'HUNDRED',
  'CAUGHT', 'BOWLED', 'LBW', 'STUMPED', 'RUN OUT', 'HIT WICKET',
  'DROPPED', 'NO BALL', 'WIDE', 'FREE HIT', 'DRS', 'NOT OUT',
  'MAIDEN', 'HAT-TRICK', 'DUCK'
];

// Pattern: "PlayerName to PlayerName" - detect bowler-to-batter format
const BOWLER_BATTER_REGEX = /^([A-Z][a-z]+(?: [A-Z][a-z]+)*)\s+to\s+([A-Z][a-z]+(?: [A-Z][a-z]+)*)/;

// Pattern: Player stats like "Virat Kohli 69(38)*" or "50(32)"
const PLAYER_STAT_REGEX = /([A-Z][a-z]+(?: [A-Z][a-z]+)+)\s+(\d+\*?\(\d+\)\*?)/g;

// Pattern: Score stats like "69(38)*", "50(32)", "3/24"
const SCORE_STAT_REGEX = /\b(\d+\*?\(\d+\)\*?)\b/g;

// Pattern: Bowling figures like "[3.0-0-18-4]"
const BOWLING_FIGURES_REGEX = /\[[\d.]+-\d+-\d+-\d+\]/g;

// Pattern: Stats headers - lines that look like record titles
const STAT_HEADER_REGEX = /^((?:[A-Z][a-zA-Z']*\s+){1,6}(?:in|for|vs|at|of|against)\s+.+):?\s*$/m;

// Pattern: Speaker name for quotes (e.g., "Virat Kohli:" at start of line)
const SPEAKER_REGEX = /^([A-Z][a-z]+(?: [A-Z][a-z]+)+):\s*/;

/**
 * Parse commentary text into rich segments for rendering
 * Returns array of { text, bold, color? } segments
 */
function parseRichText(text: string): Array<{ text: string; bold: boolean; color?: string }> {
  if (!text) return [];

  const segments: Array<{ text: string; bold: boolean; color?: string }> = [];
  let remaining = text;

  // Check for speaker pattern (post-match quotes)
  const speakerMatch = remaining.match(SPEAKER_REGEX);
  if (speakerMatch) {
    segments.push({ text: speakerMatch[1] + ':', bold: true, color: '#1565C0' });
    remaining = remaining.slice(speakerMatch[0].length);
    if (remaining.startsWith(' ')) remaining = remaining.slice(1);
  }

  // Check for bowler-to-batter pattern at start
  const btbMatch = remaining.match(BOWLER_BATTER_REGEX);
  if (btbMatch && !speakerMatch) {
    segments.push({ text: btbMatch[1], bold: true }); // Bowler name bold
    segments.push({ text: ' to ', bold: false });
    segments.push({ text: btbMatch[2], bold: true }); // Batter name bold
    remaining = remaining.slice(btbMatch[0].length);
    // Check for comma + result after names
    const afterNames = remaining.match(/^,\s*/);
    if (afterNames) {
      segments.push({ text: ', ', bold: false });
      remaining = remaining.slice(afterNames[0].length);
    }
  }

  // Process remaining text for bold keywords
  if (remaining.length > 0) {
    // Build regex for all bold keywords
    const keywordPattern = BOLD_KEYWORDS.map(k => k.replace(/\s+/g, '\\s+')).join('|');
    const keywordRegex = new RegExp(`\\b(${keywordPattern})\\b`, 'gi');

    let lastIndex = 0;
    let match;

    while ((match = keywordRegex.exec(remaining)) !== null) {
      // Add text before the keyword
      if (match.index > lastIndex) {
        segments.push({ text: remaining.slice(lastIndex, match.index), bold: false });
      }

      // Determine color for the keyword
      const kw = match[1].toUpperCase();
      let color: string | undefined;
      if (kw === 'FOUR') color = '#4CAF50';
      else if (kw === 'SIX') color = '#9C27B0';
      else if (['OUT', 'WICKET', 'CAUGHT', 'BOWLED', 'LBW', 'STUMPED', 'RUN OUT', 'HIT WICKET'].includes(kw)) color = '#FF4444';
      else if (['FIFTY', 'CENTURY', 'HUNDRED'].includes(kw)) color = '#FF9800';
      else if (kw === 'DROPPED') color = '#FF6B00';

      segments.push({ text: match[1].toUpperCase(), bold: true, color });
      lastIndex = match.index + match[1].length;
    }

    // Add remaining text after last keyword
    if (lastIndex < remaining.length) {
      const tail = remaining.slice(lastIndex);
      // Check for bowling figures
      const bowlMatch = tail.match(BOWLING_FIGURES_REGEX);
      if (bowlMatch) {
        let tailRemaining = tail;
        for (const bm of bowlMatch) {
          const idx = tailRemaining.indexOf(bm);
          if (idx > 0) {
            segments.push({ text: tailRemaining.slice(0, idx), bold: false });
          }
          segments.push({ text: bm, bold: true, color: '#1565C0' });
          tailRemaining = tailRemaining.slice(idx + bm.length);
        }
        if (tailRemaining) segments.push({ text: tailRemaining, bold: false });
      } else {
        segments.push({ text: tail, bold: false });
      }
    }
  }

  return segments.length > 0 ? segments : [{ text, bold: false }];
}

/**
 * Render rich text with bold formatting
 */
function RichCommentaryText({ text, style }: { text: string; style?: any }) {
  const segments = parseRichText(text);

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
  const { BannerAdComponent } = useAdMob();

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
    const colors = [
      '#FFF9C4',  // Pastel yellow
      '#C8E6C9',  // Pastel green
    ];
    return colors[index % 2];
  };

  // Detect special visual events from commentary text.
  // Returns a category or null; drives Cricbuzz-style event cards.
  const detectEventType = (item: Commentary): 'wicket' | 'new-batsman' | 'bowler-change' | null => {
    if (item.event === 'wicket') return 'wicket';
    const t = (item.english || '').toLowerCase();
    // Explicit wicket phrases in case event flag missing
    if (/\b(out|wkt|bowled|lbw|caught|stumped|run out|hit wicket)\b/.test(t) && /\(\d+\)/.test(t) && item.over && /\d/.test(item.over)) {
      // Heuristic: looks like a dismissal line with score pattern
      if (t.includes('out') || t.includes('wkt')) return 'wicket';
    }
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

  const displayedCommentary = commentary;

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
            <View style={styles.bannerAdContainer}>
              <BannerAdComponent />
            </View>
          </View>
        )}

        {/* No commentary placeholder */}
        {displayedCommentary.length === 0 && (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <Ionicons name="chatbox-outline" size={40} color="#999" />
            <Text style={{ color: '#666', fontSize: 14, marginTop: 10, textAlign: 'center' }}>
              No ball-by-ball commentary available yet.{'\n'}Commentary will appear as the match progresses.
            </Text>
            <View style={styles.bannerAdContainer}>
              <BannerAdComponent />
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
            <View style={styles.bannerAdContainer}>
              <BannerAdComponent />
            </View>
          </View>
        )}

        {/* Ball-by-ball commentary */}
        {matchStatus !== 'upcoming' && displayedCommentary.map((item, index) => {
          const showBannerBefore = index === 0;
          const showBannerEvery6 = index > 0 && index % 6 === 0;
          const isActualDelivery = item.over && item.over !== '0' && item.over !== '' && /\d/.test(item.over);
          const isStats = isStatsBlock(item);
          const eventType = detectEventType(item);

          // ===== Cricbuzz-style EVENT CARD rendering =====
          if (eventType === 'wicket') {
            const d = parseWicketDetails(item.english || '');
            const imgId = lookupImg(d.player, playerImgMap);
            return (
              <View key={index}>
                {showBannerEvery6 && BannerAdComponent && (
                  <View style={styles.bannerAdContainer}><BannerAdComponent /></View>
                )}
                {showBannerBefore && BannerAdComponent && (
                  <View style={styles.bannerAdContainer}><BannerAdComponent /></View>
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
                  />
                </View>
              </View>
            );
          }

          if (eventType === 'new-batsman') {
            const name = parseNewBatsman(item.english || '');
            const imgId = lookupImg(name, playerImgMap);
            return (
              <View key={index}>
                {showBannerEvery6 && BannerAdComponent && (
                  <View style={styles.bannerAdContainer}><BannerAdComponent /></View>
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
            return (
              <View key={index}>
                {showBannerEvery6 && BannerAdComponent && (
                  <View style={styles.bannerAdContainer}><BannerAdComponent /></View>
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

          return (
            <View key={index}>
              {showBannerEvery6 && BannerAdComponent && (
                <View style={styles.bannerAdContainer}>
                  <BannerAdComponent />
                </View>
              )}

              {showBannerBefore && BannerAdComponent && (
                <View style={styles.bannerAdContainer}>
                  <BannerAdComponent />
                </View>
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
                    <RichCommentaryText
                      text={parseText(language === 'english' ? item.english : (item.hindi || item.english))}
                      style={styles.commentaryText}
                    />
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
    backgroundColor: 'rgba(255, 255, 255, 0.30)',
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
    borderBottomColor: 'rgba(0, 0, 0, 0.08)',
  },
  titleContainer: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  title: { fontSize: 16, fontWeight: '700', color: '#333' },
  commentaryList: { flex: 1 },
  commentaryItem: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
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
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
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
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
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
    backgroundColor: 'rgba(255, 152, 0, 0.08)',
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
    backgroundColor: 'rgba(255, 205, 210, 0.30)',  // Soft red — 60% solid, 40% transparent
    borderColor: 'rgba(255, 82, 82, 0.50)',
  },
  eventCardNewBatsman: {
    backgroundColor: 'rgba(200, 230, 201, 0.30)',  // Pastel green — 60% solid, 40% transparent
    borderColor: 'rgba(76, 175, 80, 0.50)',
  },
  eventCardBowler: {
    backgroundColor: 'rgba(187, 222, 251, 0.30)',  // Light blue — 60% solid, 40% transparent
    borderColor: 'rgba(25, 118, 210, 0.50)',
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
