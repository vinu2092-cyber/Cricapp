import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ImageBackground,
  ActivityIndicator, Animated, Dimensions, Platform, Modal, Linking, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { fetchMatchById } from '../../src/services/api';
import { Match, Commentary } from '../../src/types/match';
import ErrorScreen from '../../src/components/ErrorScreen';
import LiveIndicator from '../../src/components/LiveIndicator';
import CricketField from '../../src/components/CricketField';
import FloatingScoreboard from '../../src/components/FloatingScoreboard';
import { usePro } from '../../src/context/ProContext';
import { useAdMob } from '../../src/context/AdMobContext';

const AUTO_REFRESH_INTERVAL = 45000; // Smart refresh
const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function MatchDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isPro } = usePro();
  const { trackClick, showRewardedAd, showInterstitialAd, BannerAdComponent } = useAdMob();
  
  const [match, setMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showFloatingScoreboard, setShowFloatingScoreboard] = useState(false);
  
  // Logic C & D: Pro & Timer States
  const [tempProActive, setTempProActive] = useState(false);
  const [proExpiryTime, setProExpiryTime] = useState<number | null>(null);
  const [adsWatched, setAdsWatched] = useState(0);
  const [showProModal, setShowProModal] = useState(false);
  
  // Logic B: Click Counter (10-15 random)
  const [clickCount, setClickCount] = useState(0);
  const [targetClicks] = useState(Math.floor(Math.random() * 6) + 10);

  const effectiveIsPro = isPro || tempProActive;

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

  const [isSpeaking, setIsSpeaking] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollPositionRef = useRef(0);
    useEffect(() => {
    loadMatch();
    const interval = setInterval(loadMatch, AUTO_REFRESH_INTERVAL);
    return () => { clearInterval(interval); Speech.stop(); };
  }, [id]);

  const loadMatch = async () => {
    if (!id) return;
    try {
      const data = await fetchMatchById(id);
      if (data) { setMatch(data); setError(false); }
      else { setError(true); }
    } catch (err) { setError(true); }
    finally { setLoading(false); }
  };

  // Logic B: Interstitial Trigger
  const handleInteraction = () => {
    if (effectiveIsPro) return;
    const next = clickCount + 1;
    if (next >= targetClicks) {
      showInterstitialAd();
      setClickCount(0);
    } else { setClickCount(next); }
  };

  // Logic C: Watch 3 Ads for Pro
  const watchAdsForPro = async () => {
    const success = await showRewardedAd();
    if (success) {
      const current = adsWatched + 1;
      setAdsWatched(current);
      if (current >= 3) {
        setTempProActive(true);
        setProExpiryTime(Date.now() + (30 * 60 * 1000));
        setAdsWatched(0);
        setShowProModal(false);
        Alert.alert('🎉 Success', 'Pro Unlocked! Enjoy Overlay and Ad-free 30 mins.');
      } else {
        Alert.alert('Keep going!', `Watched ${current}/3 ads.`);
      }
    }
  };

  const speakCommentary = (text: string) => {
    if (!effectiveIsPro) { setShowProModal(true); return; }
    if (isSpeaking) Speech.stop();
    setIsSpeaking(true);
    Speech.speak(text, { onDone: () => setIsSpeaking(false) });
  };
    const renderCommentaryWithAds = () => {
    if (!match?.commentary) return null;
    return match.commentary.slice(0, 25).map((comm, index) => {
      // Over-wise Ad Detection (.1 and .6)
      const isOverStart = comm.over.endsWith('.1');
      const isOverEnd = comm.over.endsWith('.6') || comm.over.endsWith('.0');

      return (
        <View key={comm.id || index}>
          {isOverStart && (
            <View style={styles.adBox}><Text style={styles.adTag}>AD</Text><BannerAdComponent size="BANNER" /></View>
          )}

          <View style={styles.commCard}>
            <View style={styles.commTop}>
              <Text style={styles.overTxt}>{comm.over}</Text>
              <TouchableOpacity onPress={() => speakCommentary(comm.english)}>
                <Ionicons name="volume-high" size={18} color={effectiveIsPro ? "#4CAF50" : "#CCC"} />
              </TouchableOpacity>
            </View>
            <Text style={styles.commTxt}>{comm.english}</Text>
          </View>

          {isOverEnd && (
            <View style={styles.adBox}><Text style={styles.adTag}>OVER AD</Text><BannerAdComponent size="BANNER" /></View>
          )}
        </View>
      );
    });
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color="#4CAF50" /></View>;
  if (error || !match) return <ErrorScreen onGoBack={() => router.back()} />;

  return (
    <SafeAreaView style={styles.container} onTouchStart={handleInteraction}>
      <ScrollView stickyHeaderIndices={[0]}>
        <View style={styles.scoreHeader}>
          <Text style={styles.seriesName}>{match.seriesName}</Text>
          <View style={styles.teamRow}>
            <Text style={styles.teamScore}>{match.teams[0].shortName}: {match.teams[0].runs}/{match.teams[0].wickets}</Text>
            <LiveIndicator />
            <Text style={styles.teamScore}>{match.teams[1].shortName}: {match.teams[1].runs}/{match.teams[1].wickets}</Text>
          </View>
          
          <View style={styles.proAction}>
            {!effectiveIsPro ? (
              <TouchableOpacity style={styles.proBtn} onPress={() => setShowProModal(true)}>
                <Text style={styles.proBtnTxt}>Unlock Floating Score (3 Ads)</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.ovBtn} onPress={() => setShowFloatingScoreboard(!showFloatingScoreboard)}>
                <Text style={styles.proBtnTxt}>{showFloatingScoreboard ? "Overlay ON" : "Overlay OFF"}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <CricketField lastCommentary={match.commentary?.[0]} battingTeam={match.teams[0].shortName} bowlingTeam={match.teams[1].shortName} />

        <View style={styles.commSection}>
          {renderCommentaryWithAds()}
          <TouchableOpacity style={styles.cricbuzzBtn} onPress={() => Linking.openURL(`https://www.cricbuzz.com/live-cricket-scores/${id}`)}>
            <Text style={styles.cricbuzzTxt}>View Details on Cricbuzz</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal visible={showProModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.mTitle}>Unlock Pro Access</Text>
            <Text style={styles.mProgress}>{adsWatched}/3 Ads</Text>
            <TouchableOpacity style={styles.mBtn} onPress={watchAdsForPro}><Text style={styles.mBtnTxt}>Watch Ad</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setShowProModal(false)}><Text style={styles.mClose}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {showFloatingScoreboard && effectiveIsPro && <FloatingScoreboard match={match} onClose={() => setShowFloatingScoreboard(false)} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a1a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scoreHeader: { backgroundColor: '#222', padding: 20, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#4CAF50' },
  seriesName: { color: '#ffd700', fontSize: 12, marginBottom: 10 },
  teamRow: { flexDirection: 'row', justifyContent: 'space-around', width: '100%', alignItems: 'center' },
  teamScore: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  proAction: { marginTop: 15 },
  proBtn: { backgroundColor: '#333', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 20 },
  ovBtn: { backgroundColor: '#4CAF50', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 20 },
  proBtnTxt: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },
  commSection: { backgroundColor: '#FFF', padding: 15 },
  commCard: { backgroundColor: '#f9f9f9', padding: 12, borderRadius: 10, marginBottom: 10 },
  commTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  overTxt: { fontWeight: 'bold', color: '#4CAF50' },
  commTxt: { color: '#333', fontSize: 14, lineHeight: 20 },
  adBox: { marginVertical: 12, backgroundColor: '#EEE', padding: 10, alignItems: 'center', borderRadius: 8 },
  adTag: { fontSize: 8, color: '#999', marginBottom: 4 },
  cricbuzzBtn: { marginVertical: 20, backgroundColor: '#022d5d', padding: 15, borderRadius: 10, alignItems: 'center' },
  cricbuzzTxt: { color: '#FFF', fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
  modalBox: { backgroundColor: '#FFF', padding: 30, borderRadius: 20, width: '80%', alignItems: 'center' },
  mTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
  mProgress: { fontSize: 22, fontWeight: 'bold', color: '#4CAF50', marginBottom: 20 },
  mBtn: { backgroundColor: '#4CAF50', padding: 15, borderRadius: 10, width: '100%', alignItems: 'center' },
  mBtnTxt: { color: '#FFF', fontWeight: 'bold' },
  mClose: { marginTop: 15, color: '#999' }
});
