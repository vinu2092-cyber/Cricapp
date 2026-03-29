import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Dimensions, Modal, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { fetchMatchById } from '../../src/services/api';
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
  const [showFloatingScoreboard, setShowFloatingScoreboard] = useState(false);

  // Match Mood Meter state - tracks latest event for visual effects
  const [moodEvent, setMoodEvent] = useState<'wicket' | 'four' | 'six' | 'dot' | 'normal' | null>(null);
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

  // 30-Min Expiry Logic
  useEffect(() => {
    if (tempProActive && proExpiryTime) {
      const interval = setInterval(() => {
        if (Date.now() >= proExpiryTime) {
          setTempProActive(false);
          setProExpiryTime(null);
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
        // Detect new event for mood meter
        if (data.commentary && data.commentary.length > 0) {
          const latestComm = data.commentary[0];
          const latestId = latestComm.id || `${latestComm.over}-${latestComm.english?.substring(0, 20)}`;
          if (prevCommentaryRef.current && prevCommentaryRef.current !== latestId) {
            // New ball detected - trigger mood effect
            const eventType = latestComm.event || 'normal';
            setMoodEvent(eventType);
            setTimeout(() => setMoodEvent(null), 2500);
          }
          prevCommentaryRef.current = latestId;
        }
        setMatch(data);
        setError(false);
      } else {
        setError(true);
      }
    } catch (err) {
      setError(true);
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
        Alert.alert('Success!', 'Pro Unlocked! Enjoy Overlay and Ad-free 30 mins.');
      } else {
        Alert.alert('Keep going!', `Watched ${current}/3 ads.`);
      }
    }
  };

  if (loading)
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#4CAF50" size="large" />
      </View>
    );
  if (error || !match) return <ErrorScreen onGoBack={() => router.back()} />;

  return (
    <SafeAreaView style={styles.container} onTouchStart={handleInteraction}>
      {/* Match Mood Meter - visual effects overlay */}
      <MatchMoodMeter event={moodEvent} />
      
      <ScrollView stickyHeaderIndices={[0]} ref={scrollViewRef}>
        <View style={styles.scoreHeader}>
          <View style={styles.headerTopRow}>
            <Text style={styles.seriesName}>{match.seriesName}</Text>
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
                size={20}
                color={isTracking(id || '') ? '#4CAF50' : '#AAA'}
              />
              <Text style={[styles.alertTxt, isTracking(id || '') && styles.alertTxtActive]}>
                {isTracking(id || '') ? 'Alerts ON' : 'Alerts'}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.teamRow}>
            <Text style={styles.teamScore}>
              {match.teams[0].shortName}:{' '}
              {match.teams[0].runs !== undefined
                ? `${match.teams[0].runs}/${match.teams[0].wickets || 0}`
                : '-'}
            </Text>
            <LiveIndicator />
            <Text style={styles.teamScore}>
              {match.teams[1].shortName}:{' '}
              {match.teams[1].runs !== undefined
                ? `${match.teams[1].runs}/${match.teams[1].wickets || 0}`
                : '-'}
            </Text>
          </View>

          <View style={styles.proAction}>
            {!effectiveIsPro ? (
              <TouchableOpacity
                style={styles.proBtn}
                onPress={() => setShowProModal(true)}
              >
                <Text style={styles.proBtnTxt}>
                  Unlock Floating Score (3 Ads)
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.ovBtn}
                onPress={() =>
                  setShowFloatingScoreboard(!showFloatingScoreboard)
                }
              >
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

        {/* Commentary Section - uses CommentarySection with Load More + Cricbuzz redirect */}
        {match.commentary && match.commentary.length > 0 && (
          <CommentarySection
            commentary={match.commentary}
            matchId={id}
            isLive={match.status === 'live'}
          />
        )}
      </ScrollView>

      {/* Pro Unlock Modal */}
      <Modal visible={showProModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.mTitle}>Unlock Pro Access</Text>
            <Text style={styles.mProgress}>{localAdsWatched}/3 Ads</Text>
            <TouchableOpacity style={styles.mBtn} onPress={watchAdsForPro}>
              <Text style={styles.mBtnTxt}>Watch Ad</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowProModal(false)}>
              <Text style={styles.mClose}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Floating Scoreboard - FIXED: pass all required props */}
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scoreHeader: {
    backgroundColor: '#222',
    padding: 20,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#4CAF50',
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 10,
  },
  seriesName: { color: '#ffd700', fontSize: 12, flex: 1 },
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
  teamRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    alignItems: 'center',
  },
  teamScore: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  proAction: { marginTop: 15 },
  proBtn: {
    backgroundColor: '#333',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
  },
  ovBtn: {
    backgroundColor: '#4CAF50',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
  },
  proBtnTxt: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBox: {
    backgroundColor: '#FFF',
    padding: 30,
    borderRadius: 20,
    width: '80%',
    alignItems: 'center',
  },
  mTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
  mProgress: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginBottom: 20,
  },
  mBtn: {
    backgroundColor: '#4CAF50',
    padding: 15,
    borderRadius: 10,
    width: '100%',
    alignItems: 'center',
  },
  mBtnTxt: { color: '#FFF', fontWeight: 'bold' },
  mClose: { marginTop: 15, color: '#999' },
});
