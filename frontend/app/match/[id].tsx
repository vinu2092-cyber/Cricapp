import React, { useState, useEffect, useRef } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { fetchMatchById } from '../../src/services/api';
import { Match } from '../../src/types/match';
import ErrorScreen from '../../src/components/ErrorScreen';
import LiveIndicator from '../../src/components/LiveIndicator';
import CricketField from '../../src/components/CricketField';
import FloatingScoreboard from '../../src/components/FloatingScoreboard';
import { usePro } from '../../src/context/ProContext';
import { useAdMob, ADMOB_CONFIG } from '../../src/context/AdMobContext';

const AUTO_REFRESH_INTERVAL = 50000; // 50 seconds - Smart Fetching
const CACHE_DURATION = 50000; // 50 seconds cache
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
  const { trackClick, shouldShowBannerAd } = useAdMob();
  
  const [match, setMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showFloatingScoreboard, setShowFloatingScoreboard] = useState(false);
  const [showFieldPosition, setShowFieldPosition] = useState(true);
  
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
    };
  }, [id]);

  // Auto-refresh for live matches (1 minute)
  useEffect(() => {
    if (match?.status === 'live') {
      autoRefreshRef.current = setInterval(async () => {
        if (id) {
          try {
            const freshMatch = await fetchMatchFromCache(id);
            if (freshMatch) {
              setMatch(freshMatch);
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
  }, [match?.status, id]);

  const fetchMatchFromCache = async (matchId: string): Promise<Match | null> => {
    const now = Date.now();
    const cached = matchCache.get(matchId);
    
    // Check if cached data is still valid (within 1 minute)
    if (cached && (now - cached.timestamp) < CACHE_DURATION) {
      console.log('Using cached match data');
      return cached.match;
    }
    
    // Fetch fresh data
    console.log('Fetching fresh match data');
    const freshMatch = await fetchMatchById(matchId);
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

  const handleFloatingScoreboardToggle = () => {
    trackClick();
    if (isPro) {
      setShowFloatingScoreboard(!showFloatingScoreboard);
    } else {
      // Show upgrade prompt
      alert('Unlock Pro to use Floating Scoreboard feature');
    }
  };

  const getStatusColor = () => {
    if (!match) return '#666';
    switch (match.status) {
      case 'live':
        return '#FF4444';
      case 'recent':
        return '#4CAF50';
      case 'upcoming':
        return '#2196F3';
      default:
        return '#666';
    }
  };

  const getStatusText = () => {
    if (!match) return '';
    switch (match.status) {
      case 'live':
        return 'LIVE';
      case 'recent':
        return 'COMPLETED';
      case 'upcoming':
        return 'UPCOMING';
      default:
        return match.status.toUpperCase();
    }
  };

  // Check if commentary should be shown
  const shouldShowCommentary = () => {
    if (!match) return false;
    if (match.status === 'upcoming') return false;
    return match.commentary && match.commentary.length > 0;
  };

  // Check if cricket field should be shown
  const shouldShowCricketField = () => {
    if (!match) return false;
    if (match.status === 'upcoming') return false;
    return match.teams[0]?.runs !== undefined || match.teams[1]?.runs !== undefined;
  };

  // Render commentary with over-based banner ads
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

      // Check if this is the end of an over (ball 6 or over-break event)
      const isOverEnd = comm.ball === 6 || comm.event === 'over-break' || comm.over.includes('.6');
      
      if (isOverEnd && !isPro) {
        overEndCount++;
        // Insert banner ad after each over end
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
            <Text style={styles.bannerAdLabel}>Advertisement</Text>
            <View style={styles.bannerAdPlaceholder}>
              <Text style={styles.bannerAdText}>Banner Ad - Over {item.data.overNumber}</Text>
              <Text style={styles.bannerAdSubtext}>AdMob ID: {ADMOB_CONFIG.bannerAdId}</Text>
            </View>
          </View>
        );
      }

      const comm = item.data;
      const eventColor =
        comm.event === 'wicket'
          ? '#FF4444'
          : comm.event === 'four'
          ? '#4CAF50'
          : comm.event === 'six'
          ? '#9C27B0'
          : '#666';

      return (
        <View key={item.key} style={styles.commentaryItem}>
          <View style={styles.commentaryHeader}>
            <Text style={styles.commentaryOver}>{comm.over}</Text>
            {comm.event !== 'normal' && comm.event !== 'dot' && (
              <View style={[styles.eventBadge, { backgroundColor: eventColor }]}>
                <Text style={styles.eventBadgeText}>
                  {comm.event === 'wicket'
                    ? 'W'
                    : comm.event === 'four'
                    ? '4'
                    : comm.event === 'six'
                    ? '6'
                    : ''}
                </Text>
              </View>
            )}
            {comm.runs !== undefined && comm.runs > 0 && (
              <Text style={styles.commentaryRuns}>{comm.runs} run{comm.runs > 1 ? 's' : ''}</Text>
            )}
          </View>
          <Text style={styles.commentaryText}>{comm.english}</Text>
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
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            Match Details
          </Text>
          <View style={styles.placeholder} />
        </View>
      </ImageBackground>

      {/* 20% Scoreboard & Info Section */}
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
                    <Text style={styles.scoreMain}>
                      {team.runs}/{team.wickets || 0}
                    </Text>
                    {team.overs && (
                      <Text style={styles.oversText}>({team.overs})</Text>
                    )}
                  </>
                ) : (
                  <Text style={styles.yetToBat}>Yet to bat</Text>
                )}
              </View>
            </View>
          ))}
        </View>

        {/* Floating Scoreboard Button (Pro Feature) */}
        {match.status === 'live' && (
          <TouchableOpacity
            style={[
              styles.floatingScoreboardButton,
              !isPro && styles.floatingScoreboardButtonLocked,
            ]}
            onPress={handleFloatingScoreboardToggle}
          >
            <Ionicons
              name={showFloatingScoreboard ? "tv" : "tv-outline"}
              size={16}
              color={isPro ? '#FFF' : '#999'}
            />
            <Text
              style={[
                styles.floatingScoreboardButtonText,
                !isPro && styles.floatingScoreboardButtonTextLocked,
              ]}
            >
              {isPro ? 'Floating Score' : '🔒 Pro Only'}
            </Text>
          </TouchableOpacity>
        )}

        {match.result && (
          <View style={[styles.resultContainer, match.status === 'live' && styles.liveResultContainer]}>
            <Ionicons
              name={match.status === 'live' ? 'pulse' : 'trophy'}
              size={18}
              color={match.status === 'live' ? '#FF4444' : '#FFD700'}
            />
            <Text style={[styles.resultText, match.status === 'live' && styles.liveResultText]}>
              {match.result}
            </Text>
          </View>
        )}
      </View>

      <ImageBackground
        source={require('../../assets/images/wallpaper.png')}
        style={styles.contentBackground}
        resizeMode="repeat"
      >
        <Animated.ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: false }
          )}
          scrollEventThrottle={16}
        >
          {/* 20% Cricket Field (Scrollable) */}
          {shouldShowCricketField() && (
            <Animated.View style={{ opacity: fieldOpacity }}>
              <CricketField
                lastCommentary={match.commentary?.[0]}
                battingTeam={match.teams[0]?.shortName}
                bowlingTeam={match.teams[1]?.shortName}
              />
            </Animated.View>
          )}

          {/* 60% Live Commentary Section */}
          {shouldShowCommentary() && (
            <View style={styles.commentarySection}>
              <Text style={styles.sectionTitle}>Live Commentary</Text>
              {match.status === 'live' && (
                <View style={styles.autoRefreshBanner}>
                  <Ionicons name="sync" size={14} color="#FFF" />
                  <Text style={styles.autoRefreshText}>Auto-refreshing every 50 seconds</Text>
                </View>
              )}
              {renderCommentaryWithAds()}
            </View>
          )}

          <View style={styles.bottomPadding} />
        </Animated.ScrollView>
      </ImageBackground>

      {/* Floating Scoreboard */}
      {match && isPro && showFloatingScoreboard && (
        <FloatingScoreboard
          match={match}
          visible={showFloatingScoreboard}
          onClose={() => setShowFloatingScoreboard(false)}
          isPro={isPro}
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
  // 20% Scoreboard Section
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
    marginTop: 4,
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
  // Content Section
  contentBackground: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  // 60% Commentary Section
  commentarySection: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    padding: 16,
    minHeight: SCREEN_HEIGHT * 0.6,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 12,
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
  },
  commentaryText: {
    fontSize: 13,
    color: '#333',
    lineHeight: 18,
  },
  // Banner Ad Styles
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
    textTransform: 'uppercase',
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
    height: 30,
  },
});
