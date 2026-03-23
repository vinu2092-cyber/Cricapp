import React, { useState, useEffect } from 'react';
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
  const { isPro, getProTimeRemaining } = usePro();
  const [timeRemaining, setTimeRemaining] = useState<string>('');

  useEffect(() => {
    if (isPro) {
      const updateTimer = () => {
        const remaining = getProTimeRemaining();
        if (remaining > 0) {
          const minutes = Math.floor(remaining / 60000);
          const seconds = Math.floor((remaining % 60000) / 1000);
          setTimeRemaining(`${minutes}:${seconds.toString().padStart(2, '0')}`);
        } else {
          setTimeRemaining('');
        }
      };
      
      updateTimer();
      const interval = setInterval(updateTimer, 1000);
      return () => clearInterval(interval);
    }
  }, [isPro, getProTimeRemaining]);

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
            color={isPro ? '#FFF' : '#1a1a1a'}
          />
          <View style={styles.proButtonContent}>
            <Text style={[styles.proButtonText, isPro && styles.proButtonTextActive]}>
              {isPro ? 'PRO' : 'UNLOCK PRO'}
            </Text>
            {isPro && timeRemaining && (
              <Text style={styles.proTimerText}>{timeRemaining}</Text>
            )}
          </View>
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
  proButtonContent: {
    alignItems: 'center',
  },
  proButtonText: {
    color: '#1a1a1a',
    fontWeight: 'bold',
    fontSize: 12,
  },
  proButtonTextActive: {
    color: '#FFF',
  },
  proTimerText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '600',
    opacity: 0.9,
  },
});

export default Header;
