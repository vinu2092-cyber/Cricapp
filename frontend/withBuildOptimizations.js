/**
 * withBuildOptimizations.js - Expo Config Plugin for Build Size Optimization
 * 
 * This plugin optimizes Android builds by enabling:
 * 1. Proguard - Code obfuscation and minification
 * 2. Hermes - Optimized JavaScript engine
 * 3. APK Splitting - Separate APKs per CPU architecture
 * 
 * Place this in the project root and add to app.json:
 * "plugins": ["./withBuildOptimizations.js"]
 */

const { withAppBuildGradle, withProjectBuildGradle } = require('@expo/config-plugins');

const withBuildOptimizations = (config) => {
  // Enable Proguard for release builds
  config = withAppBuildGradle(config, (config) => {
    if (config.modResults.contents) {
      let contents = config.modResults.contents;
      
      // Enable Proguard/R8 minification
      if (!contents.includes('minifyEnabled true')) {
        contents = contents.replace(
          /buildTypes\s*\{\s*release\s*\{/,
          `buildTypes {
        release {
            minifyEnabled true
            shrinkResources true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'`
        );
      }
      
      // Enable APK splitting per CPU architecture
      if (!contents.includes('enableSeparateBuildPerCPUArchitecture')) {
        contents = contents.replace(
          /android\s*\{/,
          `android {
    splits {
        abi {
            reset()
            enable true
            universalApk false
            include "armeabi-v7a", "arm64-v8a", "x86", "x86_64"
        }
    }
    
    project.ext.react = [
        enableHermes: true,
        enableSeparateBuildPerCPUArchitecture: true
    ]`
        );
      }
      
      // Ensure Hermes is enabled
      if (!contents.includes('enableHermes')) {
        contents = contents.replace(
          /project\.ext\.react\s*=\s*\[/,
          `project.ext.react = [
        enableHermes: true,`
        );
      }
      
      config.modResults.contents = contents;
    }
    return config;
  });
  
  return config;
};

module.exports = withBuildOptimizations;
