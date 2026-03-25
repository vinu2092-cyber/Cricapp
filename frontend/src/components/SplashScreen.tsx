import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Animated,
  Dimensions,
} from 'react-native';

const { width, height } = Dimensions.get('window');

interface SplashScreenProps {
  onFinish: () => void;
}

export default function SplashScreen({ onFinish }: SplashScreenProps) {
  const [fadeAnim] = useState(new Animated.Value(0));
  const [ballAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    // Fade in animation
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();

    // Rotating ball animation
    Animated.loop(
      Animated.timing(ballAnim, {
        toValue: 1,
        duration: 2000,
        useNativeDriver: true,
      })
    ).start();

    // Auto-dismiss after 3 seconds
    const timer = setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }).start(() => {
        onFinish();
      });
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  const spin = ballAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.container}>
      {/* Full screen splash background */}
      <Image
        source={require('../../assets/splash.png')}
        style={styles.splashBackground}
        resizeMode="cover"
      />
      
      {/* Loading animation overlay */}
      <Animated.View style={[styles.loadingContainer, { opacity: fadeAnim }]}>
        <Text style={styles.loadingText}>Loading Live Scores...</Text>
        
        {/* Animated cricket balls */}
        <View style={styles.ballsContainer}>
          {[0, 1, 2, 3, 4].map((index) => (
            <Animated.View
              key={index}
              style={[
                styles.ball,
                {
                  transform: [{ rotate: spin }],
                  opacity: ballAnim.interpolate({
                    inputRange: [0, 0.2 * (index + 1), 1],
                    outputRange: [0.3, 1, 0.3],
                  }),
                },
              ]}
            >
              <Text style={styles.ballEmoji}>🏏</Text>
            </Animated.View>
          ))}
        </View>
        
        {/* Rotating main ball */}
        <Animated.View style={[styles.mainBall, { transform: [{ rotate: spin }] }]}>
          <Text style={styles.mainBallEmoji}>🏏</Text>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width,
    height,
    backgroundColor: '#f5f5dc',
  },
  splashBackground: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  loadingContainer: {
    position: 'absolute',
    bottom: 200,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
  },
  ballsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  ball: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ballEmoji: {
    fontSize: 28,
  },
  mainBall: {
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  mainBallEmoji: {
    fontSize: 48,
  },
});
