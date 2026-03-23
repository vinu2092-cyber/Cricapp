import React from 'react';
import { View, StyleSheet, ImageBackground } from 'react-native';

const Footer: React.FC = () => {
  return (
    <ImageBackground
      source={require('../../assets/images/header-grass.png')}
      style={styles.footerBackground}
      resizeMode="cover"
    >
      <View style={styles.footerContent} />
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  footerBackground: {
    width: '100%',
    height: 40,
    transform: [{ rotate: '180deg' }],
  },
  footerContent: {
    flex: 1,
  },
});

export default Footer;
