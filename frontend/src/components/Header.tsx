import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ImageBackground,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePro } from '../context/ProContext';

interface HeaderProps {
  onUnlockPro: () => void;
}

const Header: React.FC<HeaderProps> = ({ onUnlockPro }) => {
  const { isPro } = usePro();

  return (
    <ImageBackground
      source={require('../../assets/images/header-grass.png')}
      style={styles.headerBackground}
      resizeMode="cover"
    >
      <View style={styles.headerContent}>
        <View style={styles.logoContainer}>
          <Image
            source={require('../../assets/images/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>
        <TouchableOpacity
          style={[styles.proButton, isPro && styles.proButtonActive]}
          onPress={onUnlockPro}
          activeOpacity={0.8}
        >
          <Ionicons
            name={isPro ? 'checkmark-circle' : 'lock-closed'}
            size={16}
            color="#1a1a1a"
          />
          <Text style={styles.proButtonText}>
            {isPro ? 'PRO' : 'UNLOCK PRO'}
          </Text>
        </TouchableOpacity>
      </View>
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  headerBackground: {
    width: '100%',
    height: 120,
    justifyContent: 'flex-end',
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logo: {
    width: 120,
    height: 50,
  },
  proButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFD700',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  proButtonActive: {
    backgroundColor: '#4CAF50',
  },
  proButtonText: {
    color: '#1a1a1a',
    fontWeight: 'bold',
    fontSize: 12,
  },
});

export default Header;
