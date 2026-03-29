import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Dimensions, Modal, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { fetchMatchById, openCricbuzzMatch } from '../../src/services/api';
import { Match, Commentary } from '../../src/types/match';
import ErrorScreen from '../../src/components/ErrorScreen';
import LiveIndicator from '../../src/components/LiveIndicator';
import CricketField from '../../src/components/CricketField';
import CommentarySection from '../../src/components/CommentarySection';
import FloatingScoreboard from '../../src/components/FloatingScoreboard';
import MatchMoodMeter from '../../src/components/MatchMoodMeter';
import { usePro } from '../../src/context/ProContext';
import { useAdMob } from '../../src/context/AdMobContext';
import { useNotifications } from '../../src/context/NotificationContext';

const AUTO_REFRESH_INTERVAL = 45000;
const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function MatchDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isPro: globalIsPro, setProFromAdMob, adsWatched, watchAd } = usePro();
  const { trackClick, showRewardedAd, showInterstitialAd, BannerAdComponent } = useAdMob();
  const { isTracking, toggleTracking, notificationsEnabled, enableNotifications } = useNotifications();

  const [match, setMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [showFloatingScoreboard, setShowFloatingScoreboard] = useState(false);

  // Match Mood Meter state - tracks latest event for visual effects
  const [moodEvent, setMoodEvent] = useState<'wicket' | 'four' | 'six' | 'dot' | 'wide' | 'normal' | null>(null);
  const prevCommentaryRef = useRef<string | null>(null);

  // Logic C & D: Pro & Timer States (local temp + global)
  const [tempProActive, setTempProActive] = useState(false);
  const [proExpiryTime, setProExpiryTime] = useState<number | null>(null);
  const [localAdsWatched, setLocalAdsWatched] = useState(0);
  const [showProModal, setShowProModal] = useState(false);

  // Logic B: Click Counter
  const [clickCount, setClickCount] = useState(0);
  const [targetClicks] = useState(Math.floor(Math.random() * 6) + 10);

  const effectiveIsPro = globalIsPro || tempProActive;
  const scrollViewRef = useRef<ScrollView>(null);

  // 30-Min Expiry Logic (Logic D)
  useEffect(() => {
    if (tempProActive && proExpiryTime) {
      const interval = setInterval(() => {
        if (Date.now() >= proExpiryTime) {
          setTempProActive(false);
          setProExpiryTime(null);
          setProFromAdMob(false);
          Alert.alert('Attention', 'Pro access expired. Watch 3 ads to restart.');
        }
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [tempProActive, proExpiryTime]);

  useEffect(() => {
    loadMatch();
    const interval = setInterval(loadMatch, AUTO_REFRESH_INTERVAL);
    return () => {
      clearInterval(interval);
      Speech.stop();
    };
  }, [id]);

  const loadMatch = async () => {
    if (!id) return;
    try {
      const data = await fetchMatchById(id);
      if (data) {
        // Detect new event for mood meter & emotional animations
        if (data.commentary && data.commentary.length > 0) {
          const latestComm = data.commentary[0];
          const latestId = latestComm.id || `${latestComm.over}-${latestComm.english?.substring(0, 20)}`;
          if (prevCommentaryRef.current && prevCommentaryRef.current !== latestId) {
            // New ball detected - trigger mood/animation effect
            const eventType = latestComm.event || 'normal';
            setMoodEvent(eventType);
            setTimeout(() => setMoodEvent(null), 3000);
          }
          prevCommentaryRef.current = latestId;
        }
        setMatch(data);
        setError(false);
        setRetryCount(0);
      } else {
        if (retryCount < 2) {
          setRetryCount(prev => prev + 1);
          // Auto-retry with a delay
          setTimeout(loadMatch, 3000);
        } else {
          setError(true);
        }
      }
    } catch (err) {
      if (retryCount < 2) {
        setRetryCount(prev => prev + 1);
        setTimeout(loadMatch, 3000);
      } else {
        setError(true);
      }
    } finally {
      setLoading(false);
    }
  };

  // Logic B: Interstitial Trigger
  const handleInteraction = () => {
    if (effectiveIsPro) return;
    const next = clickCount + 1;
    if (next >= targetClicks) {
      showInterstitialAd();
      setClickCount(0);
    } else {
      setClickCount(next);
    }
  };

  // Logic C: Watch 3 Ads for Pro
  const watchAdsForPro = async () => {
    const success = await showRewardedAd();
    if (success) {
      const current = localAdsWatched + 1;
      setLocalAdsWatched(current);
      if (current >= 3) {
        setTempProActive(true);
        setProExpiryTime(Date.now() + 30 * 60 * 1000);
        setLocalAdsWatched(0);
        setShowProModal(false);
        setProFromAdMob(true);
        Alert.alert('Pro Unlocked!', 'Voice Commentary, Floating Scoreboard and Ad-free browsing active for 30 minutes!');
      } else {
        Alert.alert('Keep going!', `Watched ${current}/3 ads. ${3 - current} more to unlock Pro!`);
      }
    }
  };

  if (loading)
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#4CAF50" size="large" />
        <Text style={styles.loadingText}>Loading match data...</Text>
      </View>
    );
  if (error || !match) return <ErrorScreen onGoBack={() => router.back()} onRetry={() => { setError(false); setLoading(true); setRetryCount(0); loadMatch(); }} message="Could not load match. Check your connection." />;

  return (
    <SafeAreaView style={styles.container} onTouchStart={handleInteraction}>
      {/* Match Mood Meter - visual effects overlay for 4, 6, Out, Wide */}
      <MatchMoodMeter event={moodEvent} />
      
      <ScrollView stickyHeaderIndices={[0]} ref={scrollViewRef}>
        <View style={styles.scoreHeader}>
          <View style={styles.headerTopRow}>
            <Text style={styles.seriesName} numberOfLines={1}>{match.seriesName}</Text>
            <View style={styles.headerActions}>
              {/* Notification Toggle */}
              <TouchableOpacity
                style={[styles.alertBtn, isTracking(id || '') && styles.alertBtnActive]}
                onPress={async () => {
                  if (!notificationsEnabled) {
                    const granted = await enableNotifications();
                    if (!granted) return;
                  }
                  toggleTracking(id || '', match.teams[0]?.shortName || 'TM1', match.teams[1]?.shortName || 'TM2');
                }}
                data-testid="match-detail-alert-toggle"
              >
                <Ionicons
                  name={isTracking(id || '') ? 'notifications' : 'notifications-outline'}
                  size={18}
                  color={isTracking(id || '') ? '#4CAF50' : '#AAA'}
                />
                <Text style={[styles.alertTxt, isTracking(id || '') && styles.alertTxtActive]}>
                  {isTracking(id || '') ? 'ON' : 'Alerts'}
                </Text>
              </TouchableOpacity>
              
              {/* Cricbuzz Deep Link */}
              <TouchableOpacity
                style={styles.cricbuzzBtn}
                onPress={() => openCricbuzzMatch(id || '')}
                data-testid="cricbuzz-deep-link"
              >
                <Ionicons name="open-outline" size={16} color="#FFA500" />
                <Text style={styles.cricbuzzTxt}>Cricbuzz</Text>
              </TouchableOpacity>
            </View>
          </View>
          
          <View style={styles.teamRow}>
            <View style={styles.teamBlock}>
              <Text style={styles.teamName}>{match.teams[0].shortName}</Text>
              <Text style={styles.teamScore}>
                {match.teams[0].runs !== undefined
                  ? `${match.teams[0].runs}/${match.teams[0].wickets || 0}`
                  : '-'}
              </Text>
              {match.teams[0].overs !== undefined && (
                <Text style={styles.oversText}>({match.teams[0].overs} ov)</Text>
              )}
            </View>
            
            <LiveIndicator />
            
            <View style={styles.teamBlock}>
              <Text style={styles.teamName}>{match.teams[1].shortName}</Text>
              <Text style={styles.teamScore}>
                {match.teams[1].runs !== undefined
                  ? `${match.teams[1].runs}/${match.teams[1].wickets || 0}`
                  : '-'}
              </Text>
              {match.teams[1].overs !== undefined && (
                <Text style={styles.oversText}>({match.teams[1].overs} ov)</Text>
              )}
            </View>
          </View>

          {/* Status Text */}
          {match.statusText ? (
            <Text style={styles.statusText} numberOfLines={2}>{match.statusText}</Text>
          ) : null}

          <View style={styles.proAction}>
            {!effectiveIsPro ? (
              <TouchableOpacity
                style={styles.proBtn}
                onPress={() => setShowProModal(true)}
                data-testid="unlock-pro-btn"
              >
                <Ionicons name="lock-open" size={14} color="#FFF" />
                <Text style={styles.proBtnTxt}>
                  Unlock Floating Score (3 Ads)
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.ovBtn}
                onPress={() => setShowFloatingScoreboard(!showFloatingScoreboard)}
                data-testid="toggle-overlay-btn"
              >
                <Ionicons name={showFloatingScoreboard ? 'eye' : 'eye-off'} size={14} color="#FFF" />
                <Text style={styles.proBtnTxt}>
                  {showFloatingScoreboard ? 'Overlay ON' : 'Overlay OFF'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <CricketField
          lastCommentary={match.commentary?.[0]}
          battingTeam={match.teams[0].shortName}
          bowlingTeam={match.teams[1].shortName}
        />

        {/* Commentary Section - with Load More + Cricbuzz redirect */}
        {match.commentary && match.commentary.length > 0 ? (
          <CommentarySection
            commentary={match.commentary}
            matchId={id}
            isLive={match.status === 'live'}
          />
        ) : (
          <View style={styles.noCommentary}>
            <Ionicons name="chatbox-outline" size={40} color="#999" />
            <Text style={styles.noCommText}>Commentary not available yet</Text>
            <TouchableOpacity
              style={styles.cricbuzzLinkBtn}
              onPress={() => openCricbuzzMatch(id || '')}
            >
              <Ionicons name="open-outline" size={16} color="#FFF" />
              <Text style={styles.cricbuzzLinkTxt}>View on Cricbuzz</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Pro Unlock Modal (Logic C: 3 Rewarded Ads) */}
      <Modal visible={showProModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.mTitle}>Unlock Pro Access</Text>
            
            <View style={styles.proFeaturesList}>
              <View style={styles.proFeatureRow}>
                <Ionicons name="mic" size={18} color="#4CAF50" />
                <Text style={styles.proFeatureTxt}>Voice Commentary (TTS)</Text>
              </View>
              <View style={styles.proFeatureRow}>
                <Ionicons name="layers" size={18} color="#4CAF50" />
                <Text style={styles.proFeatureTxt}>Floating Scoreboard</Text>
              </View>
              <View style={styles.proFeatureRow}>
                <Ionicons name="notifications" size={18} color="#4CAF50" />
                <Text style={styles.proFeatureTxt}>Score Notifications</Text>
              </View>
              <View style={styles.proFeatureRow}>
                <Ionicons name="close-circle" size={18} color="#4CAF50" />
                <Text style={styles.proFeatureTxt}>No Ads for 30 mins</Text>
              </View>
            </View>
            
            {/* Progress */}
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${(localAdsWatched / 3) * 100}%` }]} />
              </View>
              <Text style={styles.mProgress}>{localAdsWatched}/3 Ads Watched</Text>
            </View>
            
            <TouchableOpacity style={styles.mBtn} onPress={watchAdsForPro} data-testid="watch-ad-modal-btn">
              <Ionicons name="play-circle" size={22} color="#FFF" />
              <Text style={styles.mBtnTxt}>Watch Ad {localAdsWatched + 1} of 3</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowProModal(false)}>
              <Text style={styles.mClose}>Maybe Later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Floating Scoreboard - Pro feature, draggable overlay */}
      {showFloatingScoreboard && effectiveIsPro && (
        <FloatingScoreboard
          match={match}
          visible={showFloatingScoreboard}
          onClose={() => setShowFloatingScoreboard(false)}
          isPro={effectiveIsPro}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a1a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1a1a' },
  loadingText: { color: '#999', marginTop: 12, fontSize: 14 },
  scoreHeader: {
    backgroundColor: '#222',
    padding: 16,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: '#4CAF50',
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 12,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  seriesName: { color: '#ffd700', fontSize: 12, flex: 1, marginRight: 8 },
  alertBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.1)',
    gap: 4,
  },
  alertBtnActive: {
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
  },
  alertTxt: { color: '#AAA', fontSize: 11, fontWeight: '600' },
  alertTxtActive: { color: '#4CAF50' },
  cricbuzzBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 165, 0, 0.15)',
    gap: 4,
  },
  cricbuzzTxt: { color: '#FFA500', fontSize: 11, fontWeight: '600' },
  teamRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    alignItems: 'center',
    marginBottom: 8,
  },
  teamBlock: {
    alignItems: 'center',
    flex: 1,
  },
  teamName: { color: '#CCC', fontSize: 13, fontWeight: '600', marginBottom: 2 },
  teamScore: { color: '#FFF', fontSize: 22, fontWeight: 'bold' },
  oversText: { color: '#999', fontSize: 11, marginTop: 2 },
  statusText: {
    color: '#4CAF50',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 8,
    fontStyle: 'italic',
  },
  proAction: { marginTop: 10 },
  proBtn: {
    backgroundColor: '#333',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ovBtn: {
    backgroundColor: '#4CAF50',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  proBtnTxt: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },
  noCommentary: {
    padding: 40,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    margin: 16,
    borderRadius: 12,
  },
  noCommText: { color: '#999', fontSize: 16, marginTop: 12, marginBottom: 16 },
  cricbuzzLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFA500',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    gap: 8,
  },
  cricbuzzLinkTxt: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBox: {
    backgroundColor: '#FFF',
    padding: 24,
    borderRadius: 20,
    width: '85%',
    alignItems: 'center',
  },
  mTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 16, color: '#333' },
  proFeaturesList: { width: '100%', marginBottom: 16, gap: 10 },
  proFeatureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  proFeatureTxt: { fontSize: 14, color: '#555' },
  progressContainer: { width: '100%', marginBottom: 16, alignItems: 'center' },
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 4,
  },
  mProgress: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4CAF50',
  },
  mBtn: {
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
  mBtnTxt: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  mClose: { marginTop: 8, color: '#999', fontSize: 14 },
});
