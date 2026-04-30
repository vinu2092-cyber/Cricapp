import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  ActivityIndicator,
  AppState,
  TextInput,
  Keyboard,
  Share,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Match } from '../src/types/match';
import MatchCard from '../src/components/MatchCard';
import Header from '../src/components/Header';
import Footer from '../src/components/Footer';
import ErrorScreen from '../src/components/ErrorScreen';
import AppBackground from '../src/components/AppBackground';
import { useAdMob } from '../src/context/AdMobContext.native';
import { usePro } from '../src/context/ProContext';
import {
  fetchLiveMatches,
  fetchRecentMatches,
  fetchUpcomingMatches,
} from '../src/services/api';

type TabType = 'live' | 'recent' | 'upcoming';

// ---- LEAGUE CATEGORIES (horizontal scroll tabs) ----
const LEAGUE_TABS = [
  { key: 'international', label: 'International' },
  { key: 'ipl', label: 'IPL' },
  { key: 'bbl', label: 'BBL' },
  { key: 'uae', label: 'UAE T20' },
  { key: 'psl', label: 'PSL' },
  { key: 'bpl', label: 'BPL' },
  { key: 'cpl', label: 'CPL' },
  { key: 'sa20', label: 'SA20' },
  { key: 'hundred', label: 'The Hundred' },
  { key: 'mlc', label: 'MLC' },
  { key: 't10', label: 'T10' },
  { key: 'women', label: 'Women' },
  { key: 'domestic', label: 'Domestic' },
  { key: 'other', label: 'Other' },
] as const;

type LeagueCategoryKey = typeof LEAGUE_TABS[number]['key'];

const AUTO_REFRESH_INTERVAL = 30000; // 30 seconds
const CACHE_FLUSH_INTERVAL = 1800000; // 30 minutes

export default function Index() {
  const router = useRouter();
  const { trackClick, showRewardedAd } = useAdMob();
  const { isPro, adsWatched, setProFromAdMob, canShareUnlockToday, markSharedUnlockToday } = usePro();
  
  const [activeTab, setActiveTab] = useState<TabType>('live');
  const [selectedLeague, setSelectedLeague] = useState<LeagueCategoryKey>('international');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchActive, setSearchActive] = useState(false);
  const [filteredMatches, setFilteredMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showProModal, setShowProModal] = useState(false);
  const [localAdsWatched, setLocalAdsWatched] = useState(0);
  const [adLoading, setAdLoading] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);

  // Refs for timers - important for cleanup
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cacheFlushRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef(AppState.currentState);
  
  // In-memory cache per tab
  const tabCacheRef = useRef<Record<TabType, Match[]>>({ live: [], recent: [], upcoming: [] });

  // Clear all cache and reset state - memory optimization
  const flushAllCache = useCallback(() => {
    console.log('[Memory] Flushing all cache (30 min interval)');
    tabCacheRef.current = { live: [], recent: [], upcoming: [] };
    setFilteredMatches([]);
  }, []);

  // Fetch matches with state cleanup before update
  const fetchMatches = async (tab: TabType, forceRefresh = false) => {
    try {
      // Clear previous state before fetching - prevents memory bloat
      if (forceRefresh) {
        tabCacheRef.current[tab] = [];
      }
      
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
      
      // ALWAYS use our own fine-grained categorization based on series name.
      // API-provided `category` is too coarse (just "International"/"League"/"Domestic"/"Women"),
      // which means IPL/BBL/PSL/etc all get lumped into "League" and filter fails on 'ipl' tab.
      const matchesWithCategory: Match[] = fetchedMatches.map(match => ({
        ...match,
        category: categorizeMatch(
          match.matchFormat || match.matchType || 'T20',
          match.seriesName || match.series || ''
        ) as any,
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

  // ---- Comprehensive match categorization ----
  const categorizeMatch = (matchType: string, seriesName: string): LeagueCategoryKey => {
    const mt = (matchType || '').toLowerCase();
    const sn = (seriesName || '').toLowerCase();

    // Women's matches (check FIRST — women's IPL should go to Women, not IPL)
    if (sn.includes('women') || sn.includes('wpl') || sn.includes("women's") || mt.includes('women')) return 'women';

    // IPL
    if (sn.includes('ipl') || sn.includes('indian premier league') || sn.includes('tata ipl')) return 'ipl';

    // BBL / Big Bash
    if (sn.includes('bbl') || sn.includes('big bash')) return 'bbl';

    // UAE T20 / ILT20
    if (sn.includes('ilt20') || sn.includes('dp world') || (sn.includes('uae') && sn.includes('t20'))) return 'uae';

    // PSL / Pakistan Super League
    if (sn.includes('psl') || sn.includes('pakistan super league')) return 'psl';

    // BPL / Bangladesh Premier League
    if (sn.includes('bpl') || sn.includes('bangladesh premier')) return 'bpl';

    // CPL / Caribbean Premier League
    if (sn.includes('cpl') || sn.includes('caribbean premier')) return 'cpl';

    // SA20
    if (sn.includes('sa20') || sn.includes('sa 20')) return 'sa20';

    // The Hundred
    if (sn.includes('hundred') || sn.includes('the hundred')) return 'hundred';

    // MLC / Major League Cricket
    if (sn.includes('mlc') || sn.includes('major league cricket')) return 'mlc';

    // T10 leagues
    if (mt.includes('t10') || sn.includes('t10') || sn.includes('abu dhabi t10')) return 't10';

    // International: Test, ODI, T20I, ICC events
    if (mt === 'test' || mt === 'odi' || mt === 't20i' || mt === 'international' ||
        sn.includes('icc') || sn.includes('world cup') || sn.includes('asia cup') ||
        sn.includes('champions trophy') || sn.includes('world test') ||
        sn.includes(' tour ') || sn.includes(' series ') ||
        sn.includes(' trophy') || sn.includes(' tri-series') ||
        (mt === 't20' && !sn.includes('league') && !sn.includes('premier'))) return 'international';

    // Known domestic/franchise leagues
    if (sn.includes('vitality') || sn.includes('county') || sn.includes('ranji') ||
        sn.includes('sheffield') || sn.includes('plunket') || sn.includes('super smash') ||
        sn.includes('marsh') || sn.includes('duleep') || sn.includes('deodhar') ||
        sn.includes('vijay hazare') || sn.includes('syed mushtaq')) return 'domestic';

    // Other franchise T20 leagues not specifically categorized
    if (sn.includes('league') || sn.includes('premier') || sn.includes('super')) return 'other';

    // Default: if matchType is "League" put in other, else domestic
    if (mt === 'league' || mt === 't20') return 'other';
    return 'domestic';
  };

  // Auto-refresh for live matches + 30-minute cache flush
  useEffect(() => {
    // 30-minute cache flush timer
    cacheFlushRef.current = setInterval(() => {
      flushAllCache();
      fetchMatches(activeTab, true).then(data => {
        applyLeagueFilter(data, selectedLeague, searchQuery);
      }).catch(console.error);
    }, CACHE_FLUSH_INTERVAL);

    if (activeTab === 'live') {
      autoRefreshRef.current = setInterval(() => {
        tabCacheRef.current['live'] = [];
        fetchMatches('live', true).then(data => {
          if (activeTab === 'live') applyLeagueFilter(data, selectedLeague, searchQuery);
        }).catch(console.error);
      }, AUTO_REFRESH_INTERVAL);
    }

    // Cleanup on unmount or tab change - kills all background fetching
    return () => {
      if (autoRefreshRef.current) {
        clearInterval(autoRefreshRef.current);
        autoRefreshRef.current = null;
      }
      if (cacheFlushRef.current) {
        clearInterval(cacheFlushRef.current);
        cacheFlushRef.current = null;
      }
    };
  }, [activeTab, selectedLeague, searchQuery]);

  // App state listener for background/foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
        // App came to foreground - refresh data
        console.log('[Memory] App foregrounded - refreshing');
        fetchMatches(activeTab, true).then(data => {
          applyLeagueFilter(data, selectedLeague, searchQuery);
        }).catch(console.error);
      }
      appStateRef.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [activeTab, selectedLeague, searchQuery]);

  // Search aliases for common short forms
  const SEARCH_ALIASES: Record<string, string[]> = {
    'ipl': ['indian premier league', 'tata ipl'],
    'bbl': ['big bash', 'big bash league'],
    'psl': ['pakistan super league'],
    'bpl': ['bangladesh premier', 'bangladesh premier league'],
    'cpl': ['caribbean premier', 'caribbean premier league'],
    't20': ['twenty20', 't20i'],
    'odi': ['one day', 'one-day'],
    'wpl': ['women premier league', "women's premier"],
    'sa20': ['sa 20'],
    'mlc': ['major league cricket'],
    'ind': ['india'],
    'aus': ['australia'],
    'eng': ['england'],
    'pak': ['pakistan'],
    'nz': ['new zealand'],
    'sa': ['south africa'],
    'sl': ['sri lanka'],
    'wi': ['west indies'],
    'ban': ['bangladesh'],
    'afg': ['afghanistan'],
  };

  // Apply league tab filter + search
  const applyLeagueFilter = (matches: Match[], league: LeagueCategoryKey, query: string) => {
    let result = matches;

    // Apply search filter if active (takes priority - search ALL matches, ignore league filter)
    if (query.trim().length > 0) {
      const q = query.toLowerCase().trim();
      
      // Expand query with aliases
      const expandedQueries = [q, ...(SEARCH_ALIASES[q] || [])];
      
      result = matches.filter(m => {
        const searchFields = [
          m.seriesName, m.series, m.matchDesc, m.matchType, m.matchFormat,
          m.venue, m.city, m.category,
          ...(m.teams || []).map(t => t.name),
          ...(m.teams || []).map(t => t.shortName),
        ].filter(Boolean).join(' ').toLowerCase();
        
        // Match if ANY expanded query matches
        return expandedQueries.some(eq => searchFields.includes(eq));
      });
    } else {
      // Filter by league category only when NOT searching
      result = result.filter(m => {
        // ALWAYS compute category from seriesName — never trust stored/API category here,
        // because API hands out coarse "League" labels which won't match 'ipl'/'bbl'/'psl'/etc.
        const cat = categorizeMatch(
          m.matchFormat || m.matchType || '',
          m.seriesName || m.series || ''
        ).toLowerCase();
        return cat === league;
      });
    }

    setFilteredMatches(result);
  };

  // Initial load and tab changes - show cached data instantly, refresh in background
  useEffect(() => {
    const loadMatches = async () => {
      // If we have cached data for this tab, show it immediately (no loading spinner)
      const cached = tabCacheRef.current[activeTab];
      if (cached.length > 0) {
        applyLeagueFilter(cached, selectedLeague, searchQuery);
        fetchMatches(activeTab).then(data => {
          if (data.length > 0) applyLeagueFilter(data, selectedLeague, searchQuery);
        }).catch(console.error);
        return;
      }
      
      try {
        setLoading(true);
        setError(null);
        const data = await fetchMatches(activeTab);
        applyLeagueFilter(data, selectedLeague, searchQuery);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load matches');
      } finally {
        setLoading(false);
      }
    };

    loadMatches();
  }, [activeTab]);

  // Re-filter when league or search changes
  useEffect(() => {
    const cached = tabCacheRef.current[activeTab] || [];
    if (cached.length > 0) {
      applyLeagueFilter(cached, selectedLeague, searchQuery);
    }
  }, [selectedLeague, searchQuery]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      const data = await fetchMatches(activeTab, true);
      applyLeagueFilter(data, selectedLeague, searchQuery);
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
      .then(data => applyLeagueFilter(data, selectedLeague, searchQuery))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  };

  const handleMatchPress = (matchId: string) => {
    trackClick();
    // Close search if active
    if (searchActive) {
      setSearchActive(false);
      setSearchQuery('');
      Keyboard.dismiss();
    }
    router.push(`/match/${matchId}`);
  };

  // v1.0.12 (2026-04-21 perf fix) — the full-screen "Loading cricket
  // matches…" spinner used to cover the ENTIRE UI (header, tabs, league
  // chips) on every first tab visit. Old-phone users reported this as
  // constant loading loops. We now always render the chrome immediately
  // and surface loading as a *small inline spinner* inside the list area
  // via <ListEmptyComponent> — tab switches feel instant because the
  // scaffold never disappears. Error state still uses the full ErrorScreen
  // since an error is a terminal state that blocks interaction anyway.

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

      {/* League Tabs with Fixed Search */}
      <View style={styles.leagueRow}>
        {/* Fixed Search Button/Bar */}
        {searchActive ? (
          <View style={styles.searchInputContainer}>
            <Ionicons name="search" size={18} color="#1976D2" />
            <TextInput
              style={styles.searchInput}
              placeholder="Team, League..."
              placeholderTextColor="#999"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
              returnKeyType="search"
            />
            <TouchableOpacity onPress={() => { setSearchActive(false); setSearchQuery(''); Keyboard.dismiss(); }}>
              <Ionicons name="close-circle" size={20} color="#999" />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.searchBtn} onPress={() => setSearchActive(true)}>
            <Ionicons name="search" size={20} color="#1976D2" />
          </TouchableOpacity>
        )}

        {/* Horizontal Scrollable League Tabs */}
        {!searchActive && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.leagueScroll} contentContainerStyle={styles.leagueScrollContent}>
            {LEAGUE_TABS.map((tab) => (
              <TouchableOpacity
                key={tab.key}
                style={[styles.leagueChip, selectedLeague === tab.key && styles.activeLeagueChip]}
                onPress={() => setSelectedLeague(tab.key)}
              >
                <Text style={[styles.leagueText, selectedLeague === tab.key && styles.activeLeagueText]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Auto-refresh indicator */}
      {activeTab === 'live' && !searchActive && (
        <View style={styles.autoRefreshBanner}>
          <Text style={styles.autoRefreshText}>Auto-refreshing every 30 seconds</Text>
        </View>
      )}

      {/* Match List */}
      <AppBackground style={styles.wallpaperBackground} resizeMode="repeat">
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
            loading ? (
              // v1.0.12 — inline spinner in the list slot so header +
              // tabs remain visible during first fetch / tab switch.
              <View style={styles.emptyContainer}>
                <ActivityIndicator size="large" color="#4CAF50" />
                <Text style={styles.emptyText}>Loading cricket matches…</Text>
              </View>
            ) : (
              <View style={styles.emptyContainer}>
                <Ionicons name="baseball-outline" size={48} color="#999" />
                <Text style={styles.emptyText}>
                  {searchActive && searchQuery
                    ? `No matches found for "${searchQuery}"`
                    : activeTab === 'live' ? 'No live matches in this category'
                    : activeTab === 'upcoming' ? 'No upcoming matches' : 'No recent matches'}
                </Text>
                <Text style={styles.emptySubtext}>
                  {searchActive ? 'Try a different search term' : 'Pull down to refresh or try another tab'}
                </Text>
              </View>
            )
          }
        />
      </AppBackground>

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
                <Text style={styles.proModalTitle}>Unlock Special Features</Text>
                
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
                    <View style={[styles.progressFill, { width: `${(localAdsWatched / 1) * 100}%` }]} />
                  </View>
                  <Text style={styles.progressText}>{localAdsWatched}/1 Ad Watched</Text>
                </View>
                
                <TouchableOpacity
                  style={[styles.watchAdButton, adLoading && { opacity: 0.6 }]}
                  disabled={adLoading}
                  onPress={async () => {
                    if (adLoading) return;
                    setAdLoading(true);
                    
                    const shown = await showRewardedAd();
                    setAdLoading(false);

                    if (shown) {
                      // Genuine ad watched → count progress
                      const next = localAdsWatched + 1;
                      setLocalAdsWatched(next);
                      if (next >= 1) {
                        setProFromAdMob(true);
                        setLocalAdsWatched(0);
                        Alert.alert(
                          'PRO Unlocked!',
                          'Voice Commentary, Floating Scoreboard, and Ad-free mode active for 30 minutes!',
                          [{ text: 'Awesome!', onPress: () => setShowProModal(false) }]
                        );
                      } else {
                        Alert.alert('Great!', `${next}/1 ad watched. ${1 - next} more to go!`);
                      }
                    }
                    // If ad failed, no progress. User must try again. NO automatic unlock.
                  }}
                  data-testid="watch-ad-button"
                >
                  {adLoading ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Ionicons name="play-circle" size={24} color="#FFF" />
                  )}
                  <Text style={styles.watchAdText}>
                    {adLoading ? 'Loading ad…' : `Watch Ad ${localAdsWatched + 1} of 1`}
                  </Text>
                </TouchableOpacity>

                {/* OR divider */}
                <View style={styles.orDividerRow}>
                  <View style={styles.orDividerLine} />
                  <Text style={styles.orDividerText}>OR</Text>
                  <View style={styles.orDividerLine} />
                </View>

                {/* Share to unlock 30 min Pro (v1.0.15) — 1/day quota */}
                <TouchableOpacity
                  style={[styles.shareUnlockButton, shareLoading && { opacity: 0.6 }]}
                  disabled={shareLoading}
                  onPress={async () => {
                    if (shareLoading) return;
                    setShareLoading(true);
                    try {
                      // Daily quota: only ONE share-unlock per device per day.
                      // Keeps AdMob revenue flowing (user must watch ad for
                      // further Pro sessions) while still giving a viral
                      // incentive once a day.
                      const allowed = await canShareUnlockToday();
                      if (!allowed) {
                        Alert.alert(
                          'Daily Share Limit Reached',
                          'Aap aaj ki free share unlock use kar chuke hain. Next 30 min Pro ke liye "Watch Ad" button use karein. Share quota kal reset hogi.'
                        );
                        return;
                      }
                      const result = await Share.share({
                        message:
                          'Hey! Check out CricApp — live cricket scores, commentary & more: https://play.google.com/store/apps/details?id=com.cricapp.live',
                        url: 'https://play.google.com/store/apps/details?id=com.cricapp.live',
                        title: 'CricApp — Live Cricket',
                      });
                      if (result.action === Share.sharedAction) {
                        await markSharedUnlockToday();
                        setProFromAdMob(true);
                        setLocalAdsWatched(0);
                        Alert.alert(
                          'PRO Unlocked!',
                          'Thanks for sharing! Voice Commentary, Floating Scoreboard and Ad-free mode are active for 30 minutes.',
                          [{ text: 'Awesome!', onPress: () => setShowProModal(false) }]
                        );
                      } else if (result.action === Share.dismissedAction) {
                        Alert.alert('Share Cancelled', 'Please share the app with a friend to unlock 30 mins Pro for free.');
                      }
                    } catch (err) {
                      console.warn('[Share] error:', err);
                    } finally {
                      setShareLoading(false);
                    }
                  }}
                  data-testid="share-unlock-pro-button"
                >
                  {shareLoading ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Ionicons name="share-social" size={22} color="#FFF" />
                  )}
                  <Text style={styles.shareUnlockText}>
                    {shareLoading ? 'Opening share…' : 'Share to unlock 30 min free (1/day)'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.proModalCancelButton}
                  onPress={() => { setShowProModal(false); setLocalAdsWatched(0); }}
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
  // League tabs + search row
  leagueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    paddingVertical: 6,
    paddingLeft: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#E0E0E0',
  },
  searchBtn: {
    width: 38,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 20,
    paddingHorizontal: 12,
    height: 36,
    marginRight: 8,
    gap: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    padding: 0,
  },
  leagueScroll: {
    flex: 1,
  },
  leagueScrollContent: {
    paddingRight: 12,
    gap: 6,
  },
  leagueChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F0F0F0',
  },
  activeLeagueChip: {
    backgroundColor: '#1976D2',
  },
  leagueText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#555',
  },
  activeLeagueText: {
    color: '#FFF',
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
  watchAdText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  orDividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 10,
    width: '100%',
  },
  orDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#DDD',
  },
  orDividerText: {
    marginHorizontal: 10,
    color: '#999',
    fontSize: 12,
    fontWeight: '700',
  },
  shareUnlockButton: {
    backgroundColor: '#1976D2',
    borderRadius: 25,
    paddingVertical: 14,
    paddingHorizontal: 28,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    elevation: 3,
  },
  shareUnlockText: {
    color: '#FFF',
    fontSize: 16,
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
});
