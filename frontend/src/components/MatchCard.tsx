import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Match } from '../types/match';
import { MatchStatusBadge } from './LiveIndicator';

interface MatchCardProps {
  match: Match;
  onPress: () => void;
}

const MatchCard: React.FC<MatchCardProps> = ({ match, onPress }) => {
  // v1.0.16 Rev 6 (2026-05-06) — Removed per-card notification bell
  // icon (was useless to users; reminder scheduling is now handled
  // automatically inside `preScheduleAllUpcomingReminders` for every
  // upcoming match). Also removed the absolute-positioned chevron
  // arrow that overlapped with the score column.

  // Dynamic status badge based on actual match state
  const getStatusBadge = () => {
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
          {getStatusBadge()}
        </View>
      </View>

      <View style={styles.teamsContainer}>
        {match.teams.map((team, index) => (
          <View key={index} style={styles.teamRow}>
            <View style={styles.teamNameRow}>
              {team.imageId || team.teamId ? (
                <Image
                  source={{ uri: `https://www.cricbuzz.com/a/img/v1/72x54/i1/c${team.imageId || team.teamId}/team.jpg` }}
                  style={styles.teamLogoImg}
                  resizeMode="contain"
                />
              ) : null}
              <Text style={styles.teamName}>{team.shortName}</Text>
            </View>
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
  matchTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#444',
    flex: 1,
    marginRight: 8,
  },
  teamsContainer: {
    marginVertical: 4,
  },
  teamRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  teamNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  teamLogoImg: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F5F5F5',
  },
  teamName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 8,
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
});

// v1.0.12 rev-3 perf: memoize the card so the 30s poll loop in
// NotificationContext doesn't re-render the entire match list every
// cycle. Most `match` objects are structurally stable between polls —
// React.memo's default shallow-equality check is sufficient because the
// parent (app/index.tsx) passes `match` by reference and only replaces
// it when a real delta arrives.
export default React.memo(MatchCard);
