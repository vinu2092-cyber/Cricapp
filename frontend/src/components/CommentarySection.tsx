import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { Commentary, Language } from '../types/match';
import { usePro } from '../context/ProContext';
import { useAdMob } from '../context/AdMobContext';

interface CommentarySectionProps {
  commentary: Commentary[];
  isLive?: boolean;
}

const CommentarySection: React.FC<CommentarySectionProps> = ({ 
  commentary, 
  isLive = false 
}) => {
  const [language, setLanguage] = useState<Language>('english');
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const [displayCount, setDisplayCount] = useState(10); // Show 10 initially
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const lastCommentaryCount = useRef(0);
  
  const { isPro } = usePro();
  const { BannerAdComponent } = useAdMob();

  // AUTO-PLAY: Voice for new balls when Pro and voice enabled
  useEffect(() => {
    if (!isPro || !voiceEnabled || !isLive) return;

    // Check if new commentary arrived
    if (commentary.length > lastCommentaryCount.current && lastCommentaryCount.current > 0) {
      const newCommentary = commentary[0]; // Latest ball is first
      speakCommentary(newCommentary.english, 0);
    }

    lastCommentaryCount.current = commentary.length;
  }, [commentary.length, isPro, voiceEnabled, isLive]);

  const speakCommentary = async (text: string, index: number) => {
    try {
      // Stop any current speech
      await Speech.stop();
      
      setSpeakingIndex(index);
      
      await Speech.speak(text, {
        language: 'en-IN',
        pitch: 1.0,
        rate: 0.9,
        onDone: () => setSpeakingIndex(null),
        onStopped: () => setSpeakingIndex(null),
        onError: () => setSpeakingIndex(null),
      });
    } catch (error) {
      console.error('Speech error:', error);
      setSpeakingIndex(null);
    }
  };

  const toggleVoice = () => {
    if (voiceEnabled) {
      Speech.stop();
      setSpeakingIndex(null);
    }
    setVoiceEnabled(!voiceEnabled);
  };

  const handleLoadMore = () => {
    setIsLoadingMore(true);
    setTimeout(() => {
      setDisplayCount(prev => Math.min(prev + 10, commentary.length));
      setIsLoadingMore(false);
    }, 300);
  };

  const getEventColor = (event?: string) => {
    switch (event) {
      case 'wicket':
        return '#FF4444';
      case 'six':
        return '#9C27B0';
      case 'four':
        return '#4CAF50';
      case 'dot':
        return '#999';
      default:
        return '#2196F3';
    }
  };

  const getEventIcon = (event?: string) => {
    switch (event) {
      case 'wicket':
        return 'alert-circle';
      case 'six':
        return 'star';
      case 'four':
        return 'flash';
      case 'dot':
        return 'ellipse-outline';
      default:
        return 'radio-button-on';
    }
  };

  const getEventLabel = (event?: string) => {
    switch (event) {
      case 'wicket':
        return language === 'english' ? 'WICKET' : 'विकेट';
      case 'six':
        return language === 'english' ? 'SIX' : 'छक्का';
      case 'four':
        return language === 'english' ? 'FOUR' : 'चौका';
      case 'dot':
        return language === 'english' ? 'DOT' : 'डॉट';
      default:
        return '';
    }
  };

  const displayedCommentary = commentary.slice(0, displayCount);
  const hasMore = displayCount < commentary.length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <Ionicons name="chatbubbles" size={20} color="#4CAF50" />
          <Text style={styles.title}>
            {language === 'english' ? 'Ball by Ball Commentary' : 'गेंद दर गेंद कमेंट्री'}
          </Text>
        </View>
        
        {/* Voice Toggle - Pro Feature */}
        <TouchableOpacity
          style={[
            styles.voiceButton,
            !isPro && styles.voiceButtonLocked,
            voiceEnabled && isPro && styles.voiceButtonActive,
          ]}
          onPress={isPro ? toggleVoice : undefined}
        >
          <Ionicons 
            name={voiceEnabled ? "volume-high" : "volume-mute"} 
            size={20} 
            color={isPro ? (voiceEnabled ? "#4CAF50" : "#666") : "#999"} 
          />
          {!isPro && (
            <Ionicons name="lock-closed" size={12} color="#999" style={styles.lockIcon} />
          )}
        </TouchableOpacity>
        
        {/* Language Toggle */}
        <View style={styles.languageToggle}>
          <TouchableOpacity
            style={[
              styles.langButton,
              language === 'english' && styles.langButtonActive,
            ]}
            onPress={() => setLanguage('english')}
          >
            <Text
              style={[
                styles.langText,
                language === 'english' && styles.langTextActive,
              ]}
            >
              EN
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.langButton,
              language === 'hindi' && styles.langButtonActive,
            ]}
            onPress={() => setLanguage('hindi')}
          >
            <Text
              style={[
                styles.langText,
                language === 'hindi' && styles.langTextActive,
              ]}
            >
              हि
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.commentaryList} nestedScrollEnabled>
        {displayedCommentary.map((item, index) => (
          <React.Fragment key={index}>
            <View style={styles.commentaryItem}>
              <View style={styles.overBall}>
                <Text style={styles.overText}>{item.over}</Text>
              </View>
              
              <View style={styles.commentaryContent}>
                {item.event && item.event !== 'normal' && (
                  <View
                    style={[
                      styles.eventBadge,
                      { backgroundColor: getEventColor(item.event) },
                    ]}
                  >
                    <Ionicons
                      name={getEventIcon(item.event) as any}
                      size={12}
                      color="#FFF"
                    />
                    <Text style={styles.eventText}>{getEventLabel(item.event)}</Text>
                  </View>
                )}
                <Text style={styles.commentaryText}>
                  {language === 'english' ? item.english : item.hindi}
                </Text>
                {item.runs !== undefined && item.runs > 0 && (
                  <View style={styles.runsContainer}>
                    <Text style={styles.runsText}>+{item.runs}</Text>
                  </View>
                )}
              </View>

              {/* Voice Button for Each Ball - Pro Only */}
              {isPro && (
                <TouchableOpacity
                  style={styles.speakButton}
                  onPress={() => speakCommentary(item.english, index)}
                >
                  <Ionicons
                    name={speakingIndex === index ? "stop-circle" : "play-circle"}
                    size={24}
                    color={speakingIndex === index ? "#FF4444" : "#4CAF50"}
                  />
                </TouchableOpacity>
              )}
            </View>

            {/* BANNER AD: Show after every 6 balls (every over) for non-Pro users */}
            {!isPro && (index + 1) % 6 === 0 && (
              <View style={styles.bannerAdContainer}>
                <BannerAdComponent size="BANNER" />
              </View>
            )}
          </React.Fragment>
        ))}

        {/* LOAD MORE BUTTON */}
        {hasMore && (
          <View style={styles.loadMoreContainer}>
            <TouchableOpacity
              style={styles.loadMoreButton}
              onPress={handleLoadMore}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? (
                <ActivityIndicator color="#4CAF50" />
              ) : (
                <>
                  <Ionicons name="chevron-down-circle" size={20} color="#4CAF50" />
                  <Text style={styles.loadMoreText}>
                    Load More Commentary ({commentary.length - displayCount} remaining)
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Total Commentary Count */}
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
    maxHeight: 500,
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
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
  },
  voiceButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    marginRight: 8,
    position: 'relative',
  },
  voiceButtonLocked: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  voiceButtonActive: {
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
  },
  lockIcon: {
    position: 'absolute',
    top: 2,
    right: 2,
  },
  languageToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 8,
    padding: 2,
  },
  langButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  langButtonActive: {
    backgroundColor: '#4CAF50',
  },
  langText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  langTextActive: {
    color: '#FFF',
  },
  commentaryList: {
    flex: 1,
  },
  commentaryItem: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
    gap: 12,
  },
  overBall: {
    width: 50,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 4,
  },
  overText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4CAF50',
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  commentaryContent: {
    flex: 1,
  },
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
  eventText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFF',
    letterSpacing: 0.5,
  },
  commentaryText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#333',
    marginBottom: 4,
  },
  runsContainer: {
    backgroundColor: 'rgba(33, 150, 243, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  runsText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2196F3',
  },
  speakButton: {
    padding: 4,
    justifyContent: 'center',
  },
  bannerAdContainer: {
    marginVertical: 12,
    alignItems: 'center',
  },
  loadMoreContainer: {
    paddingVertical: 16,
    alignItems: 'center',
  },
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
  loadMoreText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4CAF50',
  },
  countContainer: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  countText: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
  },
});

export default CommentarySection;
