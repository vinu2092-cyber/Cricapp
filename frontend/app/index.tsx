import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  ImageBackground,
  FlatList,
  RefreshControl,
  Text,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Header from '../src/components/Header';
import Footer from '../src/components/Footer';
import TabBar from '../src/components/TabBar';
import MatchCard from '../src/components/MatchCard';
import AdModal from '../src/components/AdModal';
import LoadingScreen from '../src/components/LoadingScreen';
import ErrorScreen from '../src/components/ErrorScreen';
import { usePro } from '../src/context/ProContext';
import { fetchAllMatches, simulateLiveScoreUpdate } from '../src/services/api';
import { Match, MatchStatus } from '../src/types/match';

const AUTO_REFRESH_INTERVAL = 10000; // 10 seconds for live matches

export default function Index() {
  const router = useRouter();
  const { startAdChallenge, isWatchingAds } = usePro();
  
  const [activeTab, setActiveTab] = useState<MatchStatus>('live');
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdModal, setShowAdModal] = useState(false);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadMatches = async () => {
    try {
      setError(false);
      const data = await fetchAllMatches();
      setMatches(data);
    } catch (err) {
      console.error('Error loading matches:', err);
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadMatches();
  }, []);

  // Auto-refresh for live matches
  useEffect(() => {
    if (activeTab === 'live') {
      // Start auto-refresh
      autoRefreshRef.current = setInterval(() => {
        setMatches((prevMatches) => {
          return prevMatches.map((match) => {
            if (match.status === 'live') {
              return simulateLiveScoreUpdate(match);
            }
            return match;
          });
        });
      }, AUTO_REFRESH_INTERVAL);
    } else {
      // Clear auto-refresh when not on live tab
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
  }, [activeTab]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadMatches();
  }, []);

  const handleUnlockPro = () => {
    startAdChallenge();
    setShowAdModal(true);
  };

  const handleMatchPress = (match: Match) => {
    router.push({
      pathname: '/match/[id]',
      params: { id: match.matchId },
    });
  };

  const filteredMatches = matches.filter((match) => match.status === activeTab);

  if (loading) {
    return <LoadingScreen />;
  }

  if (error) {
    return (
      <ErrorScreen
        onGoBack={() => {
          setLoading(true);
          loadMatches();
        }}
        message="Could not load matches. Pull to refresh."
      />
    );
  }

  const renderEmptyList = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyText}>
        No {activeTab} matches available
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.content}>
        <Header onUnlockPro={handleUnlockPro} />
        <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
        
        {/* Auto-refresh indicator for live tab */}
        {activeTab === 'live' && filteredMatches.length > 0 && (
          <View style={styles.autoRefreshBanner}>
            <Text style={styles.autoRefreshText}>
              Auto-refreshing every 10 seconds
            </Text>
          </View>
        )}
        
        <ImageBackground
          source={require('../assets/images/wallpaper.png')}
          style={styles.matchesBackground}
          resizeMode="repeat"
        >
          <FlatList
            data={filteredMatches}
            keyExtractor={(item) => item.matchId}
            renderItem={({ item }) => (
              <MatchCard
                match={item}
                onPress={() => handleMatchPress(item)}
              />
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#4CAF50"
                colors={['#4CAF50']}
              />
            }
            ListEmptyComponent={renderEmptyList}
          />
        </ImageBackground>
        
        <Footer />
      </View>
      
      <AdModal
        visible={showAdModal || isWatchingAds}
        onClose={() => setShowAdModal(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  content: {
    flex: 1,
  },
  matchesBackground: {
    flex: 1,
  },
  listContent: {
    paddingVertical: 8,
    paddingBottom: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  autoRefreshBanner: {
    backgroundColor: '#FF4444',
    paddingVertical: 6,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  autoRefreshText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
});
