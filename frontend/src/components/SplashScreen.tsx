import React, { useEffect } from 'react';
import { View, Image, StyleSheet, Dimensions, StatusBar } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

const screen = Dimensions.get('screen');

interface SplashScreenProps {
  onFinish: () => void;
  duration?: number;
}

const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish, duration = 2500 }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onFinish();
    }, duration);

    return () => clearTimeout(timer);
  }, [onFinish, duration]);

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />
      {/* Top half matches wallpaper top edge color */}
      <View style={styles.topHalf} />
      {/* Bottom half matches wallpaper bottom edge color */}
      <View style={styles.bottomHalf} />
      <Image
        source={require('../../assets/splash_screen.png')}
        style={styles.image}
        resizeMode="contain"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#DFF7E9',
  },
  topHalf: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
    backgroundColor: '#DFF7E9',
  },
  bottomHalf: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '50%',
    backgroundColor: '#EDD9C0',
  },
  image: {
    width: screen.width,
    height: screen.height,
    position: 'absolute',
    top: 0,
    left: 0,
  },
});

export default SplashScreen;
