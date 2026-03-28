import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ImageBackground,
  ActivityIndicator,
  Animated,
  Dimensions,
  Platform,
  Switch,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { fetchMatchById, fetchMatchCommentary } from '../../src/services/api';
import { Match, Commentary } from '../../src/types/match';
import ErrorScreen from '../../src/components/ErrorScreen';
import LiveIndicator from '../../src/components/LiveIndicator';
import CricketField from '../../src/components/CricketField';
import FloatingScoreboard from '../../src/components/FloatingScoreboard';
import { usePro } from '../../src/context/ProContext';
import { useAdMob, ADMOB_CONFIG } from '../../src/context/AdMobContext';

const AUTO_REFRESH_INTERVAL = 30000; // 30 seconds - Smart Fetching
const CACHE_DURATION = 30000; // 30 seconds cache
const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Match cache
interface CacheEntry {
  match: Match;
  timestamp: number;
}
const matchCache: Map<string, CacheEntry> = new Map();

export default function MatchDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isPro } = usePro();
  const { trackClick, showRewardedAd } = useAdMob();
  
  const [match, setMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showFloatingScoreboard, setShowFloatingScoreboard] = useState(false);
  const [showFieldPosition, setShowFieldPosition] = useState(true);
  
  // Pro system - 30 minute temporary access after watching 3 ads
  // Note: We manage our own tempPro state for 30-min rewarded access
  const [tempProActive, setTempProActive] = useState(false);
  const [proExpiryTime, setProExpiryTime] = useState<number | null>(null);
  const [adsWatched, setAdsWatched] = useState(0);
  const [showProModal, setShowProModal] = useState(false);
  
  // Effective Pro status: either permanent Pro OR temporary Pro from ads
  const effectiveIsPro = isPro || tempProActive;
  
  // Check if Pro status has expired
  useEffect(() => {
    if (tempProActive && proExpiryTime) {
      const interval = setInterval(() => {
        if (Date.now() >= proExpiryTime) {
          setTempProActive(false);
          setProExpiryTime(null);
          alert('Pro status expired. Watch 3 more ads to continue.');
        }
      }, 10000); // Check every 10 seconds
      
      return () => clearInterval(interval);
    }
  }, [tempProActive, proExpiryTime]);
  
  // Commentary & Voice Features (English only)
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [lastSpokenIndex, setLastSpokenIndex] = useState(-1);
  
  // Scroll position preservation
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollPositionRef = useRef(0);
  
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const fieldOpacity = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  useEffect(() => {
    loadMatch();
    return () => {
      if (autoRefreshRef.current) {
        clearInterval(autoRefreshRef.current);
      }
      // Stop any ongoing speech
      Speech.stop();
    };
  }, [id]);

  // Auto-refresh for live matches with scroll position preservation
  useEffect(() => {
    if (match?.status === 'live') {
      autoRefreshRef.current = setInterval(async () => {
        if (id) {
          try {
            // Preserve scroll position before refresh
            const currentScrollPosition = scrollPositionRef.current;
            
            const freshMatch = await fetchMatchFromCache(id, true); // Force refresh
            if (freshMatch) {
              setMatch(freshMatch);
              
              // Restore scroll position after state update
              setTimeout(() => {
                scrollViewRef.current?.scrollTo({
                  y: currentScrollPosition,
                  animated: false,
                });
              }, 100);
              
              // Auto-speak new commentary if voice is enabled
              if (voiceEnabled && freshMatch.commentary && freshMatch.commentary.length > 0) {
                const newCommentary = freshMatch.commentary[0];
                if (lastSpokenIndex !== 0) {
                  speakCommentary(newCommentary);
                  setLastSpokenIndex(0);
                }
              }
            }
          } catch (err) {
            console.error('Error refreshing live match:', err);
          }
        }
      }, AUTO_REFRESH_INTERVAL);
    } else {
      if (autoRefreshRef.current) {
        clearInterval(autoRefreshRef.current);
        autoRefreshRef.current = null;
      }
    }

    return () => {
      if (autoRefreshRef.current) {
        clearInterval(autoRefreshRef.current);
      }
    };
  }, [match?.status, id, voiceEnabled, lastSpokenIndex]);

  const fetchMatchFromCache = async (matchId: string, forceRefresh: boolean = false): Promise<Match | null> => {
    const now = Date.now();
    const cached = matchCache.get(matchId);
    
    // Check if cached data is still valid (within cache duration)
    if (!forceRefresh && cached && (now - cached.timestamp) < CACHE_DURATION) {
      console.log('Using cached match data');
      return cached.match;
    }
    
    // Fetch fresh data
    console.log('Fetching fresh match data');
    const freshMatch = await fetchMatchById(matchId, forceRefresh);
    if (freshMatch) {
      matchCache.set(matchId, {
        match: freshMatch,
        timestamp: now,
      });
    }
    return freshMatch;
  };

  const loadMatch = async () => {
    if (!id) return;
    try {
      setError(false);
      const data = await fetchMatchFromCache(id);
      if (data) {
        setMatch(data);
      } else {
        setError(true);
      }
    } catch (err) {
      console.error('Error loading match:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  // Text-to-Speech function (English only)
  const speakCommentary = useCallback((commentary: Commentary) => {
    const textToSpeak = commentary.english;
    
    setIsSpeaking(true);
    
    Speech.speak(textToSpeak, {
      language: 'en-IN',
      pitch: 1.0,
      rate: 0.9,
      onDone: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    });
  }, []);

  // Handle Pro unlock via ads
  const unlockPro = async () => {
    setShowProModal(true);
  };
  
  const watchAdsForPro = async () => {
    try {
      // Watch 3 rewarded ads
      for (let i = 0; i < 3; i++) {
        const adWatched = await showRewardedAd();
        if (adWatched) {
          setAdsWatched(i + 1);
          if (i < 2) {
            // Show progress
            alert(`Ad ${i + 1}/3 completed. ${2 - i} more to go!`);
          }
        } else {
          alert(`Failed to load ad ${i + 1}. Please try again.`);
          setAdsWatched(0);
          setShowProModal(false);
          return;
        }
      }
      
      // All 3 ads watched - activate Pro for 30 minutes
      const expiryTime = Date.now() + (30 * 60 * 1000); // 30 minutes from now
      setTempProActive(true);
      setProExpiryTime(expiryTime);
      setAdsWatched(0);
      setShowProModal(false);
      
      alert('🎉 Pro activated for 30 minutes! Enjoy ad-free clicking.');
    } catch (error) {
      console.error('Error watching ads:', error);
      alert('Failed to unlock Pro. Please try again.');
      setAdsWatched(0);
      setShowProModal(false);
    }
  };
  
  const toggleVoice = () => {
    // Voice requires Pro (watch 3 ads)
    if (!effectiveIsPro) {
      unlockPro();
      return;
    }
    
    if (voiceEnabled) {
      Speech.stop();
      setIsSpeaking(false);
    }
    setVoiceEnabled(!voiceEnabled);
  };

  const speakSingleCommentary = (commentary: Commentary) => {
    // Voice requires Pro (watch 3 ads)
    if (!effectiveIsPro) {
      unlockPro();
      return;
    }
    
    if (isSpeaking) {
      Speech.stop();
      setIsSpeaking(false);
    } else {
      speakCommentary(commentary);
    }
  };

  const handleFloatingScoreboardToggle = () => {
    trackClick();
    if (effectiveIsPro) {
      setShowFloatingScoreboard(!showFloatingScoreboard);
    } else {
      // Open Pro unlock modal instead of just alert
      unlockPro();
    }
  };

  const handleScroll = (event: any) => {
    scrollPositionRef.current = event.nativeEvent.contentOffset.y;
  };

  const getStatusColor = () => {
    if (!match) return '#666';
    switch (match.status) {
      case 'live': return '#FF4444';
      case 'recent': return '#4CAF50';
      case 'upcoming': return '#2196F3';
      default: return '#666';
    }
  };

  const getStatusText = () => {
    if (!match) return '';
    switch (match.status) {
      case 'live': return 'LIVE';
      case 'recent': return 'COMPLETED';
      case 'upcoming': return 'UPCOMING';
      default: return match.status.toUpperCase();
    }
  };

  const shouldShowCommentary = () => {
    if (!match) return false;
    if (match.status === 'upcoming') return false;
    return match.commentary && match.commentary.length > 0;
  };

  const shouldShowCricketField = () => {
    if (!match) return false;
    if (match.status === 'upcoming') return false;
    return match.teams[0]?.runs !== undefined || match.teams[1]?.runs !== undefined;
  };

  // Render commentary with over-based banner ads and Hindi support
  const renderCommentaryWithAds = () => {
    if (!match?.commentary) return null;

    const items: Array<{ type: 'commentary' | 'ad'; data: any; key: string }> = [];
    let overEndCount = 0;

    match.commentary.forEach((comm, index) => {
      items.push({
        type: 'commentary',
        data: comm,
        key: `comm-${index}`,
      });

      const isOverEnd = comm.ball === 6 || comm.event === 'over-break' || comm.over.includes('.6');
      
      if (isOverEnd && !isPro) {
        overEndCount++;
        items.push({
          type: 'ad',
          data: { overNumber: comm.over, adIndex: overEndCount },
          key: `ad-${index}-${overEndCount}`,
        });
      }
    });

    return items.map((item) => {
      if (item.type === 'ad') {
        return (
          <View key={item.key} style={styles.bannerAdContainer}>
            <Text style={styles.bannerAdLabel}>ADVERTISEMENT</Text>
            <View style={styles.bannerAdPlaceholder}>
              <Text style={styles.bannerAdText}>Banner Ad - Over {item.data.overNumber}</Text>
              <Text style={styles.bannerAdSubtext}>AdMob ID: {ADMOB_CONFIG.bannerAdId}</Text>
            </View>
          </View>
        );
      }

      const comm = item.data as Commentary;
      const eventColor =
        comm.event === 'wicket' ? '#FF4444' :
        comm.event === 'four' ? '#4CAF50' :
        comm.event === 'six' ? '#9C27B0' : '#666';

      const displayText = comm.english;

      return (
        <View key={item.key} style={styles.commentaryItem}>
          <View style={styles.commentaryHeader}>
            <Text style={styles.commentaryOver}>{comm.over}</Text>
            {comm.event !== 'normal' && comm.event !== 'dot' && (
              <View style={[styles.eventBadge, { backgroundColor: eventColor }]}>
                <Text style={styles.eventBadgeText}>
                  {comm.event === 'wicket' ? 'W' :
                   comm.event === 'four' ? '4' :
                   comm.event === 'six' ? '6' : ''}
                </Text>
              </View>
            )}
            {comm.runs !== undefined && comm.runs > 0 && (
              <Text style={styles.commentaryRuns}>
                {`${comm.runs} run${comm.runs > 1 ? 's' : ''}`}
              </Text>
            )}
            {/* Voice button for each commentary - LOCKED for non-Pro */}
            <TouchableOpacity
              style={[styles.voiceButton, !effectiveIsPro && styles.voiceButtonLocked]}
              onPress={() => speakSingleCommentary(comm)}
              disabled={!effectiveIsPro}
            >
              <Ionicons
                name={isSpeaking ? "volume-high" : "volume-medium-outline"}
                size={18}
                color={effectiveIsPro ? "#4CAF50" : "#CCC"}
              />
              {!effectiveIsPro && <Text style={styles.lockIcon}>🔒</Text>}
            </TouchableOpacity>
          </View>
          <Text style={styles.commentaryText}>{displayText}</Text>
        </View>
      );
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Loading match details...</Text>
      </SafeAreaView>
    );
  }

  if (error || !match) {
    return (
      <ErrorScreen
        onGoBack={() => router.back()}
        message="Could not load match."
      />
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ImageBackground
        source={require('../../assets/images/header-grass.png')}
        style={styles.headerBackground}
        resizeMode="cover"
      >
        <View style={styles.headerContent}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>Match Details</Text>
          <View style={styles.placeholder} />
        </View>
      </ImageBackground>

      {/* Scoreboard Section */}
      <View style={styles.scoreboardSection}>
        <View style={styles.statusContainer}>
          {match.status === 'live' ? (
            <LiveIndicator />
          ) : (
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor() }]}>
              <Text style={styles.statusText}>{getStatusText()}</Text>
            </View>
          )}
        </View>

        <View style={styles.matchInfoCard}>
          <Text style={styles.seriesTitle}>{match.series}</Text>
          <Text style={styles.matchType}>{match.matchType} • {match.venue}</Text>
        </View>

        <View style={styles.scoreCard}>
          {match.teams.map((team, index) => (
            <View key={index} style={styles.teamScoreRow}>
              <Text style={styles.teamName}>{team.shortName || team.name}</Text>
              <View style={styles.scoreInfo}>
                {team.runs !== undefined ? (
                  <>
                    <Text style={styles.scoreMain}>{team.runs}/{team.wickets || 0}</Text>
                    {team.overs && <Text style={styles.oversText}>({team.overs})</Text>}
                  </>
                ) : (
                  <Text style={styles.yetToBat}>Yet to bat</Text>
                )}
              </View>
            </View>
          ))}
        </View>

        {match.status === 'live' && (
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.floatingScoreboardButton, !effectiveIsPro && styles.floatingScoreboardButtonLocked]}
              onPress={handleFloatingScoreboardToggle}
            >
              <Ionicons name={showFloatingScoreboard ? "tv" : "tv-outline"} size={16} color={effectiveIsPro ? '#FFF' : '#999'} />
              <Text style={[styles.floatingScoreboardButtonText, !effectiveIsPro && styles.floatingScoreboardButtonTextLocked]}>
                {effectiveIsPro ? 'Floating Score' : 'Pro Only'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.overlayButton, showFloatingScoreboard && styles.overlayButtonActive]}
              onPress={handleFloatingScoreboardToggle}
            >
              <Ionicons name="layers" size={16} color={showFloatingScoreboard ? '#FFF' : '#4CAF50'} />
              <Text style={[styles.overlayButtonText, showFloatingScoreboard && styles.overlayButtonTextActive]}>
                {showFloatingScoreboard ? 'Overlay ON' : 'Overlay OFF'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {match.result && (
          <View style={[styles.resultContainer, match.status === 'live' && styles.liveResultContainer]}>
            <Ionicons name={match.status === 'live' ? 'pulse' : 'trophy'} size={18} color={match.status === 'live' ? '#FF4444' : '#FFD700'} />
            <Text style={[styles.resultText, match.status === 'live' && styles.liveResultText]}>{match.result}</Text>
          </View>
        )}
      </View>

      <ImageBackground
        source={require('../../assets/images/wallpaper.png')}
        style={styles.contentBackground}
        resizeMode="repeat"
      >
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        >
          {/* Cricket Field */}
          {shouldShowCricketField() && (
            <Animated.View style={{ opacity: fieldOpacity }}>
              <CricketField
                lastCommentary={match.commentary?.[0]}
                battingTeam={match.teams[0]?.shortName}
                bowlingTeam={match.teams[1]?.shortName}
              />
            </Animated.View>
          )}

          {/* Commentary Section with Controls */}
          {shouldShowCommentary() && (
            <View style={styles.commentarySection}>
              {/* Commentary Header with Controls */}
              <View style={styles.commentaryControls}>
                <Text style={styles.sectionTitle}>Live Commentary</Text>
                
                <View style={styles.controlsRow}>
                  {/* Voice Toggle - LOCKED for non-Pro */}
                  <TouchableOpacity
                    style={[
                      styles.voiceToggle, 
                      voiceEnabled && styles.voiceToggleActive,
                      !effectiveIsPro && styles.voiceToggleLocked
                    ]}
                    onPress={toggleVoice}
                    disabled={!effectiveIsPro}
                  >
                    <Ionicons
                      name={voiceEnabled ? "volume-high" : "volume-mute-outline"}
                      size={20}
                      color={!effectiveIsPro ? '#CCC' : voiceEnabled ? '#FFF' : '#666'}
                    />
                    <Text style={[
                      styles.voiceToggleText, 
                      voiceEnabled && styles.voiceToggleTextActive,
                      !effectiveIsPro && styles.voiceToggleTextLocked
                    ]}>
                      {effectiveIsPro ? 'Voice' : '🔒 Pro'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Auto-refresh banner */}
              {match.status === 'live' && (
                <View style={styles.autoRefreshBanner}>
                  <Ionicons name="sync" size={14} color="#FFF" />
                  <Text style={styles.autoRefreshText}>
                    Auto-refreshing every 30 seconds
                  </Text>
                </View>
              )}

              {/* Commentary Items */}
              {renderCommentaryWithAds()}
              
              {/* Commentary count */}
              <View style={styles.commentaryFooter}>
                <Text style={styles.commentaryCount}>
                  {`${match.commentary?.length || 0} commentary items`}
                </Text>
              </View>
            </View>
          )}

          <View style={styles.bottomPadding} />
        </ScrollView>
      </ImageBackground>

      {/* Pro Unlock Modal */}
      <Modal
        visible={showProModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowProModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.proModalContainer}>
            <Text style={styles.proModalTitle}>🎉 Unlock Pro Features</Text>
            
            <View style={styles.proFeaturesList}>
              <Text style={styles.proFeature}>✅ Voice Commentary</Text>
              <Text style={styles.proFeature}>✅ Floating Scoreboard</Text>
              <Text style={styles.proFeature}>✅ No Click Ads for 30 mins</Text>
            </View>
            
            <Text style={styles.proModalSubtitle}>
              Watch 3 short ads to unlock Pro for 30 minutes
            </Text>
            
            {adsWatched > 0 && (
              <Text style={styles.proModalProgress}>
                Progress: {adsWatched}/3 ads watched
              </Text>
            )}
            
            <TouchableOpacity
              style={styles.proModalButton}
              onPress={watchAdsForPro}
            >
              <Text style={styles.proModalButtonText}>Watch 3 Ads</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.proModalCancelButton}
              onPress={() => {
                setShowProModal(false);
                setAdsWatched(0);
              }}
            >
              <Text style={styles.proModalCancelText}>Maybe Later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Floating Scoreboard */}
      {match && effectiveIsPro && showFloatingScoreboard && (
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
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  headerBackground: {
    width: '100%',
    height: 100,
    justifyContent: 'flex-end',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    flex: 1,
    textAlign: 'center',
  },
  placeholder: {
    width: 40,
  },
  scoreboardSection: {
    backgroundColor: 'rgba(26, 26, 26, 0.95)',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    borderBottomColor: '#4CAF50',
    maxHeight: SCREEN_HEIGHT * 0.2,
  },
  statusContainer: {
    alignItems: 'center',
    marginBottom: 8,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 12,
  },
  matchInfoCard: {
    alignItems: 'center',
    marginBottom: 8,
  },
  seriesTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  matchType: {
    fontSize: 11,
    color: '#999',
  },
  scoreCard: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
  },
  teamScoreRow: {
    alignItems: 'center',
  },
  teamName: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  scoreInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  scoreMain: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  oversText: {
    fontSize: 11,
    color: '#999',
  },
  yetToBat: {
    fontSize: 11,
    color: '#666',
    fontStyle: 'italic',
  },
  floatingScoreboardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    gap: 6,
    flex: 1,
  },
  floatingScoreboardButtonLocked: {
    backgroundColor: '#333',
  },
  floatingScoreboardButtonText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '600',
  },
  floatingScoreboardButtonTextLocked: {
    color: '#999',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  overlayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    gap: 6,
    flex: 1,
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  overlayButtonActive: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  overlayButtonText: {
    color: '#4CAF50',
    fontSize: 11,
    fontWeight: '600',
  },
  overlayButtonTextActive: {
    color: '#FFF',
  },
  resultContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 6,
    paddingVertical: 4,
  },
  liveResultContainer: {
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
    borderRadius: 8,
  },
  resultText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4CAF50',
  },
  liveResultText: {
    color: '#FF4444',
  },
  contentBackground: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  commentarySection: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    padding: 16,
    minHeight: SCREEN_HEIGHT * 0.5,
  },
  commentaryControls: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  voiceToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  voiceToggleActive: {
    backgroundColor: '#4CAF50',
  },
  voiceToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  voiceToggleTextActive: {
    color: '#FFF',
  },
  autoRefreshBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF4444',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 6,
    marginBottom: 12,
  },
  autoRefreshText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '500',
  },
  commentaryItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.06)',
  },
  commentaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  commentaryOver: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  eventBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  eventBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  commentaryRuns: {
    fontSize: 11,
    color: '#666',
    flex: 1,
  },
  voiceButton: {
    padding: 4,
  },
  commentaryText: {
    fontSize: 13,
    color: '#333',
    lineHeight: 18,
  },
  commentaryFooter: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    alignItems: 'center',
  },
  commentaryCount: {
    fontSize: 11,
    color: '#999',
  },
  bannerAdContainer: {
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
    padding: 12,
    marginVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DDD',
  },
  bannerAdLabel: {
    fontSize: 9,
    color: '#999',
    marginBottom: 6,
    letterSpacing: 1,
  },
  bannerAdPlaceholder: {
    backgroundColor: '#E0E0E0',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 6,
    width: '100%',
    alignItems: 'center',
  },
  bannerAdText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  bannerAdSubtext: {
    fontSize: 9,
    color: '#999',
    marginTop: 4,
  },
  bottomPadding: {
    height: 100, // Increased to prevent banner ad overlap
  },
  voiceButtonLocked: {
    opacity: 0.4,
  },
  lockIcon: {
    position: 'absolute',
    top: -2,
    right: -2,
    fontSize: 8,
  },
  voiceToggleLocked: {
    backgroundColor: '#DDD',
    opacity: 0.6,
  },
  voiceToggleTextLocked: {
    color: '#999',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  proModalContainer: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 30,
    width: '85%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  proModalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 20,
  },
  proFeaturesList: {
    marginBottom: 20,
  },
  proFeature: {
    fontSize: 16,
    color: '#555',
    marginBottom: 10,
  },
  proModalSubtitle: {
    fontSize: 14,
    color: '#777',
    textAlign: 'center',
    marginBottom: 20,
  },
  proModalProgress: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4CAF50',
    textAlign: 'center',
    marginBottom: 15,
  },
  proModalButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 10,
    paddingVertical: 15,
    paddingHorizontal: 30,
    marginBottom: 10,
  },
  proModalButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  proModalCancelButton: {
    backgroundColor: 'transparent',
    paddingVertical: 10,
  },
  proModalCancelText: {
    color: '#999',
    fontSize: 14,
    textAlign: 'center',
  },
});
