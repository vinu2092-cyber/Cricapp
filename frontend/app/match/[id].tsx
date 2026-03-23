import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ImageBackground,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { fetchMatchById, simulateLiveScoreUpdate } from '../../src/services/api';
import { Match } from '../../src/types/match';
import ErrorScreen from '../../src/components/ErrorScreen';
import CommentarySection from '../../src/components/CommentarySection';
import LiveIndicator from '../../src/components/LiveIndicator';
import CricketField from '../../src/components/CricketField';

const AUTO_REFRESH_INTERVAL = 10000; // 10 seconds for live matches

export default function MatchDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [match, setMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadMatch();
    return () => {
      if (autoRefreshRef.current) {
        clearInterval(autoRefreshRef.current);
      }
    };
  }, [id]);

  // Auto-refresh for live matches
  useEffect(() => {
    if (match?.status === 'live') {
      autoRefreshRef.current = setInterval(() => {
        setMatch((prevMatch) => {
          if (prevMatch && prevMatch.status === 'live') {
            return simulateLiveScoreUpdate(prevMatch);
          }
          return prevMatch;
        });
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
  }, [match?.status]);

  const loadMatch = async () => {
    if (!id) return;
    try {
      setError(false);
      const data = await fetchMatchById(id);
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

  // Check if commentary should be shown (only for live and recent matches)
  const shouldShowCommentary = () => {
    if (!match) return false;
    // DO NOT show commentary for upcoming matches
    if (match.status === 'upcoming') return false;
    // Show commentary for live and recent matches if available
    return match.commentary && match.commentary.length > 0;
  };

  // Check if cricket field should be shown (only for live and recent with scores)
  const shouldShowCricketField = () => {
    if (!match) return false;
    // Only show for live or recent matches with scores
    if (match.status === 'upcoming') return false;
    return match.teams[0]?.runs !== undefined || match.teams[1]?.runs !== undefined;
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

      <ImageBackground
        source={require('../../assets/images/wallpaper.png')}
        style={styles.contentBackground}
        resizeMode="repeat"
      >
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
        >
          {/* Status Badge */}
          <View style={styles.statusContainer}>
            {match.status === 'live' ? (
              <LiveIndicator />
            ) : (
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor() }]}>
                <Text style={styles.statusText}>{getStatusText()}</Text>
              </View>
            )}
          </View>

          {/* Auto-refresh indicator for live matches */}
          {match.status === 'live' && (
            <View style={styles.autoRefreshBanner}>
              <Ionicons name="sync" size={14} color="#FFF" />
              <Text style={styles.autoRefreshText}>
                Auto-refreshing every 10 seconds
              </Text>
            </View>
          )}

          {/* Match Info Card - Semi-transparent */}
          <View style={styles.card}>
            <Text style={styles.seriesTitle}>{match.series}</Text>
            <Text style={styles.matchType}>{match.matchType}</Text>
            <View style={styles.divider} />
            
            <View style={styles.venueContainer}>
              <Ionicons name="location" size={16} color="#666" />
              <Text style={styles.venueText}>{match.venue}</Text>
            </View>
          </View>

          {/* Score Card - Semi-transparent */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Scorecard</Text>
            
            {match.teams.map((team, index) => (
              <View key={index} style={styles.teamScoreRow}>
                <View style={styles.teamInfo}>
                  <View style={styles.teamBadge}>
                    <Text style={styles.teamBadgeText}>
                      {team.shortName?.substring(0, 2) || team.name.substring(0, 2)}
                    </Text>
                  </View>
                  <View style={styles.teamNameContainer}>
                    <Text style={styles.teamShortName}>{team.shortName || team.name}</Text>
                    <Text style={styles.teamFullName}>{team.name}</Text>
                  </View>
                </View>
                <View style={styles.scoreInfo}>
                  {team.runs !== undefined ? (
                    <>
                      <Text style={styles.scoreMain}>
                        {team.runs}/{team.wickets || 0}
                      </Text>
                      {team.overs && (
                        <Text style={styles.oversText}>({team.overs} ov)</Text>
                      )}
                    </>
                  ) : (
                    <Text style={styles.yetToBat}>Yet to bat</Text>
                  )}
                </View>
              </View>
            ))}
          </View>

          {/* Cricket Field Visualization - Only for live/recent matches */}
          {shouldShowCricketField() && (
            <CricketField
              lastCommentary={match.commentary?.[0]}
              battingTeam={match.teams[0]?.shortName}
              bowlingTeam={match.teams[1]?.shortName}
            />
          )}

          {/* Result Card */}
          {match.result && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>
                {match.status === 'live' ? 'Current Status' : 'Result'}
              </Text>
              <View style={[
                styles.resultContainer,
                match.status === 'live' && styles.liveResultContainer
              ]}>
                <Ionicons 
                  name={match.status === 'live' ? 'pulse' : 'trophy'} 
                  size={24} 
                  color={match.status === 'live' ? '#FF4444' : '#FFD700'} 
                />
                <Text style={[
                  styles.resultText,
                  match.status === 'live' && styles.liveResultText
                ]}>
                  {match.result}
                </Text>
              </View>
            </View>
          )}

          {/* Start Time Card (for upcoming matches) */}
          {match.startTime && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Scheduled</Text>
              <View style={styles.timeContainer}>
                <Ionicons name="time" size={24} color="#2196F3" />
                <Text style={styles.timeText}>{match.startTime}</Text>
              </View>
            </View>
          )}

          {/* Commentary Section - ONLY for live and recent matches, NOT upcoming */}
          {shouldShowCommentary() && (
            <CommentarySection commentary={match.commentary!} />
          )}

          {/* Additional Info - Semi-transparent */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Match Info</Text>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Format</Text>
              <Text style={styles.infoValue}>{match.matchType}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Status</Text>
              <Text style={[styles.infoValue, { color: getStatusColor() }]}>
                {getStatusText()}
              </Text>
            </View>
          </View>

          <View style={styles.bottomPadding} />
        </ScrollView>
      </ImageBackground>
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
  contentBackground: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  statusContainer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  statusText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  autoRefreshBanner: {
    backgroundColor: '#FF4444',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 8,
    gap: 6,
  },
  autoRefreshText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  card: {
    // WhatsApp-style semi-transparent card
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    borderRadius: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 20,
    // Subtle shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
    // Glass effect border
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  seriesTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  matchType: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    marginVertical: 12,
  },
  venueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  venueText: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 16,
  },
  teamScoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.06)',
  },
  teamInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  teamBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  teamBadgeText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  teamNameContainer: {
    flex: 1,
  },
  teamShortName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  teamFullName: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  scoreInfo: {
    alignItems: 'flex-end',
  },
  scoreMain: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  oversText: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  yetToBat: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
  },
  resultContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
    padding: 16,
    borderRadius: 12,
  },
  liveResultContainer: {
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
  },
  resultText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4CAF50',
    flex: 1,
  },
  liveResultText: {
    color: '#FF4444',
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(33, 150, 243, 0.1)',
    padding: 16,
    borderRadius: 12,
  },
  timeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2196F3',
    flex: 1,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.06)',
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  bottomPadding: {
    height: 30,
  },
});
