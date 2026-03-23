import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePro } from '../context/ProContext';

interface AdModalProps {
  visible: boolean;
  onClose: () => void;
}

const AdModal: React.FC<AdModalProps> = ({ visible, onClose }) => {
  const { adsWatched, watchAd, cancelAdChallenge, isPro } = usePro();
  const [countdown, setCountdown] = useState(5);
  const [isAdPlaying, setIsAdPlaying] = useState(false);
  const [pulseAnim] = useState(new Animated.Value(1));

  useEffect(() => {
    if (visible && !isPro) {
      startPulseAnimation();
    }
  }, [visible]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (isAdPlaying && countdown > 0) {
      timer = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
    } else if (countdown === 0 && isAdPlaying) {
      setIsAdPlaying(false);
      setCountdown(5);
      watchAd();
    }
    return () => clearInterval(timer);
  }, [isAdPlaying, countdown]);

  useEffect(() => {
    if (isPro) {
      setTimeout(onClose, 1000);
    }
  }, [isPro]);

  const startPulseAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const handleStartAd = () => {
    setIsAdPlaying(true);
    setCountdown(5);
  };

  const handleCancel = () => {
    cancelAdChallenge();
    setIsAdPlaying(false);
    setCountdown(5);
    onClose();
  };

  if (isPro) {
    return (
      <Modal visible={visible} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.successContainer}>
            <Ionicons name="checkmark-circle" size={80} color="#4CAF50" />
            <Text style={styles.successText}>Pro Unlocked!</Text>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.adBanner}>
          <Text style={styles.testAdText}>TEST AD</Text>
        </View>

        <View style={styles.adContent}>
          <View style={styles.adBox}>
            <Ionicons name="pencil" size={24} color="#888" />
            <Text style={styles.partnerText}>CrickApp Premium Partner</Text>
            <Text style={styles.sponsoredText}>Sponsored Content</Text>
            <Text style={styles.adDescription}>
              Your ad will appear here.{"\n"}(Ad: test of simulation)
            </Text>
            <Text style={styles.disclaimer}>
              This is a test ad, for Base Screening.{"\n"}(Ad: test of simulation)
            </Text>
          </View>

          {isAdPlaying && (
            <Text style={styles.countdown}>Ad closes in {countdown}s</Text>
          )}
        </View>

        <View style={styles.bottomSection}>
          <View style={styles.unlockHeader}>
            <Ionicons name="lock-closed" size={24} color="#FFD700" />
            <Text style={styles.unlockTitle}>Unlock Pro - Watch Ads</Text>
          </View>

          <View style={styles.progressContainer}>
            {[1, 2, 3].map((num) => (
              <Animated.View
                key={num}
                style={[
                  styles.progressCircle,
                  num <= adsWatched && styles.progressCircleComplete,
                  num === adsWatched + 1 && {
                    transform: [{ scale: pulseAnim }],
                  },
                ]}
              >
                <Text
                  style={[
                    styles.progressNumber,
                    num <= adsWatched && styles.progressNumberComplete,
                  ]}
                >
                  {num}
                </Text>
              </Animated.View>
            ))}
          </View>

          <Text style={styles.adsWatchedText}>Ads Watched: {adsWatched}/3</Text>

          {!isAdPlaying && (
            <TouchableOpacity
              style={styles.watchAdButton}
              onPress={handleStartAd}
              activeOpacity={0.8}
            >
              <Ionicons name="play" size={20} color="#000" />
              <Text style={styles.watchAdButtonText}>Watch Ad {adsWatched + 1}</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleCancel}
            activeOpacity={0.8}
          >
            <Text style={styles.cancelButtonText}>Cancel Challenge</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
  },
  adBanner: {
    backgroundColor: '#333',
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'flex-start',
  },
  testAdText: {
    color: '#888',
    fontSize: 12,
  },
  adContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  adBox: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    width: '90%',
  },
  partnerText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 12,
  },
  sponsoredText: {
    color: '#888',
    fontSize: 12,
    marginTop: 4,
  },
  adDescription: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 16,
  },
  disclaimer: {
    color: '#555',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 12,
    fontStyle: 'italic',
  },
  countdown: {
    color: '#FFFFFF',
    fontSize: 16,
    marginTop: 20,
  },
  bottomSection: {
    backgroundColor: '#1a1a1a',
    padding: 24,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  unlockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    gap: 8,
  },
  unlockTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    marginBottom: 16,
  },
  progressCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#444',
  },
  progressCircleComplete: {
    backgroundColor: '#FFD700',
    borderColor: '#FFD700',
  },
  progressNumber: {
    color: '#888',
    fontSize: 18,
    fontWeight: 'bold',
  },
  progressNumberComplete: {
    color: '#000',
  },
  adsWatchedText: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  watchAdButton: {
    flexDirection: 'row',
    backgroundColor: '#FFD700',
    paddingVertical: 14,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  watchAdButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  cancelButton: {
    paddingVertical: 14,
    borderRadius: 25,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#444',
  },
  cancelButtonText: {
    color: '#888',
    fontSize: 14,
  },
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  successText: {
    color: '#4CAF50',
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 16,
  },
});

export default AdModal;
