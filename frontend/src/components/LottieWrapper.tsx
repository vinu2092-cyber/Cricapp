/**
 * LottieWrapper — Platform-safe Lottie component
 * This wrapper ensures Lottie is only loaded on native platforms
 * Web build gets a fallback emoji display
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

// Dynamic import for native only
let LottieViewNative: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  LottieViewNative = require('lottie-react-native').default;
} catch {
  LottieViewNative = null;
}

interface LottieWrapperProps {
  source: any;
  autoPlay?: boolean;
  loop?: boolean;
  style?: any;
  resizeMode?: 'cover' | 'contain' | 'center';
  fallbackEmoji?: string;
}

const LottieWrapper: React.FC<LottieWrapperProps> = ({
  source,
  autoPlay = true,
  loop = false,
  style,
  resizeMode = 'contain',
  fallbackEmoji = '🎯',
}) => {
  // If Lottie is not available (web or load failed), show fallback
  if (!LottieViewNative || !source) {
    return (
      <View style={[styles.fallback, style]}>
        <Text style={styles.fallbackEmoji}>{fallbackEmoji}</Text>
      </View>
    );
  }

  return (
    <LottieViewNative
      source={source}
      autoPlay={autoPlay}
      loop={loop}
      style={style}
      resizeMode={resizeMode}
    />
  );
};

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackEmoji: {
    fontSize: 48,
  },
});

export default LottieWrapper;
