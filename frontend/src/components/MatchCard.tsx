import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Match } from '../types/match';
import { MatchStatusBadge } from './LiveIndicator';
import { useNotifications } from '../context/NotificationContext';

interface MatchCardProps {
  match: Match;
  onPress: () => void;
}

const MatchCard: React.FC<MatchCardProps> = ({ match, onPress }) => {
  const { isTracking, toggleTracking, notificationsEnabled, enableNotifications } = useNotifications();
  const tracked = isTracking(match.matchId);

  const handleBellPress = async () => {
    if (!notificationsEnabled) {
      const granted = await enableNotifications();
      if (!granted) return;
    }
    toggleTracking(match.matchId, match.teams[0]?.shortName || 'TM1', match.teams[1]?.shortName || 'TM2');
  };
  
  // Dynamic status badge based on actual match state
  const getStatusBadge = () => {
    // Use statusText from API to determine actual state
    const isLive = match.status === 'live';
    return <MatchStatusBadge state={match.statusText} isLive={isLive} />;
  };

  const formatSeries = (series?: string) => {
    if (!series) return 'Cricket Match';
    // Extract match info like "IND VS NZ - 3RD ODI 2025"
    const parts = series.split(', ');
    if (parts.length >= 2) {
      return parts.slice(0, 2).join(' - ').toUpperCase();
    }
    return series.toUpperCase();
  };

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.9}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.matchTitle} numberOfLines={1}>
          {formatSeries(match.series || match.seriesName)}
        </Text>
        <View style={styles.headerRight}>
          {/* Bell icon next to LIVE badge for live matches */}
          {match.status === 'live' && (
            <TouchableOpacity
              style={[styles.bellBtnHeader, tracked && styles.bellBtnHeaderActive]}
              onPress={handleBellPress}
              data-testid={`alert-toggle-${match.matchId}`}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons
                name={tracked ? 'notifications' : 'notifications-outline'}
                size={16}
                color={tracked ? '#4CAF50' : '#888'}
              />
            </TouchableOpacity>
          )}
          {getStatusBadge()}
        </View>
      </View>

      <View style={styles.teamsContainer}>
        {match.teams.map((team, index) => (
          <View key={index} style={styles.teamRow}>
            <Text style={styles.teamName}>{team.shortName}</Text>
            <View style={styles.scoreContainer}>
              {team.runs !== undefined && (
                <Text style={styles.score}>
                  {team.runs}/{team.wickets || 0}
                  {team.overs && (
                    <Text style={styles.overs}> ({team.overs})</Text>
                  )}
                </Text>
              )}
            </View>
          </View>
        ))}
      </View>

      {/* Upcoming match details: date, time, venue */}
      {match.status === 'upcoming' && (
        <View style={styles.upcomingDetails}>
          {match.matchDesc ? (
            <Text style={styles.matchDesc}>{match.matchDesc}</Text>
          ) : null}
          {match.startTime ? (
            <View style={styles.detailRow}>
              <Ionicons name="calendar-outline" size={14} color="#2196F3" />
              <Text style={styles.detailText}>{match.startTime}</Text>
            </View>
          ) : null}
          {(match.venue || match.city) ? (
            <View style={styles.detailRow}>
              <Ionicons name="location-outline" size={14} color="#FF9800" />
              <Text style={styles.detailText}>
                {[match.venue, match.city].filter(Boolean).join(', ')}
              </Text>
            </View>
          ) : null}
        </View>
      )}

      {/* Recent match result text */}
      {match.status === 'recent' && match.statusText && (
        <Text style={styles.resultStatus} numberOfLines={2}>
          {match.statusText}
        </Text>
      )}

      {/* Live match status */}
      {match.status === 'live' && match.statusText && (
        <Text style={styles.liveStatus} numberOfLines={1}>
          {match.statusText}
        </Text>
      )}

      <View style={styles.cardFooter}>
        <Ionicons name="chevron-forward" size={20} color="#666" />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    // WhatsApp-style semi-transparent card
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 16,
    // Subtle shadow for depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
    // Blur effect border
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bellBtnHeader: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  bellBtnHeaderActive: {
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
  },
  matchTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#444',
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  liveBadge: {
    backgroundColor: '#FF4444',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
    marginRight: 4,
  },
  liveText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 10,
  },
  resultBadge: {
    backgroundColor: '#4CAF50',
  },
  resultText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 10,
  },
  upcomingBadge: {
    backgroundColor: '#2196F3',
  },
  upcomingText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 10,
  },
  teamsContainer: {
    marginBottom: 8,
  },
  teamRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  teamName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  score: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  overs: {
    fontSize: 14,
    color: '#666',
    fontWeight: 'normal',
  },
  result: {
    fontSize: 13,
    color: '#4CAF50',
    fontWeight: '500',
    marginTop: 4,
  },
  resultStatus: {
    fontSize: 13,
    color: '#4CAF50',
    fontWeight: '500',
    marginTop: 4,
    fontStyle: 'italic',
  },
  liveStatus: {
    fontSize: 12,
    color: '#FF4444',
    fontWeight: '600',
    marginTop: 4,
  },
  upcomingDetails: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.08)',
    gap: 6,
  },
  matchDesc: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailText: {
    fontSize: 12,
    color: '#666',
    flex: 1,
  },
  startTime: {
    fontSize: 13,
    color: '#2196F3',
    fontWeight: '500',
    marginTop: 4,
  },
  cardFooter: {
    position: 'absolute',
    right: 8,
    top: '50%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bellBtn: {
    padding: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  bellBtnActive: {
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
  },
});

export default MatchCard;
