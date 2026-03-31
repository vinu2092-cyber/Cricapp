import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Alert, ScrollView, KeyboardAvoidingView, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_KEY_STORAGE = 'cricapp_user_api_key';

export default function Settings() {
  const router = useRouter();
  const [apiKey, setApiKey] = useState('');
  const [savedKey, setSavedKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);

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
          {/* Info Card */}
          <View style={styles.infoCard}>
            <Ionicons name="information-circle" size={24} color="#2196F3" />
            <Text style={styles.infoText}>
              Add your own RapidAPI key to get unlimited access to live cricket data.
            </Text>
          </View>

          {/* Locked Fields - Provider Info */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>API Provider (Locked)</Text>
            
            <View style={styles.lockedField}>
              <Text style={styles.lockedLabel}>Provider</Text>
              <View style={styles.lockedValue}>
                <Ionicons name="lock-closed" size={16} color="#666" />
                <Text style={styles.lockedText}>RapidAPI</Text>
              </View>
            </View>

            <View style={styles.lockedField}>
              <Text style={styles.lockedLabel}>API Host</Text>
              <View style={styles.lockedValue}>
                <Ionicons name="lock-closed" size={16} color="#666" />
                <Text style={styles.lockedText}>cricbuzz-cricket.p.rapidapi.com</Text>
              </View>
            </View>

            <View style={styles.lockedField}>
              <Text style={styles.lockedLabel}>Header Name</Text>
              <View style={styles.lockedValue}>
                <Ionicons name="lock-closed" size={16} color="#666" />
                <Text style={styles.lockedText}>X-RapidAPI-Key</Text>
              </View>
            </View>
          </View>

          {/* API Key Input */}
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
          </View>

          {/* How to get API Key */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>How to get API Key?</Text>
            <View style={styles.steps}>
              <Text style={styles.step}>1. Go to rapidapi.com</Text>
              <Text style={styles.step}>2. Search for "Cricbuzz Cricket"</Text>
              <Text style={styles.step}>3. Subscribe to a plan (Free/Pro/Ultra)</Text>
              <Text style={styles.step}>4. Copy your X-RapidAPI-Key</Text>
              <Text style={styles.step}>5. Paste it above and save</Text>
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
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(33, 150, 243, 0.1)',
    padding: 16,
    borderRadius: 12,
    gap: 12,
    marginBottom: 20,
  },
  infoText: {
    flex: 1,
    color: '#2196F3',
    fontSize: 14,
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
  lockedField: {
    backgroundColor: '#1E1E1E',
    padding: 14,
    borderRadius: 10,
    marginBottom: 10,
  },
  lockedLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 4,
  },
  lockedValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  lockedText: {
    fontSize: 14,
    color: '#CCC',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
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
  steps: {
    backgroundColor: '#1E1E1E',
    padding: 16,
    borderRadius: 10,
  },
  step: {
    color: '#CCC',
    fontSize: 14,
    marginBottom: 8,
  },
});
