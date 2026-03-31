import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  StatusBar,
  Platform,
  Dimensions,
  Image,
} from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('screen');

interface SplashScreenProps {
  onFinish: () => void;
}

export default function SplashScreen({ onFinish }: SplashScreenProps) {
  const [fadeAnim] = useState(new Animated.Value(0));
  const [dotOpacity] = useState([
    new Animated.Value(0.3),
    new Animated.Value(0.3),
    new Animated.Value(0.3),
  ]);

  useEffect(() => {
    if (Platform.OS === 'android') {
      StatusBar.setHidden(true, 'fade');
      StatusBar.setTranslucent(true);
    }

    // Fade in animation
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();

    // Loading dots animation
    const animations = dotOpacity.map((anim, index) =>
      Animated.sequence([
        Animated.delay(index * 200),
        Animated.timing(anim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.3, duration: 400, useNativeDriver: true }),
      ])
    );
    Animated.loop(Animated.parallel(animations)).start();

    // Auto-dismiss after 2.5 seconds
    const timer = setTimeout(() => {
      if (Platform.OS === 'android') {
        StatusBar.setHidden(false, 'fade');
      }
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(() => onFinish());
    }, 2500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      {/* 1. Full Screen Background Image */}
      <Image 
        source={require('../../assets/splash_screen.png')} 
        style={styles.backgroundImage}
        resizeMode="cover"
      />

      {/* 2. Loading Dots at the Bottom */}
      <View style={styles.loadingContainer}>
        <View style={styles.dotsRow}>
          {dotOpacity.map((opacity, index) => (
            <Animated.View key={index} style={[styles.dot, { opacity: opacity as any }]} />
          ))}
        </View>
        <Text style={styles.loadingText}>Connecting to Server...</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    zIndex: 9999,
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  loadingContainer: {
    position: 'absolute',
    bottom: 70,
    width: '100%',
    alignItems: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 10,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 4,
  },
});
