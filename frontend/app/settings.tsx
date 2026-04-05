import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Alert, ScrollView, KeyboardAvoidingView, Platform, Linking, Switch
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNotifications } from '../src/context/NotificationContext';

const API_KEY_STORAGE = 'cricapp_user_api_key';
const RAPIDAPI_URL = 'https://rapidapi.com/cricketapilive/api/cricbuzz-cricket';

export default function Settings() {
  const router = useRouter();
  const [apiKey, setApiKey] = useState('');
  const [savedKey, setSavedKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const { notificationsEnabled, autoTrackEnabled, enableNotifications, disableNotifications, toggleAutoTrack } = useNotifications();

  // Load saved API key on mount
  useEffect(() => {
    loadSavedKey();
  }, []);

  const loadSavedKey = async () => {
    try {
      const key = await AsyncStorage.getItem(API_KEY_STORAGE);
      if (key) {
        setSavedKey(key);
        setApiKey(key);
      }
    } catch (error) {
      console.error('Error loading API key:', error);
    }
  };

  const saveApiKey = async () => {
    if (!apiKey.trim()) {
      Alert.alert('Error', 'Please enter an API key');
      return;
    }

    setIsSaving(true);
    try {
      await AsyncStorage.setItem(API_KEY_STORAGE, apiKey.trim());
      setSavedKey(apiKey.trim());
      Alert.alert('Success', 'API Key saved successfully! The app will now use your API key.');
    } catch (error) {
      Alert.alert('Error', 'Failed to save API key');
    } finally {
      setIsSaving(false);
    }
  };

  const removeApiKey = async () => {
    Alert.alert(
      'Remove API Key',
      'Are you sure you want to remove your API key? The app will use default keys.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.removeItem(API_KEY_STORAGE);
              setApiKey('');
              setSavedKey('');
              Alert.alert('Removed', 'API Key removed. App will use default keys.');
            } catch (error) {
              Alert.alert('Error', 'Failed to remove API key');
            }
          },
        },
      ]
    );
  };

  const handleGetApiKey = () => {
    Alert.alert(
      'External Link',
      'You are being redirected to an external link to get your API Key. Do you want to continue?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes',
          onPress: () => {
            Linking.openURL(RAPIDAPI_URL).catch(() => {
              Alert.alert('Error', 'Unable to open the link. Please try again.');
            });
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>API Settings</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={styles.content}>
          {/* Section 1: Get API Key Button */}
          <View style={styles.section}>
            <TouchableOpacity 
              style={styles.getApiKeyBtn}
              onPress={handleGetApiKey}
              data-testid="get-api-key-btn"
            >
              <Ionicons name="key-outline" size={22} color="#FFF" />
              <Text style={styles.getApiKeyText}>Get API Key</Text>
              <Ionicons name="open-outline" size={18} color="#FFF" />
            </TouchableOpacity>
          </View>

          {/* Section 2: API Key Input - DO NOT TOUCH */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your API Key</Text>
            
            <TextInput
              style={styles.input}
              placeholder="Enter your RapidAPI Key"
              placeholderTextColor="#999"
              value={apiKey}
              onChangeText={setApiKey}
              autoCapitalize="none"
              autoCorrect={false}
              data-testid="api-key-input"
            />

            {savedKey ? (
              <View style={styles.statusRow}>
                <Ionicons name="checkmark-circle" size={18} color="#4CAF50" />
                <Text style={styles.statusText}>API Key saved</Text>
              </View>
            ) : null}

            <TouchableOpacity 
              style={[styles.saveBtn, isSaving && styles.saveBtnDisabled]}
              onPress={saveApiKey}
              disabled={isSaving}
              data-testid="save-api-key-btn"
            >
              <Ionicons name="save" size={20} color="#FFF" />
              <Text style={styles.saveBtnText}>
                {isSaving ? 'Saving...' : 'Save API Key'}
              </Text>
            </TouchableOpacity>

            {savedKey ? (
              <TouchableOpacity style={styles.removeBtn} onPress={removeApiKey}>
                <Ionicons name="trash" size={20} color="#F44336" />
                <Text style={styles.removeBtnText}>Remove API Key</Text>
              </TouchableOpacity>
            ) : null}

            {/* API Help Text - moved here to be part of API section */}
            <View style={[styles.helpTextContainer, { marginTop: 12 }]}>
              <Ionicons name="help-circle-outline" size={20} color="#888" />
              <Text style={styles.helpText}>
                If user is unable to see the match, then they can generate their own API key by clicking on Get API Key and pasting it in the box above.
              </Text>
            </View>
          </View>

          {/* Section 3: Notification Settings */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notification Settings</Text>
            
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Ionicons name="notifications" size={22} color="#4CAF50" />
                <View style={styles.settingText}>
                  <Text style={styles.settingTitle}>Match Notifications</Text>
                  <Text style={styles.settingDesc}>Get alerts for wickets, fours, sixes</Text>
                </View>
              </View>
              <Switch
                value={notificationsEnabled}
                onValueChange={(value) => value ? enableNotifications() : disableNotifications()}
                trackColor={{ false: '#333', true: '#4CAF50' }}
                thumbColor={notificationsEnabled ? '#FFF' : '#999'}
              />
            </View>
            
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Ionicons name="trophy" size={22} color="#FFD700" />
                <View style={styles.settingText}>
                  <Text style={styles.settingTitle}>Auto-Track IPL & International</Text>
                  <Text style={styles.settingDesc}>Automatically track IPL and International matches</Text>
                </View>
              </View>
              <Switch
                value={autoTrackEnabled}
                onValueChange={toggleAutoTrack}
                trackColor={{ false: '#333', true: '#FFD700' }}
                thumbColor={autoTrackEnabled ? '#FFF' : '#999'}
                disabled={!notificationsEnabled}
              />
            </View>
            
            <View style={styles.notifInfoBox}>
              <Ionicons name="information-circle" size={20} color="#2196F3" />
              <Text style={styles.notifInfoText}>
                When enabled, you'll automatically receive notifications for all IPL and International matches including:{'\n'}
                • Match start reminder (10 min before){'\n'}
                • Wicket alerts{'\n'}
                • Boundary alerts (4s & 6s){'\n'}
                • Milestone alerts (50s, 100s)
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  backBtn: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 12,
  },
  getApiKeyBtn: {
    backgroundColor: '#2196F3',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 10,
  },
  getApiKeyText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  input: {
    backgroundColor: '#1E1E1E',
    borderRadius: 10,
    padding: 14,
    fontSize: 14,
    color: '#FFF',
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  statusText: {
    color: '#4CAF50',
    fontSize: 14,
  },
  saveBtn: {
    backgroundColor: '#4CAF50',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 10,
    gap: 8,
    marginBottom: 10,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: '#F44336',
  },
  removeBtnText: {
    color: '#F44336',
    fontSize: 16,
    fontWeight: '600',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E1E1E',
    padding: 16,
    borderRadius: 10,
    marginBottom: 12,
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  settingText: {
    flex: 1,
  },
  settingTitle: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  settingDesc: {
    color: '#888',
    fontSize: 12,
  },
  notifInfoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(33, 150, 243, 0.1)',
    padding: 14,
    borderRadius: 10,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(33, 150, 243, 0.3)',
  },
  notifInfoText: {
    flex: 1,
    color: '#AAA',
    fontSize: 13,
    lineHeight: 20,
  },
  helpTextContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#1E1E1E',
    padding: 16,
    borderRadius: 10,
    gap: 10,
  },
  helpText: {
    flex: 1,
    color: '#AAA',
    fontSize: 14,
    lineHeight: 20,
  },
});
