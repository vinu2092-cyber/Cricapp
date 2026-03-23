import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Match } from '../types/match';

interface MatchCardProps {
  match: Match;
  onPress: () => void;
}

const MatchCard: React.FC<MatchCardProps> = ({ match, onPress }) => {
  const getStatusBadge = () => {
    switch (match.status) {
      case 'live':
        return (
          <View style={[styles.statusBadge, styles.liveBadge]}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        );
      case 'recent':
        return (
          <View style={[styles.statusBadge, styles.resultBadge]}>
            <Text style={styles.resultText}>RESULT</Text>
          </View>
        );
      case 'upcoming':
        return (
          <View style={[styles.statusBadge, styles.upcomingBadge]}>
            <Text style={styles.upcomingText}>UPCOMING</Text>
          </View>
        );
      default:
        return null;
    }
  };

  const formatSeries = (series: string) => {
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
          {formatSeries(match.series)}
        </Text>
        {getStatusBadge()}
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

      {match.result && (
        <Text style={styles.result} numberOfLines={2}>
          {match.result}
        </Text>
      )}

      {match.startTime && (
        <Text style={styles.startTime}>{match.startTime}</Text>
      )}

      <View style={styles.cardFooter}>
        <Ionicons name="chevron-forward" size={20} color="#999" />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  matchTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
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
  },
});

export default MatchCard;
