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
    // Fade in animation
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();

    // Loading dots animation (sequential pulse)
    const animateDots = () => {
      const animations = dotOpacity.map((anim, index) => {
        return Animated.sequence([
          Animated.delay(index * 150),
          Animated.timing(anim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0.3,
            duration: 300,
            useNativeDriver: true,
          }),
        ]);
      });
      
      Animated.loop(
        Animated.parallel(animations)
      ).start();
    };

    // Ball bounce animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(ballBounce, {
          toValue: -20,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(ballBounce, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ])
    ).start();

    animateDots();

    // Auto-dismiss after 3 seconds (matches App Open Ad timing)
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

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      {/* Full screen Doodle splash background */}
      <Image
        source={require('../../assets/splash_doodle.png')}
        style={styles.splashBackground}
        resizeMode="cover"
      />
      
      {/* Loading overlay at bottom */}
      <View style={styles.loadingOverlay}>
        {/* Loading dots */}
        <View style={styles.dotsContainer}>
          {dotOpacity.map((opacity, index) => (
            <Animated.View 
              key={index} 
              style={[styles.dot, { opacity }]}
            />
          ))}
        </View>
        
        {/* Bouncing ball */}
        <Animated.View style={[styles.ballContainer, { transform: [{ translateY: ballBounce }] }]}>
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
    backgroundColor: '#E8B762', // Cricket ball orange/tan color
  },
  ballContainer: {
    marginTop: 10,
  },
  cricketBall: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#C84B31', // Cricket ball red
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
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
