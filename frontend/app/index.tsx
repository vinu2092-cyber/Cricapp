import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  ImageBackground,
  FlatList,
  RefreshControl,
  Text,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Header from '../src/components/Header';
import Footer from '../src/components/Footer';
import TabBar from '../src/components/TabBar';
import MatchCard from '../src/components/MatchCard';
import AdModal from '../src/components/AdModal';
import LoadingScreen from '../src/components/LoadingScreen';
import ErrorScreen from '../src/components/ErrorScreen';
import FloatingScoreboard from '../src/components/FloatingScoreboard';
import { usePro } from '../src/context/ProContext';
import { useAdMob } from '../src/context/AdMobContext';
import { fetchAllMatches, simulateLiveScoreUpdate } from '../src/services/api';
import { Match, MatchStatus } from '../src/types/match';

const AUTO_REFRESH_INTERVAL = 10000; // 10 seconds for live matches

export default function Index() {
  const router = useRouter();
  const { isPro, startAdChallenge, isWatchingAds } = usePro();
  const { trackClick } = useAdMob();
  
  const [activeTab, setActiveTab] = useState<MatchStatus>('live');
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdModal, setShowAdModal] = useState(false);
  const [showFloatingScoreboard, setShowFloatingScoreboard] = useState(false);
  const [selectedLiveMatch, setSelectedLiveMatch] = useState<Match | null>(null);
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
        
        // Also update selected live match for floating scoreboard
        if (selectedLiveMatch) {
          setSelectedLiveMatch((prev) => {
            if (prev && prev.status === 'live') {
              return simulateLiveScoreUpdate(prev);
            }
            return prev;
          });
        }
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
  }, [activeTab, selectedLiveMatch]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadMatches();
  }, []);

  const handleUnlockPro = () => {
    trackClick(); // Track click for smart interstitial
    if (!isPro) {
      startAdChallenge();
      setShowAdModal(true);
    }
  };

  const handleMatchPress = (match: Match) => {
    trackClick(); // Track click for smart interstitial
    router.push({
      pathname: '/match/[id]',
      params: { id: match.matchId },
    });
  };

  const handlePopupPress = (match: Match) => {
    trackClick(); // Track click for smart interstitial
    if (isPro) {
      setSelectedLiveMatch(match);
      setShowFloatingScoreboard(true);
    } else {
      // Prompt to unlock Pro
      startAdChallenge();
      setShowAdModal(true);
    }
  };

  const handleTabChange = (tab: MatchStatus) => {
    trackClick(); // Track click for smart interstitial
    setActiveTab(tab);
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

  const renderMatchItem = ({ item }: { item: Match }) => (
    <View>
      <MatchCard
        match={item}
        onPress={() => handleMatchPress(item)}
      />
      {/* Pop-up button for live matches */}
      {activeTab === 'live' && item.status === 'live' && (
        <TouchableOpacity
          style={[
            styles.popupButton,
            isPro ? styles.popupButtonActive : styles.popupButtonInactive,
          ]}
          onPress={() => handlePopupPress(item)}
        >
          <Ionicons
            name="tv-outline"
            size={14}
            color={isPro ? '#FFF' : '#666'}
          />
          <Text style={[
            styles.popupButtonText,
            isPro ? styles.popupButtonTextActive : styles.popupButtonTextInactive,
          ]}>
            Pop-up
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.content}>
        <Header onUnlockPro={handleUnlockPro} />
        <TabBar activeTab={activeTab} onTabChange={handleTabChange} />
        
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
            renderItem={renderMatchItem}
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
      
      {/* Floating Scoreboard */}
      {selectedLiveMatch && (
        <FloatingScoreboard
          match={selectedLiveMatch}
          visible={showFloatingScoreboard}
          onClose={() => {
            setShowFloatingScoreboard(false);
            setSelectedLiveMatch(null);
          }}
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
  popupButton: {
    position: 'absolute',
    right: 24,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  popupButtonActive: {
    backgroundColor: '#4CAF50',
  },
  popupButtonInactive: {
    backgroundColor: '#E0E0E0',
  },
  popupButtonText: {
    fontSize: 11,
    fontWeight: '600',
  },
  popupButtonTextActive: {
    color: '#FFF',
  },
  popupButtonTextInactive: {
    color: '#666',
  },
});
