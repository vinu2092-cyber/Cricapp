const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Config plugin to add FloatingWidgetService to AndroidManifest.xml
 * This ensures the service is preserved when running expo prebuild
 */
const withFloatingWidget = (config) => {
  return withAndroidManifest(config, async (config) => {
    const mainApplication = config.modResults.manifest.application?.[0];
    
    if (!mainApplication) {
      console.warn('withFloatingWidget: No application found in manifest');
      return config;
    }
    
    // Check if FOREGROUND_SERVICE permission exists
    const permissions = config.modResults.manifest['uses-permission'] || [];
    const hasForegroundService = permissions.some(
      (p) => p.$?.['android:name'] === 'android.permission.FOREGROUND_SERVICE'
    );
    
    if (!hasForegroundService) {
      permissions.push({
        $: { 'android:name': 'android.permission.FOREGROUND_SERVICE' }
      });
    }
    
    // Check for FOREGROUND_SERVICE_SPECIAL_USE
    const hasSpecialUse = permissions.some(
      (p) => p.$?.['android:name'] === 'android.permission.FOREGROUND_SERVICE_SPECIAL_USE'
    );
    
    if (!hasSpecialUse) {
      permissions.push({
        $: { 'android:name': 'android.permission.FOREGROUND_SERVICE_SPECIAL_USE' }
      });
    }
    
    config.modResults.manifest['uses-permission'] = permissions;
    
    // Add FloatingWidgetService if not present
    if (!mainApplication.service) {
      mainApplication.service = [];
    }
    
    const serviceExists = mainApplication.service.some(
      (s) => s.$?.['android:name'] === '.floatingwidget.FloatingWidgetService'
    );
    
    if (!serviceExists) {
      mainApplication.service.push({
        $: {
          'android:name': '.floatingwidget.FloatingWidgetService',
          'android:enabled': 'true',
          'android:exported': 'false',
          'android:foregroundServiceType': 'specialUse',
        },
        property: [
          {
            $: {
              'android:name': 'android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE',
              'android:value': 'floating_overlay_widget',
            },
          },
        ],
      });
    }
    
    return config;
  });
};

module.exports = withFloatingWidget;
