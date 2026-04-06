import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Dimensions, Modal, Alert, Linking, Platform, ImageBackground, AppState
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { fetchMatchById, openExternalScorecard } from '../../src/services/api';
import { Match } from '../../src/types/match';
import ErrorScreen from '../../src/components/ErrorScreen';
import LiveIndicator, { MatchStatusBadge } from '../../src/components/LiveIndicator';
import CricketField from '../../src/components/CricketField';
import CommentarySection from '../../src/components/CommentarySection';
import FloatingScoreboard from '../../src/components/FloatingScoreboard';
import MatchMoodMeter from '../../src/components/MatchMoodMeter';
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

const AUTO_REFRESH = 60000; // 60 seconds refresh
const MATCH_CACHE_FLUSH = 1800000; // 30 minutes

// Format over summary with wickets in RED, 6 in Purple, 4 in Green
const formatOverSummary = (summary: string, currentOver?: number): React.ReactNode[] => {
  const elements: React.ReactNode[] = [];
  
  // Parse the summary - can be like "1 4 W 0 2 6" or "1|4|W|0|2|6" or comma separated
  const balls = summary.split(/[\s|,]+/).filter(b => b.trim());
  
  let ballCount = 0;
  
  balls.forEach((ball, idx) => {
    const b = ball.trim().toUpperCase();
    if (!b) return;
    
    // Check if it's a new over marker text - skip it
    if (b.includes('OVER') || b === '|') {
      return;
    }
    
    // Add simple pipe separator every 6 balls
    if (ballCount > 0 && ballCount % 6 === 0) {
      elements.push(
        <Text key={`sep-${idx}`} style={{ color: '#4CAF50', marginHorizontal: 8, fontWeight: 'bold', fontSize: 20 }}>
          |
        </Text>
      );
    }
    
    // Style based on ball type - BIGGER SIZE
    let style: any = { marginHorizontal: 5, fontSize: 18, fontWeight: '700' };
    
    if (b === 'W' || b === 'WKT' || b === 'WICKET') {
      // Wicket - RED and BOLD
      style = { ...style, color: '#FF0000', fontWeight: 'bold', fontSize: 20 };
    } else if (b === '6') {
      // SIX - Purple Bold
      style = { ...style, color: '#9C27B0', fontWeight: 'bold', fontSize: 20 };
    } else if (b === '4') {
      // FOUR - Green Bold
      style = { ...style, color: '#00E676', fontWeight: 'bold', fontSize: 20 };
    } else if (b === 'WD' || b === 'WIDE') {
      // Wide - Orange
      style = { ...style, color: '#FF9800', fontSize: 16 };
    } else if (b === 'NB' || b === 'NOBALL') {
      // No Ball - Orange
      style = { ...style, color: '#FF9800', fontSize: 16 };
    } else if (b === '0' || b === '.' || b === '•') {
      // Dot ball - Grey
      style = { ...style, color: '#888' };
    } else {
      // Other runs (1, 2, 3) - White
      style = { ...style, color: '#FFF' };
    }
    
    elements.push(
      <Text key={`ball-${idx}`} style={style}>
        {b === '.' || b === '•' ? '0' : b}
      </Text>
    );
    
    ballCount++;
  });
  
  return elements;
};

export default function MatchDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isPro: globalIsPro, setProFromAdMob } = usePro();
  const { trackClick, showRewardedAd, showInterstitialAd, isRewardedAdReady, BannerAdComponent } = useAdMob();
  const { isTracking, toggleTracking, notificationsEnabled, enableNotifications } = useNotifications();

  const [match, setMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [showOverlay, setShowOverlay] = useState(false);

  // Mood event for emotional animations
  const [moodEvent, setMoodEvent] = useState<'wicket' | 'four' | 'six' | 'dot' | 'wide' | 'normal' | null>(null);
  const prevCommRef = useRef<string | null>(null);

  // Pro unlock states
  const [tempPro, setTempPro] = useState(false);
  const [proExpiry, setProExpiry] = useState<number | null>(null);
  const [adsWatchedCount, setAdsWatchedCount] = useState(0);
  const [showProModal, setShowProModal] = useState(false);

  // Native floating widget states
  const [nativeOverlayActive, setNativeOverlayActive] = useState(false);
  const [hasOverlayPermission, setHasOverlayPermission] = useState(false);

  // Click counter for interstitial (Logic B)
  const [clicks, setClicks] = useState(0);
  const [clickTarget] = useState(Math.floor(Math.random() * 6) + 10);

  const effectiveIsPro = globalIsPro || tempPro;

  // Check overlay permission on mount
  useEffect(() => {
    if (isFloatingWidgetAvailable()) {
      checkOverlayPermission().then(setHasOverlayPermission);
    }
  }, []);

  // Update native floating widget when score changes (for Pro users with active overlay)
  useEffect(() => {
    if (nativeOverlayActive && effectiveIsPro && match) {
      // Get latest commentary for voice
      const latestCommentary = match.commentary && match.commentary.length > 0 
        ? match.commentary[0].english 
        : '';
      
      const scoreData = {
        team1Name: match.teams[0]?.shortName || 'TM1',
        team2Name: match.teams[1]?.shortName || 'TM2',
        team1Score: match.teams[0]?.runs !== undefined 
          ? `${match.teams[0].runs}/${match.teams[0].wickets || 0}` 
          : '-',
        team2Score: match.teams[1]?.runs !== undefined 
          ? `${match.teams[1].runs}/${match.teams[1].wickets || 0}` 
          : '-',
        team1Overs: match.teams[0]?.overs?.toString() || '',
        team2Overs: match.teams[1]?.overs?.toString() || '',
        statusText: match.statusText || '',
        batsmanName: '',
        bowlerName: '',
        commentary: latestCommentary, // Send commentary for TTS
      };
      updateFloatingWidget(scoreData);
    }
  }, [match?.teams[0]?.runs, match?.teams[1]?.runs, match?.commentary?.[0]?.english, nativeOverlayActive, effectiveIsPro]);

  // 30-Min Pro Expiry (Logic D)
  useEffect(() => {
    if (!tempPro || !proExpiry) return;
    const interval = setInterval(() => {
      if (Date.now() >= proExpiry) {
        setTempPro(false);
        setProExpiry(null);
        setProFromAdMob(false);
        Alert.alert('Pro Expired', 'Watch 3 ads again to unlock Pro!');
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
    
    // 60-second refresh with state cleanup
    refreshIntervalRef.current = setInterval(() => {
      // Clear previous match state before update to prevent memory bloat
      setMatch(prevMatch => {
        if (prevMatch) {
          // Keep minimal data, clear commentary cache
          return { ...prevMatch, commentary: [] };
        }
        return prevMatch;
      });
      loadMatch();
    }, AUTO_REFRESH);

    // 30-minute absolute cache flush
    cacheFlushIntervalRef.current = setInterval(() => {
      console.log('[Memory] Match page - 30 min cache flush');
      setMatch(null);
      loadMatch();
    }, MATCH_CACHE_FLUSH);

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
      Speech.stop();
      // Stop native overlay when leaving the page
      if (nativeOverlayActive) {
        hideFloatingWidget();
      }
    };
  }, [id]);

  const loadMatch = useCallback(async () => {
    if (!id) return;
    try {
      const data = await fetchMatchById(id);
      if (data) {
        // Detect new events for mood animations
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

  // Logic B: Interstitial on random clicks
  const handleInteraction = () => {
    if (effectiveIsPro) return;
    const next = clicks + 1;
    if (next >= clickTarget) {
      showInterstitialAd();
      setClicks(0);
    } else {
      setClicks(next);
    }
  };

  // Logic C: Watch 3 Rewarded Ads for Pro - FIXED: proper count tracking
  const handleWatchAd = async () => {
    const success = await showRewardedAd();
    if (success) {
      const newCount = adsWatchedCount + 1;
      setAdsWatchedCount(newCount);

      if (newCount >= 3) {
        // All 3 ads watched - unlock Pro!
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
      } else {
        Alert.alert(
          'Ad Watched!',
          `${newCount}/3 ads done. ${3 - newCount} more to unlock Pro!`,
          [{ text: 'Continue' }]
        );
      }
    }
  };

  if (loading) {
    return (
      <ImageBackground
        source={require('../../assets/images/wallpaper.png')}
        style={styles.container}
        resizeMode="cover"
      >
        <View style={styles.center}>
          <ActivityIndicator color="#4CAF50" size="large" />
          <Text style={styles.loadingText}>Loading match...</Text>
        </View>
      </ImageBackground>
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
    <ImageBackground
      source={require('../../assets/images/wallpaper.png')}
      style={styles.container}
      resizeMode="cover"
    >
      <SafeAreaView style={styles.container} onTouchStart={handleInteraction}>
        {/* Emotional animations overlay - 4, 6, Out, Wide */}
        <MatchMoodMeter event={moodEvent} />

      <ScrollView stickyHeaderIndices={[0]}>
        {/* Sticky Score Header */}
        <View style={styles.scoreHeader}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={22} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.seriesName} numberOfLines={1}>{match.seriesName}</Text>
            
            {/* Unlock Button - Compact in header */}
            {!effectiveIsPro && (
              <TouchableOpacity style={styles.unlockBtnHeader} onPress={() => setShowProModal(true)}>
                <Ionicons name="lock-open" size={11} color="#FFD700" />
                <Text style={styles.unlockTxtHeader}>Unlock</Text>
              </TouchableOpacity>
            )}
            
            <View style={styles.headerActions}>
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
                  size={18}
                  color={isTracking(id || '') ? '#4CAF50' : '#AAA'}
                />
              </TouchableOpacity>

              {/* External Link */}
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: 'rgba(255,165,0,0.15)' }]}
                onPress={() => openExternalScorecard(id || '')}
              >
                <Ionicons name="open-outline" size={16} color="#FFA500" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Score Row - Compact */}
          <View style={styles.teamRow}>
            <View style={styles.teamBlock}>
              <Text style={styles.teamName}>{match.teams[0].shortName}</Text>
              <Text style={styles.teamScore}>
                {match.teams[0].runs !== undefined ? `${match.teams[0].runs}/${match.teams[0].wickets || 0}` : '-'}
              </Text>
              {match.teams[0].overs !== undefined && <Text style={styles.overs}>({match.teams[0].overs} ov)</Text>}
            </View>

            <MatchStatusBadge state={match.status} isLive={match.status === 'live'} />

            <View style={styles.teamBlock}>
              <Text style={styles.teamName}>{match.teams[1].shortName}</Text>
              <Text style={styles.teamScore}>
                {match.teams[1].runs !== undefined ? `${match.teams[1].runs}/${match.teams[1].wickets || 0}` : '-'}
              </Text>
              {match.teams[1].overs !== undefined && <Text style={styles.overs}>({match.teams[1].overs} ov)</Text>}
            </View>
          </View>

          {match.statusText ? <Text style={styles.statusTxt} numberOfLines={2}>{match.statusText}</Text> : null}

          {/* Match Details: Current Batsmen - For LIVE and RECENT */}
          {(match.status === 'live' || match.status === 'recent') && match.batsmen && match.batsmen.length > 0 && (
            <View style={styles.batsmenContainer}>
              <Text style={styles.batsmenTitle}>{match.status === 'live' ? 'At The Crease' : 'Last Batsmen'}</Text>
              <View style={styles.batsmenRow}>
                {match.batsmen.map((bat, idx) => (
                  <View key={idx} style={styles.batsmanItem}>
                    <Text style={[styles.batsmanName, bat.isStriker && styles.strikerName]}>
                      {bat.isStriker ? '* ' : ''}{bat.name}
                    </Text>
                    <Text style={styles.batsmanScore}>
                      {bat.runs} ({bat.balls})
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* OVER SUMMARY - For LIVE and RECENT */}
          {(match.status === 'live' || match.status === 'recent') && match.oSummary && (
            <View style={styles.overSummaryContainer}>
              <Text style={styles.overSummaryTitle}>Recent Overs</Text>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={true}
                style={styles.overSummaryScroll}
                contentContainerStyle={styles.overSummaryScrollContent}
              >
                {formatOverSummary(match.oSummary, match.currentOver)}
              </ScrollView>
            </View>
          )}

          {/* Pro Overlay Toggles - Only show for Pro users */}
          {effectiveIsPro && (
            <View style={styles.proRow}>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                {/* In-App Floating Scoreboard Toggle */}
                <TouchableOpacity
                  style={[styles.unlockBtn, { backgroundColor: showOverlay ? '#4CAF50' : '#666' }]}
                  onPress={() => setShowOverlay(!showOverlay)}
                >
                  <Ionicons name={showOverlay ? 'eye' : 'eye-off'} size={14} color="#FFF" />
                  <Text style={styles.unlockTxt}>{showOverlay ? 'In-App ON' : 'In-App OFF'}</Text>
                </TouchableOpacity>
                
                {/* Native Overlay (Draw Over Other Apps) - Android Only */}
                {isFloatingWidgetAvailable() && (
                  <TouchableOpacity
                    style={[styles.unlockBtn, { backgroundColor: nativeOverlayActive ? '#FF6B00' : '#333' }]}
                    onPress={async () => {
                      if (nativeOverlayActive) {
                        // Turn off native overlay
                        await hideFloatingWidget();
                        setNativeOverlayActive(false);
                      } else {
                        // Check permission first
                        const hasPermission = await checkOverlayPermission();
                        if (!hasPermission) {
                          Alert.alert(
                            'Enable Overlay Permission',
                            'To show live score over other apps (like WhatsApp, YouTube), you need to enable "Display over other apps" permission.\n\nTap "Enable" to open settings.',
                            [
                              { text: 'Cancel', style: 'cancel' },
                              {
                                text: 'Enable',
                                onPress: async () => {
                                  await requestOverlayPermission();
                                  // Check again after a delay
                                  setTimeout(async () => {
                                    const granted = await checkOverlayPermission();
                                    setHasOverlayPermission(granted);
                                  }, 1000);
                                },
                              },
                            ]
                          );
                          return;
                        }
                        
                        // Start native overlay
                        const scoreData = {
                          team1Name: match.teams[0]?.shortName || 'TM1',
                          team2Name: match.teams[1]?.shortName || 'TM2',
                          team1Score: match.teams[0]?.runs !== undefined 
                            ? `${match.teams[0].runs}/${match.teams[0].wickets || 0}` 
                            : '-',
                          team2Score: match.teams[1]?.runs !== undefined 
                            ? `${match.teams[1].runs}/${match.teams[1].wickets || 0}` 
                            : '-',
                          team1Overs: match.teams[0]?.overs?.toString() || '',
                          team2Overs: match.teams[1]?.overs?.toString() || '',
                          statusText: match.statusText || '',
                        };
                        
                        const success = await showFloatingWidget(scoreData);
                        if (success) {
                          setNativeOverlayActive(true);
                          Alert.alert(
                            'Floating Widget Active!',
                            'Live score will now show over other apps. You can minimize CricApp and the score will still be visible!\n\n• Tap widget to minimize\n• Drag to move\n• Tap ✕ to close',
                            [{ text: 'Got it!' }]
                          );
                        }
                      }
                    }}
                    data-testid="native-overlay-toggle"
                  >
                    <Ionicons 
                      name={nativeOverlayActive ? 'layers' : 'layers-outline'} 
                      size={14} 
                      color="#FFF" 
                    />
                    <Text style={styles.unlockTxt}>
                      {nativeOverlayActive ? 'Overlay ON' : 'Overlay OFF'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        </View>

        {/* Cricket Field */}
        <CricketField
          lastCommentary={match.commentary?.[0]}
          battingTeam={match.teams[0].shortName}
          bowlingTeam={match.teams[1].shortName}
        />

        {/* Commentary - with error boundary */}
        {match.commentary && match.commentary.length > 0 ? (
          <React.Suspense fallback={<View style={styles.noComm}><ActivityIndicator color="#4CAF50" /></View>}>
            <CommentarySection
              commentary={match.commentary}
              matchId={id}
              isLive={match.status === 'live'}
              matchStatus={match.status as 'live' | 'recent' | 'upcoming'}
            />
          </React.Suspense>
        ) : (
          <View style={styles.noComm}>
            <Ionicons name="chatbox-outline" size={40} color="#999" />
            <Text style={styles.noCommText}>
              {match.status === 'upcoming' ? 'Match has not started yet' : 'Commentary not available'}
            </Text>

            {/* Banner Ad 1 */}
            <View style={{ marginVertical: 10, alignItems: 'center', width: '100%' }}>
              <BannerAdComponent />
            </View>

            <TouchableOpacity style={styles.externalBtn} onPress={() => openExternalScorecard(id || '')}>
              <Ionicons name="open-outline" size={16} color="#FFF" />
              <Text style={styles.externalTxt}>View Full Scorecard</Text>
            </TouchableOpacity>

            {/* Banner Ad 2 */}
            <View style={{ marginVertical: 10, alignItems: 'center', width: '100%' }}>
              <BannerAdComponent />
            </View>
          </View>
        )}
      </ScrollView>

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

            {/* Progress Bar */}
            <View style={styles.progressWrap}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${(adsWatchedCount / 3) * 100}%` }]} />
              </View>
              <Text style={styles.progressLabel}>{adsWatchedCount}/3 Ads Watched</Text>
            </View>

            <TouchableOpacity
              style={[styles.watchBtn, !isRewardedAdReady && styles.watchBtnDisabled]}
              onPress={handleWatchAd}
            >
              <Ionicons name="play-circle" size={22} color="#FFF" />
              <Text style={styles.watchBtnTxt}>
                {isRewardedAdReady
                  ? `Watch Ad ${adsWatchedCount + 1} of 3`
                  : 'Loading Ad...'}
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
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'transparent' },
  loadingText: { color: '#999', marginTop: 12, fontSize: 14 },
  scoreHeader: { backgroundColor: 'rgba(34,34,34,0.85)', padding: 14, borderBottomWidth: 2, borderBottomColor: '#4CAF50' },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  backBtn: { padding: 6, marginRight: 8 },
  seriesName: { color: '#ffd700', fontSize: 12, flex: 1 },
  headerActions: { flexDirection: 'row', gap: 8 },
  unlockBtnHeader: {
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.5)',
    marginRight: 8,
  },
  unlockTxtHeader: { 
    color: '#FFD700', 
    fontWeight: 'bold', 
    fontSize: 10,
  },
  actionBtn: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  actionBtnActive: { backgroundColor: 'rgba(76,175,80,0.2)' },
  teamRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', marginBottom: 8 },
  teamBlock: { alignItems: 'center', flex: 1 },
  teamName: { color: '#CCC', fontSize: 13, fontWeight: '600' },
  teamScore: { color: '#FFF', fontSize: 22, fontWeight: 'bold' },
  overs: { color: '#999', fontSize: 11, marginTop: 2 },
  statusTxt: { color: '#4CAF50', fontSize: 12, textAlign: 'center', marginBottom: 6, fontStyle: 'italic' },
  // Live match batsmen section
  batsmenContainer: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  batsmenTitle: {
    color: '#4CAF50',
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  batsmenRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  batsmanItem: {
    alignItems: 'center',
    flex: 1,
  },
  batsmanName: {
    color: '#CCC',
    fontSize: 12,
  },
  strikerName: {
    color: '#FFD700',
    fontWeight: 'bold',
  },
  batsmanScore: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: 'bold',
    marginTop: 2,
  },
  // Over summary section - BIGGER & PROMINENT
  overSummaryContainer: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.4)',
  },
  overSummaryTitle: {
    color: '#4CAF50',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  overSummaryScroll: {
    minHeight: 40,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  overSummaryScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 20,
    gap: 2,
  },
  proRow: { alignItems: 'center', marginTop: 6 },
  unlockBtn: {
    backgroundColor: 'rgba(51,51,51,0.9)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  unlockTxt: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },
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
  watchBtnDisabled: { backgroundColor: '#999' },
  watchBtnTxt: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  laterTxt: { marginTop: 8, color: '#999', fontSize: 14 },
});
