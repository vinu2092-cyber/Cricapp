import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  StatusBar,
  Platform,
  Dimensions,
} from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('screen');

interface SplashScreenProps {
  onFinish: () => void;
}

export default function SplashScreen({ onFinish }: SplashScreenProps) {
  const [fadeAnim] = useState(new Animated.Value(0));
  const [ballBounce] = useState(new Animated.Value(0));
  const [titleScale] = useState(new Animated.Value(0.5));
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

    // Fade in
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();

    // Title scale
    Animated.spring(titleScale, {
      toValue: 1,
      friction: 5,
      tension: 80,
      useNativeDriver: true,
    }).start();

    // Loading dots
    const animations = dotOpacity.map((anim, index) =>
      Animated.sequence([
        Animated.delay(index * 200),
        Animated.timing(anim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.3, duration: 400, useNativeDriver: true }),
      ])
    );
    Animated.loop(Animated.parallel(animations)).start();

    // Ball bounce
    Animated.loop(
      Animated.sequence([
        Animated.timing(ballBounce, { toValue: -25, duration: 350, useNativeDriver: true }),
        Animated.timing(ballBounce, { toValue: 0, duration: 350, useNativeDriver: true }),
      ])
    ).start();

    // Auto-dismiss
    const timer = setTimeout(() => {
      if (Platform.OS === 'android') {
        StatusBar.setHidden(false, 'fade');
      }
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => onFinish());
    }, 2500);

    return () => {
      clearTimeout(timer);
      if (Platform.OS === 'android') {
        StatusBar.setHidden(false, 'fade');
      }
    };
  }, []);

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      {/* Green cricket ground gradient background */}
      <View style={styles.topGradient} />
      <View style={styles.midGradient} />
      <View style={styles.bottomGradient} />

      {/* Cricket pitch lines */}
      <View style={styles.pitchLines}>
        <View style={styles.pitchLine} />
        <View style={[styles.pitchLine, { width: '60%' }]} />
        <View style={[styles.pitchLine, { width: '40%' }]} />
      </View>

      {/* App branding */}
      <View style={styles.brandingContainer}>
        <Animated.View style={[styles.ballContainer, { transform: [{ translateY: ballBounce }] }]}>
          <View style={styles.cricketBall}>
            <View style={styles.ballSeam} />
            <View style={[styles.ballSeam, { transform: [{ rotate: '60deg' }] }]} />
          </View>
        </Animated.View>

        <Animated.Text style={[styles.appName, { transform: [{ scale: titleScale }] }]}>
          CricApp
        </Animated.Text>
        <Text style={styles.tagline}>Live Cricket at Your Fingertips</Text>
      </View>

      {/* Loading dots at bottom */}
      <View style={styles.loadingContainer}>
        <View style={styles.dotsRow}>
          {dotOpacity.map((opacity, index) => (
            <Animated.View key={index} style={[styles.dot, { opacity }]} />
          ))}
        </View>
        <Text style={styles.loadingText}>Loading matches...</Text>
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '40%',
    backgroundColor: '#1B5E20',
  },
  midGradient: {
    position: 'absolute',
    top: '40%',
    left: 0,
    right: 0,
    height: '30%',
    backgroundColor: '#2E7D32',
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '30%',
    backgroundColor: '#388E3C',
  },
  pitchLines: {
    position: 'absolute',
    top: '35%',
    width: '100%',
    alignItems: 'center',
    gap: 8,
    opacity: 0.15,
  },
  pitchLine: {
    width: '80%',
    height: 2,
    backgroundColor: '#FFF',
    borderRadius: 1,
  },
  brandingContainer: {
    alignItems: 'center',
    zIndex: 10,
  },
  ballContainer: {
    marginBottom: 20,
  },
  cricketBall: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#D32F2F',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 10,
    borderWidth: 2,
    borderColor: '#B71C1C',
  },
  ballSeam: {
    position: 'absolute',
    width: 55,
    height: 3,
    backgroundColor: '#FFEB3B',
    borderRadius: 2,
    transform: [{ rotate: '-30deg' }],
  },
  appName: {
    fontSize: 48,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 3,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 8,
  },
  tagline: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 8,
    letterSpacing: 1,
    fontWeight: '500',
  },
  loadingContainer: {
    position: 'absolute',
    bottom: 80,
    alignItems: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
  },
  loadingText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '500',
  },
});
