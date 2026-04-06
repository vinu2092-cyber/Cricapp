import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { Commentary, Language } from '../types/match';
import { usePro } from '../context/ProContext';
import { useAdMob } from '../context/AdMobContext';

interface CommentarySectionProps {
  commentary: Commentary[];
  matchId?: string;
  isLive?: boolean;
  matchStatus?: 'live' | 'recent' | 'upcoming';
}

const CommentarySection: React.FC<CommentarySectionProps> = ({
  commentary,
  matchId,
  isLive = false,
  matchStatus,
}) => {
  const [language, setLanguage] = useState<Language>('english');
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const [displayCount, setDisplayCount] = useState(10);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const { isPro } = usePro();
  const { BannerAdComponent } = useAdMob();

  const speakCommentary = (text: string, index: number) => {
    try {
      Speech.stop();
      setSpeakingIndex(index);
      Speech.speak(text, {
        language: 'en-IN',
        pitch: 1.0,
        rate: 0.9,
        onDone: () => setSpeakingIndex(null),
        onStopped: () => setSpeakingIndex(null),
        onError: () => setSpeakingIndex(null),
      });
    } catch {
      setSpeakingIndex(null);
    }
  };

  const handleLoadMore = () => {
    const remaining = commentary.length - displayCount;
    if (remaining > 0) {
      // Still have local items to show
      setIsLoadingMore(true);
      setTimeout(() => {
        setDisplayCount((prev) => Math.min(prev + 10, commentary.length));
        setIsLoadingMore(false);
      }, 300);
    }
  };

  // Open match details on external cricket website (user permission first)
  const handleViewFullDetails = () => {
    if (!matchId) return;
    const url = `https://www.cricbuzz.com/live-cricket-scores/${matchId}`;
    Alert.alert(
      'View Full Match Details',
      'Open full ball-by-ball coverage on the web for this match? This will open in your browser.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open',
          onPress: () => Linking.openURL(url).catch(() => {}),
        },
      ]
    );
  };

  const getEventColor = (event?: string) => {
    switch (event) {
      case 'wicket': return '#FF4444';
      case 'six': return '#9C27B0';
      case 'four': return '#4CAF50';
      case 'wide': return '#FF9800';
      case 'dot': return '#999';
      default: return '#2196F3';
    }
  };

  const getEventIcon = (event?: string): string => {
    switch (event) {
      case 'wicket': return 'alert-circle';
      case 'six': return 'star';
      case 'four': return 'flash';
      case 'wide': return 'resize-outline';
      case 'dot': return 'ellipse-outline';
      default: return 'radio-button-on';
    }
  };

  const getEventLabel = (event?: string) => {
    switch (event) {
      case 'wicket': return language === 'english' ? 'WICKET' : '\u0935\u093F\u0915\u0947\u091F';
      case 'six': return language === 'english' ? 'SIX' : '\u091B\u0915\u094D\u0915\u093E';
      case 'four': return language === 'english' ? 'FOUR' : '\u091A\u094C\u0915\u093E';
      case 'wide': return language === 'english' ? 'WIDE' : '\u0935\u093E\u0907\u0921';
      case 'dot': return language === 'english' ? 'DOT' : '\u0921\u0949\u091F';
      default: return '';
    }
  };

  const displayedCommentary = commentary.slice(0, displayCount);
  const hasMoreLocal = displayCount < commentary.length;

  return (
    <View style={styles.container}>
      {/* Hide "Ball by Ball Commentary" header for upcoming matches */}
      {matchStatus !== 'upcoming' && (
        <View style={styles.header}>
          <View style={styles.titleContainer}>
            <Ionicons name="chatbubbles" size={20} color="#4CAF50" />
            <Text style={styles.title}>Ball by Ball Commentary</Text>
          </View>
        </View>
      )}

      <ScrollView style={styles.commentaryList} nestedScrollEnabled>
        {/* If no commentary, show 2 banner ads with external link button in middle */}
        {displayedCommentary.length === 0 && (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <Ionicons name="chatbox-outline" size={40} color="#999" />
            <Text style={{ color: '#666', fontSize: 14, marginTop: 10, textAlign: 'center' }}>
              No ball-by-ball commentary available yet.{'\n'}Commentary will appear as the match progresses.
            </Text>
            {/* Banner Ad 1 */}
            <View style={styles.bannerAdContainer}>
              <BannerAdComponent />
            </View>
            {/* External Link Button */}
            <TouchableOpacity
              style={{
                backgroundColor: '#022d5d',
                paddingVertical: 14,
                paddingHorizontal: 24,
                borderRadius: 12,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                marginVertical: 12,
              }}
              onPress={() => {
                if (matchId) {
                  Alert.alert(
                    'External Link',
                    'You will be redirected to an external website for live commentary. Do you want to continue?',
                    [
                      { text: 'No', style: 'cancel' },
                      { text: 'Yes', onPress: () => Linking.openURL(`https://www.cricbuzz.com/live-cricket-scores/${matchId}`) },
                    ]
                  );
                }
              }}
            >
              <Ionicons name="globe-outline" size={20} color="#FFF" />
              <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 14 }}>View Live Commentary</Text>
            </TouchableOpacity>
            {/* Banner Ad 2 */}
            <View style={styles.bannerAdContainer}>
              <BannerAdComponent />
            </View>
          </View>
        )}
        
        {displayedCommentary.map((item, index) => {
          // Banner ad ONLY after every complete over (6 balls) - Policy Compliant
          const showBanner = (index + 1) % 6 === 0;
          
          // Fix: Only show over/ball circle if it's an actual delivery (has valid over number)
          const isActualDelivery = item.over && item.over !== '0' && item.over !== '' && /\d/.test(item.over);
          
          // Fix: Parse \n escape sequences in text to actual line breaks
          const parseText = (text: string) => {
            if (!text) return '';
            return text.replace(/\\n/g, '\n').replace(/\\r/g, '');
          };

          return (
            <View key={index}>
              <View style={styles.commentaryItem}>
                {/* Only show over ball circle for actual deliveries */}
                {isActualDelivery ? (
                  <View style={styles.overBall}>
                    <Text style={styles.overText}>{item.over}</Text>
                  </View>
                ) : (
                  <View style={styles.overBallPlaceholder} />
                )}

                <View style={styles.commentaryContent}>
                  {item.event && item.event !== 'normal' && (
                    <View style={[styles.eventBadge, { backgroundColor: getEventColor(item.event) }]}>
                      <Ionicons name={getEventIcon(item.event) as any} size={12} color="#FFF" />
                      <Text style={styles.eventText}>{getEventLabel(item.event)}</Text>
                    </View>
                  )}
                  <Text style={styles.commentaryText}>
                    {parseText(language === 'english' ? item.english : (item.hindi || item.english))}
                  </Text>
                </View>

                {isPro && (
                  <TouchableOpacity
                    style={styles.speakButton}
                    onPress={() => speakCommentary(item.english, index)}
                  >
                    <Ionicons
                      name={speakingIndex === index ? 'stop-circle' : 'play-circle'}
                      size={24}
                      color={speakingIndex === index ? '#FF4444' : '#4CAF50'}
                    />
                  </TouchableOpacity>
                )}
              </View>

              {showBanner && (
                <View style={styles.bannerAdContainer}>
                  <BannerAdComponent />
                </View>
              )}
            </View>
          );
        })}

        {/* Load More - Direct to external with confirmation */}
        {hasMoreLocal ? (
          <View style={styles.actionContainer}>
            <TouchableOpacity
              style={styles.loadMoreButton}
              onPress={() => {
                if (matchId) {
                  Alert.alert(
                    'External Link',
                    'You will be redirected to an external website. Do you want to continue?',
                    [
                      { text: 'No', style: 'cancel' },
                      { text: 'Yes', onPress: () => Linking.openURL(`https://www.cricbuzz.com/live-cricket-scores/${matchId}`) },
                    ]
                  );
                }
              }}
              data-testid="load-more-commentary"
            >
              <Ionicons name="open-outline" size={20} color="#4CAF50" />
              <Text style={styles.loadMoreText}>
                Load More ({commentary.length - displayCount} remaining)
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Always show "View Full Details" at the end */}
        <View style={styles.actionContainer}>
          <TouchableOpacity
            style={styles.viewFullBtn}
            onPress={handleViewFullDetails}
            data-testid="view-full-details-btn"
          >
            <Ionicons name="globe-outline" size={20} color="#FFF" />
            <Text style={styles.viewFullTxt}>View Full Match Details on Web</Text>
            <Ionicons name="open-outline" size={16} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.infoText}>
            {hasMoreLocal
              ? 'Want more? Tap above to see complete ball-by-ball coverage'
              : 'All loaded commentary shown. Tap above for full live coverage on the web'}
          </Text>
        </View>

        <View style={styles.countContainer}>
          <Text style={styles.countText}>
            {displayCount} of {commentary.length} commentary items
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    borderRadius: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 16,
    elevation: 3,
    minHeight: 200,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.08)',
  },
  titleContainer: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  title: { fontSize: 16, fontWeight: '700', color: '#333' },
  languageToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 8,
    padding: 2,
  },
  langButton: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  langButtonActive: { backgroundColor: '#4CAF50' },
  langText: { fontSize: 12, fontWeight: '600', color: '#666' },
  langTextActive: { color: '#FFF' },
  commentaryList: { flex: 1 },
  commentaryItem: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
    gap: 12,
  },
  overBall: { width: 50, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 4 },
  overBallPlaceholder: { width: 50 }, // Empty placeholder when no over/ball data
  overText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4CAF50',
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  commentaryContent: { flex: 1 },
  eventBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  eventText: { fontSize: 10, fontWeight: '700', color: '#FFF', letterSpacing: 0.5 },
  commentaryText: { fontSize: 14, lineHeight: 20, color: '#333', marginBottom: 4 },
  speakButton: { padding: 4, justifyContent: 'center' },
  bannerAdContainer: { 
    minHeight: 50, 
    alignItems: 'center', 
    justifyContent: 'center',
    marginVertical: 10,
    width: '100%',
  },
  actionContainer: { paddingVertical: 12, alignItems: 'center' },
  loadMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  loadMoreText: { fontSize: 14, fontWeight: '600', color: '#4CAF50' },
  viewFullBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#022d5d',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 24,
    width: '100%',
    justifyContent: 'center',
  },
  viewFullTxt: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  infoText: {
    fontSize: 11,
    color: '#888',
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 10,
    fontStyle: 'italic',
  },
  countContainer: { paddingVertical: 12, alignItems: 'center' },
  countText: { fontSize: 12, color: '#999', fontStyle: 'italic' },
});

export default CommentarySection;
