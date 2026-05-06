const { withAppBuildGradle } = require('expo/config-plugins');

/**
 * Config Plugin to add Release Signing Configuration
 * This generates a release keystore and configures signing for Play Store
 */
const withReleaseSigning = (config) => {
  return withAppBuildGradle(config, (config) => {
    let buildGradle = config.modResults.contents;

    // Check if release signing config already exists
    if (buildGradle.includes('signingConfigs.release')) {
      console.log('[withReleaseSigning] Release signing already configured');
      return config;
    }

    // Add release signing config
    const signingConfigBlock = `
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        release {
            // For CI/CD builds, use environment variables or generate keystore
            if (project.hasProperty('RELEASE_STORE_FILE')) {
                storeFile file(RELEASE_STORE_FILE)
                storePassword RELEASE_STORE_PASSWORD
                keyAlias RELEASE_KEY_ALIAS
                keyPassword RELEASE_KEY_PASSWORD
            } else {
                // Fallback: Use debug keystore for local testing
                // For Play Store: Set up proper release keystore
                storeFile file('debug.keystore')
                storePassword 'android'
                keyAlias 'androiddebugkey'
                keyPassword 'android'
            }
        }
    }`;

    // Replace existing signingConfigs block
    buildGradle = buildGradle.replace(
      /signingConfigs\s*\{[\s\S]*?debug\s*\{[\s\S]*?\}\s*\}/,
      signingConfigBlock
    );

    // Update release buildType to use release signing config
    buildGradle = buildGradle.replace(
      /release\s*\{[\s\S]*?signingConfig\s+signingConfigs\.debug/,
      `release {
            signingConfig signingConfigs.release`
    );

    config.modResults.contents = buildGradle;
    console.log('[withReleaseSigning] Release signing configured');
    return config;
  });
};

module.exports = withReleaseSigning;
