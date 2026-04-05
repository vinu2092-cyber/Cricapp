import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Commentary } from '../types/match';

interface CricketFieldProps {
  lastCommentary?: Commentary;
  battingTeam?: string;
  bowlingTeam?: string;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const FIELD_SIZE = Math.min(SCREEN_WIDTH - 64, 220); // Reduced from 320 to 220 (30% smaller)

const CricketField: React.FC<CricketFieldProps> = ({ 
  lastCommentary, 
  battingTeam = 'BAT',
  bowlingTeam = 'BOWL' 
}) => {
  const ballPosition = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const ballOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (lastCommentary) {
      animateBall(lastCommentary.event);
    }
  }, [lastCommentary]);

  const animateBall = (event?: string) => {
    // Reset ball position to bowler
    ballPosition.setValue({ x: 0, y: -30 });
    ballOpacity.setValue(1);

    // Determine ball destination based on event
    let destination = { x: 0, y: 0 };
    
    switch (event) {
      case 'six':
        destination = { x: 0, y: -FIELD_SIZE / 2 + 20 }; // Over the boundary
        break;
      case 'four':
        destination = { x: FIELD_SIZE / 3, y: -FIELD_SIZE / 3 }; // To cover boundary
        break;
      case 'wicket':
        destination = { x: 0, y: 20 }; // Hits stumps
        break;
      case 'dot':
        destination = { x: -20, y: 10 }; // Defended to close fielder
        break;
      default:
        destination = { x: 30, y: -20 }; // Single/runs
    }

    Animated.sequence([
      Animated.timing(ballPosition, {
        toValue: destination,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.delay(1000),
      Animated.timing(ballOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const getEventColor = (event?: string) => {
    switch (event) {
      case 'wicket': return '#FF4444';
      case 'six': return '#9C27B0';
      case 'four': return '#4CAF50';
      case 'dot': return '#666';
      default: return '#2196F3';
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Field Position</Text>
      
      <View style={[styles.field, { width: FIELD_SIZE, height: FIELD_SIZE }]}>
        {/* Outfield - Green grass */}
        <View style={styles.outfield}>
          {/* Inner Circle (30 yards) */}
          <View style={styles.innerCircle}>
            {/* Pitch */}
            <View style={styles.pitch}>
              {/* Crease lines */}
              <View style={styles.crease} />
              <View style={[styles.crease, styles.bowlerCrease]} />
              
              {/* Stumps */}
              <View style={styles.stumpsContainer}>
                <View style={styles.stumps}>
                  <View style={styles.stump} />
                  <View style={styles.stump} />
                  <View style={styles.stump} />
                </View>
                <Text style={styles.playerLabel}>🏏</Text>
              </View>
              
              <View style={[styles.stumpsContainer, styles.bowlerStumps]}>
                <View style={styles.stumps}>
                  <View style={styles.stump} />
                  <View style={styles.stump} />
                  <View style={styles.stump} />
                </View>
                <Text style={styles.playerLabel}>⚾</Text>
              </View>
            </View>
          </View>
          
          {/* Fielder positions */}
          <View style={[styles.fielder, styles.slipFielder]}>
            <Ionicons name="person" size={16} color="#FFF" />
          </View>
          <View style={[styles.fielder, styles.pointFielder]}>
            <Ionicons name="person" size={16} color="#FFF" />
          </View>
          <View style={[styles.fielder, styles.coverFielder]}>
            <Ionicons name="person" size={16} color="#FFF" />
          </View>
          <View style={[styles.fielder, styles.midwicketFielder]}>
            <Ionicons name="person" size={16} color="#FFF" />
          </View>
          <View style={[styles.fielder, styles.fineleg]}>
            <Ionicons name="person" size={16} color="#FFF" />
          </View>
          <View style={[styles.fielder, styles.thirdman]}>
            <Ionicons name="person" size={16} color="#FFF" />
          </View>
          <View style={[styles.fielder, styles.longon]}>
            <Ionicons name="person" size={16} color="#FFF" />
          </View>
          <View style={[styles.fielder, styles.longoff]}>
            <Ionicons name="person" size={16} color="#FFF" />
          </View>
          <View style={[styles.fielder, styles.deepmidwicket]}>
            <Ionicons name="person" size={16} color="#FFF" />
          </View>

          {/* Animated ball */}
          <Animated.View
            style={[
              styles.ball,
              {
                opacity: ballOpacity,
                transform: [
                  { translateX: ballPosition.x },
                  { translateY: ballPosition.y },
                ],
              },
            ]}
          />
        </View>
        
        {/* Boundary rope */}
        <View style={styles.boundaryRope} />
      </View>

      {/* Last Ball Info - Hide if over is '0' or empty */}
      {lastCommentary && lastCommentary.over && lastCommentary.over !== '0' && /\d/.test(lastCommentary.over) && (
        <View style={[styles.lastBallInfo, { borderLeftColor: getEventColor(lastCommentary.event) }]}>
          <View style={styles.lastBallHeader}>
            <Text style={styles.lastBallOver}>{lastCommentary.over}</Text>
            {lastCommentary.event && lastCommentary.event !== 'normal' && (
              <View style={[styles.eventBadge, { backgroundColor: getEventColor(lastCommentary.event) }]}>
                <Text style={styles.eventText}>
                  {lastCommentary.event?.toUpperCase()}
                </Text>
              </View>
            )}
            {lastCommentary.runs !== undefined && lastCommentary.runs > 0 && (
              <Text style={styles.runsText}>+{lastCommentary.runs}</Text>
            )}
          </View>
          <Text style={styles.lastBallText} numberOfLines={2}>
            {lastCommentary.english}
          </Text>
        </View>
      )}
      
      {/* Status text only box - when over is 0 or missing */}
      {lastCommentary && (!lastCommentary.over || lastCommentary.over === '0' || !/\d/.test(lastCommentary.over)) && (
        <View style={[styles.lastBallInfo, { borderLeftColor: '#4CAF50' }]}>
          <Text style={styles.lastBallText} numberOfLines={2}>
            {lastCommentary.english}
          </Text>
        </View>
      )}

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <Text style={styles.legendEmoji}>🏏</Text>
          <Text style={styles.legendText}>Batsman</Text>
        </View>
        <View style={styles.legendItem}>
          <Text style={styles.legendEmoji}>⚾</Text>
          <Text style={styles.legendText}>Bowler</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={styles.legendFielder}>
            <Ionicons name="person" size={10} color="#FFF" />
          </View>
          <Text style={styles.legendText}>Fielder</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  field: {
    borderRadius: 999,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  outfield: {
    width: '92%',
    height: '92%',
    borderRadius: 999,
    backgroundColor: '#66BB6A',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  innerCircle: {
    width: '55%',
    height: '55%',
    borderRadius: 999,
    backgroundColor: '#81C784',
    borderWidth: 2,
    borderColor: '#FFF',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pitch: {
    width: 20,
    height: 80,
    backgroundColor: '#D4A574',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    position: 'relative',
  },
  crease: {
    width: 30,
    height: 2,
    backgroundColor: '#FFF',
    position: 'absolute',
    top: 10,
  },
  bowlerCrease: {
    top: undefined,
    bottom: 10,
  },
  stumpsContainer: {
    alignItems: 'center',
    position: 'absolute',
    top: 5,
  },
  bowlerStumps: {
    top: undefined,
    bottom: 5,
  },
  stumps: {
    flexDirection: 'row',
    gap: 2,
  },
  stump: {
    width: 2,
    height: 10,
    backgroundColor: '#8D6E63',
  },
  playerLabel: {
    fontSize: 14,
    marginTop: 2,
  },
  fielder: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#1976D2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  slipFielder: {
    right: '22%',
    top: '55%',
  },
  pointFielder: {
    right: '15%',
    top: '40%',
  },
  coverFielder: {
    right: '20%',
    top: '25%',
  },
  midwicketFielder: {
    left: '20%',
    top: '35%',
  },
  fineleg: {
    left: '25%',
    bottom: '20%',
  },
  thirdman: {
    right: '25%',
    bottom: '20%',
  },
  longon: {
    left: '35%',
    top: '12%',
  },
  longoff: {
    right: '35%',
    top: '12%',
  },
  deepmidwicket: {
    left: '15%',
    top: '50%',
  },
  boundaryRope: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 999,
    borderWidth: 3,
    borderColor: '#FFF',
  },
  ball: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#D32F2F',
    borderWidth: 1,
    borderColor: '#B71C1C',
  },
  lastBallInfo: {
    width: '100%',
    marginTop: 16,
    padding: 12,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    borderLeftWidth: 4,
  },
  lastBallHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  lastBallOver: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  eventBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  eventText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#FFF',
  },
  runsText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  lastBallText: {
    fontSize: 13,
    color: '#555',
    lineHeight: 18,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    width: '100%',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendEmoji: {
    fontSize: 12,
  },
  legendFielder: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#1976D2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  legendText: {
    fontSize: 11,
    color: '#666',
  },
});

export default CricketField;
