import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Animated,
  StatusBar,
  Platform,
} from 'react-native';

interface SplashScreenProps {
  onFinish: () => void;
}

export default function SplashScreen({ onFinish }: SplashScreenProps) {
  const [fadeAnim] = useState(new Animated.Value(0));
  const [ballBounce] = useState(new Animated.Value(0));
  const [dotOpacity] = useState([
    new Animated.Value(0.3),
    new Animated.Value(0.3),
    new Animated.Value(0.3),
    new Animated.Value(0.3),
    new Animated.Value(0.3),
    new Animated.Value(0.3),
  ]);

  useEffect(() => {
    // Hide status bar for truly fullscreen splash
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
        Animated.delay(index * 150),
        Animated.timing(anim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.3, duration: 300, useNativeDriver: true }),
      ])
    );
    Animated.loop(Animated.parallel(animations)).start();

    // Ball bounce
    Animated.loop(
      Animated.sequence([
        Animated.timing(ballBounce, { toValue: -20, duration: 400, useNativeDriver: true }),
        Animated.timing(ballBounce, { toValue: 0, duration: 400, useNativeDriver: true }),
      ])
    ).start();

    // Auto-dismiss after 3s
    const timer = setTimeout(() => {
      // Show status bar again before transitioning
      if (Platform.OS === 'android') {
        StatusBar.setHidden(false, 'fade');
      }
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(() => onFinish());
    }, 3000);

    return () => {
      clearTimeout(timer);
      if (Platform.OS === 'android') {
        StatusBar.setHidden(false, 'fade');
      }
    };
  }, []);

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      {/* Full screen background - uses absoluteFillObject for true fullscreen */}
      <Image
        source={require('../../assets/splash_doodle.png')}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
      />

      {/* Loading overlay at bottom */}
      <View style={styles.loadingOverlay}>
        <View style={styles.dotsContainer}>
          {dotOpacity.map((opacity, index) => (
            <Animated.View key={index} style={[styles.dot, { opacity }]} />
          ))}
        </View>

        <Animated.View style={{ transform: [{ translateY: ballBounce }] }}>
          <View style={styles.cricketBall}>
            <View style={styles.ballSeam} />
          </View>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#f5f5dc',
    zIndex: 9999,
  },
  loadingOverlay: {
    position: 'absolute',
    bottom: 80,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#E8B762',
  },
  cricketBall: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#C84B31',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
  },
  ballSeam: {
    width: 40,
    height: 4,
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
    transform: [{ rotate: '-20deg' }],
  },
});
