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
  fetchUpcomingMatches 
} from '../src/services/api';

type TabType = 'live' | 'recent' | 'upcoming';
type CategoryType = 'all' | 'international' | 'league' | 'domestic';

const AUTO_REFRESH_INTERVAL = 60000;

export default function Index() {
  const router = useRouter();
  const { trackClick } = useAdMob();
  const { isPro } = usePro();
  
  const [activeTab, setActiveTab] = useState<TabType>('live');
  const [selectedCategory, setSelectedCategory] = useState<CategoryType>('all');
  const [matches, setMatches] = useState<Match[]>([]);
  const [filteredMatches, setFilteredMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showProModal, setShowProModal] = useState(false);

  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch matches using direct API
  const fetchMatches = async (tab: TabType) => {
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
      
      const matchesWithCategory = fetchedMatches.map(match => ({
        ...match,
        category: categorizeMatch(match.matchFormat || 'T20', match.seriesName || match.series || ''),
      }));
      
      setMatches(matchesWithCategory);
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
    
    if (lowerMatchType === 'women') return 'Women';
    if (lowerMatchType === 'league' || 
        lowerSeriesName.includes('ipl') || 
        lowerSeriesName.includes('bbl') || 
        lowerSeriesName.includes('psl') ||
        lowerSeriesName.includes('cpl')) {
      return 'League';
    }
    if (lowerMatchType === 'international' || lowerMatchType === 'test' || lowerMatchType === 'odi') return 'International';
    return 'Domestic';
  };

  // Auto-refresh for live matches
  useEffect(() => {
    if (activeTab === 'live') {
      autoRefreshRef.current = setInterval(() => {
        fetchMatches('live').catch(console.error);
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

  // Initial load and tab changes
  useEffect(() => {
    const loadMatches = async () => {
      try {
        setLoading(true);
        setError(null);
        await fetchMatches(activeTab);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load matches');
      } finally {
        setLoading(false);
      }
    };

    loadMatches();
  }, [activeTab]);

  // Filter matches by category
  useEffect(() => {
    if (selectedCategory === 'all') {
      setFilteredMatches(matches);
    } else {
      const filtered = matches.filter(
        (match) => match.category?.toLowerCase() === selectedCategory
      );
      setFilteredMatches(filtered);
    }
  }, [matches, selectedCategory]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchMatches(activeTab);
    } catch (err) {
      console.error('Refresh error:', err);
    } finally {
      setRefreshing(false);
    }
  };

  const handleRetry = () => {
    setLoading(true);
    setError(null);
    fetchMatches(activeTab)
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
      <View style={styles.categoryFilter}>
        {(['all', 'international', 'league', 'domestic'] as CategoryType[]).map((category) => (
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
      </View>

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
              <Text style={styles.emptyText}>No matches found</Text>
              <Text style={styles.emptySubtext}>Pull down to refresh</Text>
            </View>
          }
        />
      </ImageBackground>

      <Footer />

      {/* Pro Unlock Modal */}
      <Modal
        visible={showProModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowProModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.proModalContainer}>
            <Text style={styles.proModalTitle}>Unlock Pro Features</Text>
            
            <View style={styles.proFeaturesList}>
              <View style={styles.proFeatureItem}>
                <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                <Text style={styles.proFeature}>Voice Commentary</Text>
              </View>
              <View style={styles.proFeatureItem}>
                <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                <Text style={styles.proFeature}>Floating Scoreboard</Text>
              </View>
              <View style={styles.proFeatureItem}>
                <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                <Text style={styles.proFeature}>No Click Ads for 30 mins</Text>
              </View>
            </View>
            
            <Text style={styles.proModalSubtitle}>
              Watch 3 short ads to unlock Pro for 30 minutes
            </Text>
            
            <TouchableOpacity
              style={styles.proModalButton}
              onPress={() => {
                setShowProModal(false);
                if (filteredMatches.length > 0 && filteredMatches[0].status === 'live') {
                  router.push(`/match/${filteredMatches[0].matchId}`);
                }
              }}
            >
              <Text style={styles.proModalButtonText}>Go to Live Match</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.proModalCancelButton}
              onPress={() => setShowProModal(false)}
            >
              <Text style={styles.proModalCancelText}>Maybe Later</Text>
            </TouchableOpacity>
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
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
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
