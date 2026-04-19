const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Config plugin to fix Android Manifest merger conflicts.
 * 
 * When @react-native-firebase/messaging is installed, it declares its own
 * meta-data entries for default_notification_channel_id, default_notification_color, etc.
 * These conflict with the entries added by expo-notifications and the app manifest.
 * 
 * This plugin adds tools:replace attributes to resolve the merge conflicts.
 */
const withManifestFix = (config) => {
  return withAndroidManifest(config, async (config) => {
    const mainApplication = config.modResults.manifest.application?.[0];
    if (!mainApplication) {
      console.warn('[withManifestFix] No application found in manifest');
      return config;
    }

    // Ensure tools namespace is declared FIRST
    if (!config.modResults.manifest.$) {
      config.modResults.manifest.$ = {};
    }
    if (!config.modResults.manifest.$['xmlns:tools']) {
      config.modResults.manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
      console.log('[withManifestFix] Added tools namespace to manifest');
    }

    // Initialize meta-data array if not present
    if (!mainApplication['meta-data']) {
      mainApplication['meta-data'] = [];
    }
    const metaDataArray = mainApplication['meta-data'];

    // Meta-data entries that need tools:replace="android:value"
    const valueReplaceKeys = [
      'com.google.firebase.messaging.default_notification_channel_id',
    ];

    // Meta-data entries that need tools:replace="android:resource"
    const resourceReplaceKeys = [
      'com.google.firebase.messaging.default_notification_color',
      'com.google.firebase.messaging.default_notification_icon',
    ];

    // Process existing meta-data entries
    metaDataArray.forEach((metaData) => {
      if (!metaData.$) {
        metaData.$ = {};
      }
      const name = metaData.$['android:name'];
      if (!name) return;

      if (valueReplaceKeys.includes(name)) {
        metaData.$['tools:replace'] = 'android:value';
        console.log(`[withManifestFix] Added tools:replace="android:value" to ${name}`);
      }

      if (resourceReplaceKeys.includes(name)) {
        metaData.$['tools:replace'] = 'android:resource';
        console.log(`[withManifestFix] Added tools:replace="android:resource" to ${name}`);
      }
    });

    // Add tools:replace to application tag itself to handle all conflicts
    if (!mainApplication.$) {
      mainApplication.$ = {};
    }
    if (!mainApplication.$['tools:replace']) {
      mainApplication.$['tools:replace'] = 'android:allowBackup';
      console.log('[withManifestFix] Added tools:replace to application tag');
    }

    return config;
  });
};

module.exports = withManifestFix;
