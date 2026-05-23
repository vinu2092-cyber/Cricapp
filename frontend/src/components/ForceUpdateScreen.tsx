/**
 * ForceUpdateScreen.tsx — Blocking modal shown when installed app version is
 * older than the minimum supported version (from Firestore).
 *
 * Behaviour:
 *   • No close / dismiss option (intentionally not a `<Modal>` with backdrop
 *     tap-to-dismiss). It is rendered as a full-screen overlay above the
 *     entire app tree.
 *   • Hardware back button is captured on Android and ignored.
 *   • "Update Now" button opens the Play Store listing for com.cricapp.live.
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, BackHandler, Linking, Platform, StatusBar, Image } from 'react-native';

interface Props {
  playStoreUrl: string;
  installedVersion: string;
  latestVersion?: string | null;
}

export default function ForceUpdateScreen({ playStoreUrl, installedVersion, latestVersion }: Props) {
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  const openStore = async () => {
    try {
      // Prefer native market:// intent on Android (opens Play Store app directly)
      const intent = 'market://details?id=com.cricapp.live';
      const supported = await Linking.canOpenURL(intent);
      if (supported) {
        await Linking.openURL(intent);
      } else {
        await Linking.openURL(playStoreUrl);
      }
    } catch {
      try { await Linking.openURL(playStoreUrl); } catch {}
    }
  };

  return (
    <View style={styles.root} pointerEvents="auto">
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Image
            source={require('../../assets/icon.png')}
            style={styles.appIcon}
            resizeMode="contain"
          />
        </View>
        <Text style={styles.title}>New Version Available</Text>
        <Text style={styles.subtitle}>
          To continue using CricApp, please update to the latest version.
        </Text>
        <View style={styles.versionRow}>
          <Text style={styles.versionLabel}>Your version:</Text>
          <Text style={styles.versionValue}>{installedVersion}</Text>
        </View>
        {latestVersion ? (
          <View style={styles.versionRow}>
            <Text style={styles.versionLabel}>Latest version:</Text>
            <Text style={[styles.versionValue, { color: '#4CAF50' }]}>{latestVersion}</Text>
          </View>
        ) : null}

        <TouchableOpacity style={styles.button} onPress={openStore} activeOpacity={0.85}>
          <Text style={styles.buttonText}>UPDATE NOW</Text>
        </TouchableOpacity>

        <Text style={styles.footer}>This update fixes bugs and improves performance.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#0a0a0a',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 99999,
    elevation: 30,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    alignItems: 'center',
  },
  iconWrap: {
    width: 86,
    height: 86,
    borderRadius: 18,
    backgroundColor: '#0d47a1',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    overflow: 'hidden',
  },
  appIcon: { width: 70, height: 70 },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    color: '#bdbdbd',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 18,
    lineHeight: 21,
  },
  versionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  versionLabel: { color: '#9e9e9e', fontSize: 14 },
  versionValue: { color: '#fff', fontSize: 14, fontWeight: '600' },
  button: {
    width: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 10,
    paddingVertical: 14,
    marginTop: 18,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  footer: {
    color: '#757575',
    fontSize: 12,
    marginTop: 14,
    textAlign: 'center',
  },
});
