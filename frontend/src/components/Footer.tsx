import React from 'react';
import { View, Text, StyleSheet, ImageBackground, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const Footer: React.FC = () => {
  const router = useRouter();

  return (
    <ImageBackground
      source={require('../../assets/images/header-grass.png')}
      style={styles.footerBackground}
      resizeMode="cover"
    >
      <View style={styles.footerContent}>
        <TouchableOpacity
          style={styles.aboutButton}
          onPress={() => router.push('/about')}
        >
          <Ionicons name="information-circle-outline" size={18} color="#FFFFFF" />
          <Text style={styles.aboutText}>About</Text>
        </TouchableOpacity>
      </View>
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  footerBackground: {
    width: '100%',
    height: 50,
    transform: [{ rotate: '180deg' }],
  },
  footerContent: {
    flex: 1,
    transform: [{ rotate: '180deg' }],
    justifyContent: 'center',
    alignItems: 'center',
  },
  aboutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 12,
  },
  aboutText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
});

export default Footer;
