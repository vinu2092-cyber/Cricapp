import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Dimensions, Modal, Alert, FlatList
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { fetchMatchById, openCricbuzzMatch } from '../../src/services/api';
import { Match } from '../../src/types/match';
import ErrorScreen from '../../src/components/ErrorScreen';
import LiveIndicator from '../../src/components/LiveIndicator';
import CricketField from '../../src/components/CricketField';
import CommentarySection from '../../src/components/CommentarySection';
import FloatingScoreboard from '../../src/components/FloatingScoreboard';
import MatchMoodMeter from '../../src/components/MatchMoodMeter';
import { usePro } from '../../src/context/ProContext';
import { useAdMob } from '../../src/context/AdMobContext';
import { useNotifications } from '../../src/context/NotificationContext';

const AUTO_REFRESH = 45000;

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

  // Click counter for interstitial (Logic B)
  const [clicks, setClicks] = useState(0);
  const [clickTarget] = useState(Math.floor(Math.random() * 6) + 10);

  const effectiveIsPro = globalIsPro || tempPro;

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

  useEffect(() => {
    loadMatch();
    const interval = setInterval(loadMatch, AUTO_REFRESH);
    return () => {
      clearInterval(interval);
      Speech.stop();
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
      <View style={styles.center}>
        <ActivityIndicator color="#4CAF50" size="large" />
        <Text style={styles.loadingText}>Loading match...</Text>
      </View>
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

              {/* Cricbuzz Link */}
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: 'rgba(255,165,0,0.15)' }]}
                onPress={() => openCricbuzzMatch(id || '')}
              >
                <Ionicons name="open-outline" size={16} color="#FFA500" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Score Row */}
          <View style={styles.teamRow}>
            <View style={styles.teamBlock}>
              <Text style={styles.teamName}>{match.teams[0].shortName}</Text>
              <Text style={styles.teamScore}>
                {match.teams[0].runs !== undefined ? `${match.teams[0].runs}/${match.teams[0].wickets || 0}` : '-'}
              </Text>
              {match.teams[0].overs !== undefined && <Text style={styles.overs}>({match.teams[0].overs} ov)</Text>}
            </View>

            <LiveIndicator />

            <View style={styles.teamBlock}>
              <Text style={styles.teamName}>{match.teams[1].shortName}</Text>
              <Text style={styles.teamScore}>
                {match.teams[1].runs !== undefined ? `${match.teams[1].runs}/${match.teams[1].wickets || 0}` : '-'}
              </Text>
              {match.teams[1].overs !== undefined && <Text style={styles.overs}>({match.teams[1].overs} ov)</Text>}
            </View>
          </View>

          {match.statusText ? <Text style={styles.statusTxt} numberOfLines={2}>{match.statusText}</Text> : null}

          {/* Pro / Overlay Toggle */}
          <View style={styles.proRow}>
            {!effectiveIsPro ? (
              <TouchableOpacity style={styles.unlockBtn} onPress={() => setShowProModal(true)}>
                <Ionicons name="lock-open" size={14} color="#FFF" />
                <Text style={styles.unlockTxt}>Unlock Pro (3 Ads)</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.unlockBtn, { backgroundColor: '#4CAF50' }]}
                onPress={() => setShowOverlay(!showOverlay)}
              >
                <Ionicons name={showOverlay ? 'eye' : 'eye-off'} size={14} color="#FFF" />
                <Text style={styles.unlockTxt}>{showOverlay ? 'Overlay ON' : 'Overlay OFF'}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Cricket Field */}
        <CricketField
          lastCommentary={match.commentary?.[0]}
          battingTeam={match.teams[0].shortName}
          bowlingTeam={match.teams[1].shortName}
        />

        {/* Commentary */}
        {match.commentary && match.commentary.length > 0 ? (
          <CommentarySection
            commentary={match.commentary}
            matchId={id}
            isLive={match.status === 'live'}
          />
        ) : (match as any)?.commentaryList && (match as any).commentaryList.length > 0 ? (
          <FlatList
            data={(match as any).commentaryList}
            keyExtractor={(item, index) => index.toString()}
            scrollEnabled={false}
            renderItem={({ item, index }) => (
              <View>
                <View style={{ padding: 10, borderBottomWidth: 1, borderColor: '#333' }}>
                  <Text style={{ color: '#aaa', fontSize: 12 }}>Over: {item.overSeparator?.overNum || '-'}</Text>
                  <Text style={{ color: '#fff', fontSize: 14 }}>{item.commText}</Text>
                </View>
                {/* Inject Banner Ad every 10 commentary items for Non-Pro users */}
                {!effectiveIsPro && index > 0 && index % 10 === 0 && (
                  <View style={{ alignItems: 'center', marginVertical: 10 }}>
                    <BannerAd
                      unitId="ca-app-pub-9675798593675825/8616886104"
                      size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
                    />
                  </View>
                )}
              </View>
            )}
          />
        ) : (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <Text style={{ color: 'white', fontSize: 16 }}>Commentary Not Available</Text>
          </View>
        )}
      </ScrollView>

      {/* Pro Modal - 3 Rewarded Ads */}
      <Modal visible={showProModal} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalBox}>
            <Text style={styles.mTitle}>Unlock Pro Access</Text>

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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a1a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1a1a' },
  loadingText: { color: '#999', marginTop: 12, fontSize: 14 },
  scoreHeader: { backgroundColor: '#222', padding: 14, borderBottomWidth: 2, borderBottomColor: '#4CAF50' },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  backBtn: { padding: 6, marginRight: 8 },
  seriesName: { color: '#ffd700', fontSize: 12, flex: 1 },
  headerActions: { flexDirection: 'row', gap: 8 },
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
  statusTxt: { color: '#4CAF50', fontSize: 12, textAlign: 'center', marginBottom: 8, fontStyle: 'italic' },
  proRow: { alignItems: 'center', marginTop: 8 },
  unlockBtn: {
    backgroundColor: '#333',
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
  cricbuzzBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFA500',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    gap: 8,
  },
  cricbuzzTxt: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
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
