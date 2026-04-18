const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo Config Plugin: Unity Ads Mediation for AdMob
 * 
 * This plugin injects the Unity Ads SDK and Google AdMob Unity Mediation Adapter
 * as native Android dependencies so that AdMob mediation can use Unity Ads as
 * a bidding/waterfall source for Banner, Interstitial, and Rewarded ads.
 * 
 * Unity Game ID: 6087835
 * Placement IDs: Banner_Android, Interstitial_Android, Rewarded_Android
 * 
 * NOTE: This ONLY adds native dependencies. All mediation configuration 
 * (groups, priority, bidding) is managed in the AdMob Console.
 */

const UNITY_ADS_VERSION = '4.12.4';
const UNITY_MEDIATION_ADAPTER_VERSION = '4.12.5.0';

const withUnityAdsMediation = (config) => {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const buildGradlePath = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'build.gradle'
      );

      if (fs.existsSync(buildGradlePath)) {
        let contents = fs.readFileSync(buildGradlePath, 'utf-8');

        // Check if Unity Ads dependencies are already added
        if (!contents.includes('com.unity3d.ads:unity-ads')) {
          // Find the dependencies block and add Unity Ads entries
          const dependenciesRegex = /dependencies\s*\{/;
          if (dependenciesRegex.test(contents)) {
            contents = contents.replace(
              dependenciesRegex,
              `dependencies {
    // Unity Ads Mediation for AdMob (added by withUnityAdsMediation plugin)
    implementation 'com.unity3d.ads:unity-ads:${UNITY_ADS_VERSION}'
    implementation 'com.google.ads.mediation:unity:${UNITY_MEDIATION_ADAPTER_VERSION}'`
            );
            fs.writeFileSync(buildGradlePath, contents);
            console.log('[withUnityAdsMediation] Added Unity Ads dependencies to build.gradle');
          } else {
            console.warn('[withUnityAdsMediation] Could not find dependencies block in build.gradle');
          }
        } else {
          console.log('[withUnityAdsMediation] Unity Ads dependencies already present');
        }
      } else {
        console.warn('[withUnityAdsMediation] build.gradle not found at:', buildGradlePath);
      }

      return config;
    },
  ]);
};

module.exports = withUnityAdsMediation;
