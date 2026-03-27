import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Match } from '../src/types/match';
import MatchCard from '../src/components/MatchCard';
import Header from '../src/components/Header';
import Footer from '../src/components/Footer';
import LoadingScreen from '../src/components/LoadingScreen';
import ErrorScreen from '../src/components/ErrorScreen';
import { AdMobProvider } from '../src/context/AdMobContext';
import { ProProvider } from '../src/context/ProContext';
import { getBackendUrl } from '../src/services/api';

type TabType = 'live' | 'recent' | 'upcoming';
type CategoryType = 'all' | 'international' | 'league' | 'domestic';

const BACKEND_URL = getBackendUrl();

// UPDATED: Auto-refresh reduced to 30 seconds
const AUTO_REFRESH_INTERVAL = 30000; // 30 seconds - Smart Fetching interval

export default function Index() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>('live');
  const [selectedCategory, setSelectedCategory] = useState<CategoryType>('all');
  const [matches, setMatches] = useState<Match[]>([]);
  const [filteredMatches, setFilteredMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastFetchTime = useRef<{ [key: string]: number }>({});
  
  // UPDATED: Cache duration reduced to 30 seconds
  const CACHE_DURATION = 30000; // 30 seconds cache - matches API refresh interval

  // Fetch matches from backend
  const fetchMatches = async (tab: TabType, forceRefresh = false) => {
    try {
      const cacheKey = `matches_${tab}`;
      const now = Date.now();

      // Check cache if not force refreshing
      if (!forceRefresh && lastFetchTime.current[cacheKey]) {
        const timeSinceLastFetch = now - lastFetchTime.current[cacheKey];
        if (timeSinceLastFetch < CACHE_DURATION) {
          console.log(`Using cached data for ${tab} (${Math.round(timeSinceLastFetch / 1000)}s old)`);
          
          // Try to load from AsyncStorage
          const cachedData = await AsyncStorage.getItem(cacheKey);
          if (cachedData) {
            const parsedMatches = JSON.parse(cachedData);
            setMatches(parsedMatches);
            return parsedMatches;
          }
        }
      }

      const endpoint = `${BACKEND_URL}/api/cricket/matches/${tab}`;
      console.log(`Fetching ${tab} matches from:`, endpoint);
      
      const response = await axios.get(endpoint, {
        timeout: 10000,
        headers: {
          'Accept': 'application/json',
        },
      });

      if (response.data && response.data.typeMatches) {
        const allMatches = extractMatches(response.data.typeMatches);
        setMatches(allMatches);
        
        // Cache the data
        await AsyncStorage.setItem(cacheKey, JSON.stringify(allMatches));
        lastFetchTime.current[cacheKey] = now;
        
        return allMatches;
      }
    } catch (err) {
      console.error('Error fetching matches:', err);
      
      // Try to use stale cache on error
      const cacheKey = `matches_${tab}`;
      const cachedData = await AsyncStorage.getItem(cacheKey);
      if (cachedData) {
        console.log('Using stale cache due to error');
        const parsedMatches = JSON.parse(cachedData);
        setMatches(parsedMatches);
        return parsedMatches;
      }
      
      throw err;
    }
  };

  // Start auto-refresh for live matches
  useEffect(() => {
    if (activeTab === 'live') {
      // Start auto-refresh
      autoRefreshRef.current = setInterval(() => {
        console.log('Auto-refreshing live matches...');
        fetchMatches('live', true).catch(console.error);
      }, AUTO_REFRESH_INTERVAL);

      return () => {
        if (autoRefreshRef.current) {
          clearInterval(autoRefreshRef.current);
          autoRefreshRef.current = null;
        }
      };
    } else {
      // Clear auto-refresh when not on live tab
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
        (match) => match.matchFormat.toLowerCase() === selectedCategory
      );
      setFilteredMatches(filtered);
    }
  }, [matches, selectedCategory]);

  // Extract matches from Cricbuzz API response
  const extractMatches = (typeMatches: any[]): Match[] => {
    const allMatches: Match[] = [];

    typeMatches.forEach((typeMatch) => {
      const matchType = typeMatch.matchType;
      typeMatch.seriesMatches?.forEach((seriesMatch: any) => {
        const seriesAdWrapper = seriesMatch.seriesAdWrapper;
        const seriesName = seriesAdWrapper.seriesName;

        seriesAdWrapper.matches?.forEach((match: any) => {
          const matchInfo = match.matchInfo;
          const matchScore = match.matchScore;

          allMatches.push({
            id: matchInfo.matchId.toString(),
            team1: matchInfo.team1.teamSName,
            team2: matchInfo.team2.teamSName,
            team1Score: matchScore?.team1Score?.inngs1
              ? `${matchScore.team1Score.inngs1.runs}/${matchScore.team1Score.inngs1.wickets} (${matchScore.team1Score.inngs1.overs})`
              : 'Yet to bat',
            team2Score: matchScore?.team2Score?.inngs1
              ? `${matchScore.team2Score.inngs1.runs}/${matchScore.team2Score.inngs1.wickets} (${matchScore.team2Score.inngs1.overs})`
              : 'Yet to bat',
            status: matchInfo.status || 'Scheduled',
            matchFormat: matchType,
            venue: matchInfo.venueInfo?.city || 'TBD',
            series: seriesName,
            startTime: matchInfo.startDate
              ? new Date(parseInt(matchInfo.startDate)).toLocaleString()
              : undefined,
            result: matchInfo.status,
            isLive: matchInfo.state === 'Live' || matchInfo.state === 'In Progress',
          });
        });
      });
    });

    return allMatches;
  };

  // Handle pull to refresh
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchMatches(activeTab, true);
    } catch (err) {
      console.error('Refresh error:', err);
    } finally {
      setRefreshing(false);
    }
  };

  // Handle retry
  const handleRetry = () => {
    setLoading(true);
    setError(null);
    fetchMatches(activeTab, true)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  if (loading) {
    return (
      <AdMobProvider>
        <ProProvider>
          <LoadingScreen message="Loading cricket matches..." />
        </ProProvider>
      </AdMobProvider>
    );
  }

  if (error) {
    return (
      <AdMobProvider>
        <ProProvider>
          <ErrorScreen message={error} onRetry={handleRetry} />
        </ProProvider>
      </AdMobProvider>
    );
  }

  return (
    <AdMobProvider>
      <ProProvider>
        <View style={styles.container}>
          <Header />

          {/* Tab Bar */}
          <View style={styles.tabBar}>
            <TouchableOpacity
              style={[
                styles.tab,
                activeTab === 'live' && styles.activeTab,
              ]}
              onPress={() => setActiveTab('live')}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'live' && styles.activeTabText,
                ]}
              >
                🔴 LIVE
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.tab,
                activeTab === 'recent' && styles.activeTab,
              ]}
              onPress={() => setActiveTab('recent')}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'recent' && styles.activeTabText,
                ]}
              >
                ✅ RECENT
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.tab,
                activeTab === 'upcoming' && styles.activeTab,
              ]}
              onPress={() => setActiveTab('upcoming')}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'upcoming' && styles.activeTabText,
                ]}
              >
                📅 UPCOMING
              </Text>
            </TouchableOpacity>
          </View>

          {/* Category Filter */}
          <View style={styles.categoryFilter}>
            {(['all', 'international', 'league', 'domestic'] as CategoryType[]).map(
              (category) => (
                <TouchableOpacity
                  key={category}
                  style={[
                    styles.categoryChip,
                    selectedCategory === category && styles.activeCategoryChip,
                  ]}
                  onPress={() => setSelectedCategory(category)}
                >
                  <Text
                    style={[
                      styles.categoryText,
                      selectedCategory === category && styles.activeCategoryText,
                    ]}
                  >
                    {category.charAt(0).toUpperCase() + category.slice(1)}
                  </Text>
                </TouchableOpacity>
              )
            )}
          </View>

          {/* Auto-refresh indicator for live matches */}
          {activeTab === 'live' && (
            <View style={styles.autoRefreshBanner}>
              <Text style={styles.autoRefreshText}>
                🔄 Auto-refreshing every 30 seconds
              </Text>
            </View>
          )}

          {/* Match List */}
          <FlatList
            data={filteredMatches}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <MatchCard
                match={item}
                onPress={() => router.push(`/match/${item.id}`)}
              />
            )}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No matches found</Text>
              </View>
            }
          />

          <Footer />
        </View>
      </ProProvider>
    </AdMobProvider>
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
  listContent: {
    paddingVertical: 8,
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
});
