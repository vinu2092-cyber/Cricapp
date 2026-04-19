const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

/**
 * Config plugin to fix Android Manifest merger conflicts.
 * 
 * When @react-native-firebase/messaging is installed, it declares its own
 * meta-data entries for default_notification_channel_id, default_notification_color, etc.
 * These conflict with the entries added by expo-notifications and the app manifest.
 * 
 * This plugin adds tools:replace attributes to resolve the merge conflicts.
 * MUST run AFTER all other plugins (placed last in app.json plugins array).
 */
const withManifestFix = (config) => {
  return withAndroidManifest(config, async (config) => {
    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);

    // Ensure tools namespace is declared
    if (!config.modResults.manifest.$) {
      config.modResults.manifest.$ = {};
    }
    config.modResults.manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';

    // Get meta-data array
    if (!mainApplication['meta-data']) {
      mainApplication['meta-data'] = [];
    }
    const metaDataArray = mainApplication['meta-data'];

    console.log('[withManifestFix] Processing', metaDataArray.length, 'meta-data entries');

    // Process ALL meta-data entries
    metaDataArray.forEach((metaData, index) => {
      if (!metaData.$) {
        metaData.$ = {};
      }
      
      const name = metaData.$['android:name'];
      if (!name) {
        console.log(`[withManifestFix] Entry ${index} has no name, skipping`);
        return;
      }

      console.log(`[withManifestFix] Entry ${index}: ${name}`);

      // Firebase messaging entries that need special handling
      if (name === 'com.google.firebase.messaging.default_notification_channel_id') {
        metaData.$['tools:replace'] = 'android:value';
        console.log(`[withManifestFix] ✅ Added tools:replace="android:value" to ${name}`);
      }

      if (name === 'com.google.firebase.messaging.default_notification_color' || 
          name === 'com.google.firebase.messaging.default_notification_icon') {
        metaData.$['tools:replace'] = 'android:resource';
        console.log(`[withManifestFix] ✅ Added tools:replace="android:resource" to ${name}`);
      }
    });

    // Add tools:replace to application tag for additional safety
    if (!mainApplication.$) {
      mainApplication.$ = {};
    }
    mainApplication.$['tools:replace'] = 'android:allowBackup';

    console.log('[withManifestFix] ✅ Manifest fix plugin completed');
    return config;
  });
};

module.exports = withManifestFix;
