import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Commentary, Language } from '../types/match';

interface CommentarySectionProps {
  commentary: Commentary[];
}

const CommentarySection: React.FC<CommentarySectionProps> = ({ commentary }) => {
  const [language, setLanguage] = useState<Language>('english');

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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <Ionicons name="chatbubbles" size={20} color="#4CAF50" />
          <Text style={styles.title}>
            {language === 'english' ? 'Ball by Ball Commentary' : 'गेंद दर गेंद कमेंट्री'}
          </Text>
        </View>
        
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
        {commentary.map((item, index) => (
          <View key={index} style={styles.commentaryItem}>
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
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    maxHeight: 400,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  languageToggle: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
    padding: 3,
  },
  langButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 17,
  },
  langButtonActive: {
    backgroundColor: '#4CAF50',
  },
  langText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  langTextActive: {
    color: '#FFFFFF',
  },
  commentaryList: {
    maxHeight: 300,
  },
  commentaryItem: {
    flexDirection: 'row',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  overBall: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  overText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#333',
  },
  commentaryContent: {
    flex: 1,
  },
  eventBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginBottom: 6,
    gap: 4,
  },
  eventText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  commentaryText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  runsContainer: {
    marginTop: 6,
  },
  runsText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4CAF50',
  },
});

export default CommentarySection;
