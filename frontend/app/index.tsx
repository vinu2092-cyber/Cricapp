import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ImageBackground,
  Modal,
  Alert,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Match } from '../src/types/match';
import MatchCard from '../src/components/MatchCard';
import Header from '../src/components/Header';
import Footer from '../src/components/Footer';
import LoadingScreen from '../src/components/LoadingScreen';
import ErrorScreen from '../src/components/ErrorScreen';
import { useAdMob } from '../src/context/AdMobContext';
import { usePro } from '../src/context/ProContext';
import {
  fetchLiveMatches,
  fetchRecentMatches,
  fetchUpcomingMatches,
} from '../src/services/api';

type TabType = 'live' | 'recent' | 'upcoming';
type CategoryType = 'all' | 'international' | 'league' | 'domestic' | 'women';

const AUTO_REFRESH_INTERVAL = 60000;

export default function Index() {
  const router = useRouter();
  const { trackClick, showRewardedAd, adsWatchedCount, isRewardedAdReady, isRewardedAdLoading } = useAdMob();
  const { isPro, setProFromAdMob } = usePro();
  
  const [activeTab, setActiveTab] = useState<TabType>('live');
  const [selectedCategory, setSelectedCategory] = useState<CategoryType>('all');
  const [filteredMatches, setFilteredMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showProModal, setShowProModal] = useState(false);

  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // In-memory cache per tab so switching doesn't trigger loading spinner
  const tabCacheRef = useRef<Record<TabType, Match[]>>({ live: [], recent: [], upcoming: [] });

  // Fetch matches - returns cached data instantly if available, then refreshes in background
  const fetchMatches = async (tab: TabType, forceRefresh = false) => {
    try {
      let fetchedMatches: Match[] = [];
      
      switch (tab) {
        case 'live':
          fetchedMatches = await fetchLiveMatches();
          break;
        case 'recent':
          fetchedMatches = await fetchRecentMatches();
          break;
        case 'upcoming':
          fetchedMatches = await fetchUpcomingMatches();
          break;
      }
      
      // API already provides category from typeMatches - just normalize
      const matchesWithCategory = fetchedMatches.map(match => ({
        ...match,
        category: match.category || categorizeMatch(match.matchFormat || match.matchType || 'T20', match.seriesName || match.series || ''),
      }));
      
      // Save to in-memory cache
      if (matchesWithCategory.length > 0) {
        tabCacheRef.current[tab] = matchesWithCategory;
      }
      return matchesWithCategory;
    } catch (err) {
      console.error('Error fetching matches:', err);
      throw err;
    }
  };

  // Categorize match type
  const categorizeMatch = (matchType: string, seriesName: string): string => {
    const lowerMatchType = matchType.toLowerCase();
    const lowerSeriesName = seriesName.toLowerCase();
    
    if (lowerSeriesName.includes('women') || lowerMatchType === 'women') return 'Women';
    if (lowerMatchType === 'league' || lowerMatchType === 't20' ||
        lowerSeriesName.includes('ipl') || lowerSeriesName.includes('indian premier') ||
        lowerSeriesName.includes('bbl') || lowerSeriesName.includes('psl') ||
        lowerSeriesName.includes('cpl') || lowerSeriesName.includes('sa20') ||
        lowerSeriesName.includes('bpl') || lowerSeriesName.includes('hundred') ||
        lowerSeriesName.includes('premier league') || lowerSeriesName.includes('super league')) {
      return 'League';
    }
    if (lowerMatchType === 'international' || lowerMatchType === 'test' || lowerMatchType === 'odi') return 'International';
    return 'Domestic';
  };

  // Auto-refresh for live matches
  useEffect(() => {
    if (activeTab === 'live') {
      autoRefreshRef.current = setInterval(() => {
        fetchMatches('live').then(data => {
          if (activeTab === 'live') applyCategory(data, selectedCategory);
        }).catch(console.error);
      }, AUTO_REFRESH_INTERVAL);

      return () => {
        if (autoRefreshRef.current) {
          clearInterval(autoRefreshRef.current);
        }
      };
    } else {
      if (autoRefreshRef.current) {
        clearInterval(autoRefreshRef.current);
        autoRefreshRef.current = null;
      }
    }
  }, [activeTab]);

  // Apply category filter
  const applyCategory = (matches: Match[], category: CategoryType) => {
    if (category === 'all') {
      setFilteredMatches(matches);
    } else {
      setFilteredMatches(matches.filter(m => m.category?.toLowerCase() === category));
    }
  };

  // Initial load and tab changes - show cached data instantly, refresh in background
  useEffect(() => {
    const loadMatches = async () => {
      // If we have cached data for this tab, show it immediately (no loading spinner)
      const cached = tabCacheRef.current[activeTab];
      if (cached.length > 0) {
        applyCategory(cached, selectedCategory);
        // Background refresh
        fetchMatches(activeTab).then(data => {
          if (data.length > 0) applyCategory(data, selectedCategory);
        }).catch(console.error);
        return;
      }
      
      // First load - show spinner
      try {
        setLoading(true);
        setError(null);
        const data = await fetchMatches(activeTab);
        applyCategory(data, selectedCategory);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load matches');
      } finally {
        setLoading(false);
      }
    };

    loadMatches();
  }, [activeTab]);

  // Re-filter when category changes
  useEffect(() => {
    const cached = tabCacheRef.current[activeTab];
    applyCategory(cached, selectedCategory);
  }, [selectedCategory]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      const data = await fetchMatches(activeTab, true);
      applyCategory(data, selectedCategory);
    } catch (err) {
      console.error('Refresh error:', err);
    } finally {
      setRefreshing(false);
    }
  };

  const handleRetry = () => {
    setLoading(true);
    setError(null);
    fetchMatches(activeTab, true)
      .then(data => applyCategory(data, selectedCategory))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  };

  const handleMatchPress = (matchId: string) => {
    trackClick();
    router.push(`/match/${matchId}`);
  };

  if (loading) {
    return <LoadingScreen message="Loading cricket matches..." />;
  }

  if (error) {
    return <ErrorScreen message={error} onRetry={handleRetry} />;
  }

  return (
    <View style={styles.container}>
      <Header onUnlockPro={() => setShowProModal(true)} />

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        {(['live', 'recent', 'upcoming'] as TabType[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.activeTab]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
              {tab.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Category Filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryFilter} contentContainerStyle={styles.categoryFilterContent}>
        {(['all', 'international', 'league', 'domestic', 'women'] as CategoryType[]).map((category) => (
          <TouchableOpacity
            key={category}
            style={[styles.categoryChip, selectedCategory === category && styles.activeCategoryChip]}
            onPress={() => setSelectedCategory(category)}
          >
            <Text style={[styles.categoryText, selectedCategory === category && styles.activeCategoryText]}>
              {category.charAt(0).toUpperCase() + category.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Auto-refresh indicator */}
      {activeTab === 'live' && (
        <View style={styles.autoRefreshBanner}>
          <Text style={styles.autoRefreshText}>Auto-refreshing every 60 seconds</Text>
        </View>
      )}

      {/* Match List */}
      <ImageBackground
        source={require('../assets/images/wallpaper.png')}
        style={styles.wallpaperBackground}
        resizeMode="repeat"
      >
        <FlatList
          data={filteredMatches}
          keyExtractor={(item) => item.matchId}
          renderItem={({ item }) => (
            <MatchCard
              match={item}
              onPress={() => handleMatchPress(item.matchId)}
            />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="baseball-outline" size={48} color="#999" />
              <Text style={styles.emptyText}>
                {activeTab === 'live' ? 'No live matches right now' : 
                 activeTab === 'upcoming' ? 'No upcoming matches' : 'No recent matches'}
              </Text>
              <Text style={styles.emptySubtext}>Pull down to refresh</Text>
              {activeTab === 'live' && (
                <TouchableOpacity
                  style={styles.switchTabBtn}
                  onPress={() => setActiveTab('recent')}
                >
                  <Text style={styles.switchTabText}>Check Recent Matches</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      </ImageBackground>

      <Footer />

      {/* Pro Unlock Modal - Direct Ad Watching Flow */}
      <Modal
        visible={showProModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowProModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.proModalContainer}>
            {isPro ? (
              <>
                <Ionicons name="checkmark-circle" size={50} color="#4CAF50" />
                <Text style={styles.proModalTitle}>PRO Active!</Text>
                <Text style={styles.proModalSubtitle}>
                  Voice Commentary, Floating Scoreboard, and Ad-free browsing are unlocked for 30 minutes.
                </Text>
                <TouchableOpacity
                  style={styles.proModalButton}
                  onPress={() => setShowProModal(false)}
                >
                  <Text style={styles.proModalButtonText}>Continue</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.proModalTitle}>Unlock Pro Features</Text>
                
                <View style={styles.proFeaturesList}>
                  <View style={styles.proFeatureItem}>
                    <Ionicons name="mic" size={20} color="#4CAF50" />
                    <Text style={styles.proFeature}>Voice Commentary (TTS)</Text>
                  </View>
                  <View style={styles.proFeatureItem}>
                    <Ionicons name="layers" size={20} color="#4CAF50" />
                    <Text style={styles.proFeature}>Draggable Floating Scoreboard</Text>
                  </View>
                  <View style={styles.proFeatureItem}>
                    <Ionicons name="notifications" size={20} color="#4CAF50" />
                    <Text style={styles.proFeature}>Score in Notification Bar</Text>
                  </View>
                  <View style={styles.proFeatureItem}>
                    <Ionicons name="close-circle" size={20} color="#4CAF50" />
                    <Text style={styles.proFeature}>No Click Ads for 30 mins</Text>
                  </View>
                </View>

                {/* Progress Bar */}
                <View style={styles.progressContainer}>
                  <View style={styles.progressBar}>
                    <View style={[styles.progressFill, { width: `${(adsWatchedCount / 3) * 100}%` }]} />
                  </View>
                  <Text style={styles.progressText}>{adsWatchedCount}/3 Ads Watched</Text>
                </View>
                
                <TouchableOpacity
                  style={[
                    styles.watchAdButton,
                    (!isRewardedAdReady && !isRewardedAdLoading) && styles.watchAdButtonDisabled
                  ]}
                  onPress={async () => {
                    const success = await showRewardedAd();
                    if (success) {
                      // Check if this was the 3rd ad (count will be 0 after reset in context)
                      if (adsWatchedCount >= 2) {
                        Alert.alert(
                          'PRO Unlocked!',
                          'Voice Commentary, Floating Scoreboard, and Ad-free mode active for 30 minutes!',
                          [{ text: 'Awesome!', onPress: () => setShowProModal(false) }]
                        );
                      } else {
                        Alert.alert('Great!', `${adsWatchedCount + 1}/3 ads watched. Keep going!`);
                      }
                    }
                  }}
                  data-testid="watch-ad-button"
                >
                  <Ionicons name="play-circle" size={24} color="#FFF" />
                  <Text style={styles.watchAdText}>
                    {isRewardedAdLoading
                      ? 'Loading Ad...'
                      : isRewardedAdReady
                        ? `Watch Ad ${adsWatchedCount + 1} of 3`
                        : 'Preparing Ad...'}
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.proModalCancelButton}
                  onPress={() => setShowProModal(false)}
                >
                  <Text style={styles.proModalCancelText}>Maybe Later</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5dc',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    elevation: 2,
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 3,
    borderBottomColor: '#4CAF50',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  activeTabText: {
    color: '#4CAF50',
  },
  categoryFilter: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    maxHeight: 52,
  },
  categoryFilterContent: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
  },
  activeCategoryChip: {
    backgroundColor: '#4CAF50',
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  activeCategoryText: {
    color: '#fff',
  },
  autoRefreshBanner: {
    backgroundColor: '#E8F5E9',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#C8E6C9',
  },
  autoRefreshText: {
    fontSize: 12,
    color: '#2E7D32',
    textAlign: 'center',
    fontWeight: '500',
  },
  wallpaperBackground: {
    flex: 1,
  },
  listContent: {
    paddingVertical: 8,
  },
  emptyContainer: {
    padding: 48,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    color: '#666',
    marginTop: 16,
    fontWeight: '600',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
  switchTabBtn: {
    marginTop: 16,
    backgroundColor: '#4CAF50',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
  },
  switchTabText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
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
    gap: 12,
  },
  proFeatureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  proFeature: {
    fontSize: 16,
    color: '#555',
  },
  proModalSubtitle: {
    fontSize: 14,
    color: '#777',
    textAlign: 'center',
    marginBottom: 20,
  },
  proModalButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 10,
    paddingVertical: 15,
    paddingHorizontal: 30,
    marginBottom: 10,
    marginTop: 10,
  },
  proModalButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  watchAdButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 30,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    elevation: 4,
  },
  watchAdButtonDisabled: {
    backgroundColor: '#9E9E9E',
  },
  watchAdText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  progressContainer: {
    width: '100%',
    marginVertical: 16,
    alignItems: 'center',
  },
  progressBar: {
    width: '100%',
    height: 10,
    backgroundColor: '#E0E0E0',
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 5,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4CAF50',
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
