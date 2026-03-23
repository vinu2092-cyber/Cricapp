import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePro } from '../context/ProContext';

interface AdModalProps {
  visible: boolean;
  onClose: () => void;
}

const AdModal: React.FC<AdModalProps> = ({ visible, onClose }) => {
  const { adsWatched, watchAd, cancelAdChallenge, isPro } = usePro();
  const [isLoading, setIsLoading] = useState(false);
  const [adError, setAdError] = useState<string | null>(null);
  const [pulseAnim] = useState(new Animated.Value(1));

  useEffect(() => {
    if (visible && !isPro) {
      startPulseAnimation();
      setAdError(null);
    }
  }, [visible]);

  useEffect(() => {
    if (isPro) {
      setTimeout(onClose, 1500);
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

  const handleWatchAd = async () => {
    setIsLoading(true);
    setAdError(null);

    try {
      // Simulate ad watching (2 seconds per ad)
      // In production native builds, this would show a real AdMob rewarded ad
      await new Promise(resolve => setTimeout(resolve, 2000));
      const unlocked = await watchAd();
      if (unlocked) {
        console.log('Pro unlocked!');
      }
    } catch (error) {
      console.error('Ad error:', error);
      setAdError('Ad service unavailable. Please try again later.');
    }
    
    setIsLoading(false);
  };

  const handleCancel = () => {
    cancelAdChallenge();
    setIsLoading(false);
    setAdError(null);
    onClose();
  };

  if (isPro) {
    return (
      <Modal visible={visible} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.successContainer}>
            <Ionicons name="checkmark-circle" size={80} color="#4CAF50" />
            <Text style={styles.successText}>Pro Unlocked!</Text>
            <Text style={styles.successSubtext}>Ad-free for 30 minutes</Text>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.adBanner}>
          <Text style={styles.bannerText}>CricApp Pro</Text>
        </View>

        <View style={styles.adContent}>
          <View style={styles.adBox}>
            <Ionicons name="trophy" size={48} color="#FFD700" />
            <Text style={styles.proTitle}>Unlock Pro Features</Text>
            <Text style={styles.proDescription}>
              Watch 3 short video ads to unlock:{'\n\n'}
              ✓ Ad-free experience for 30 mins{'\n'}
              ✓ Floating scoreboard widget{'\n'}
              ✓ Voice commentary{'\n'}
              ✓ Premium features
            </Text>
          </View>

          {adError && (
            <View style={styles.errorContainer}>
              <Ionicons name="warning" size={20} color="#FF6B6B" />
              <Text style={styles.errorText}>{adError}</Text>
            </View>
          )}
        </View>

        <View style={styles.bottomSection}>
          <View style={styles.unlockHeader}>
            <Ionicons name="lock-closed" size={24} color="#FFD700" />
            <Text style={styles.unlockTitle}>Watch Ads to Unlock</Text>
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
                {num <= adsWatched ? (
                  <Ionicons name="checkmark" size={24} color="#000" />
                ) : (
                  <Text
                    style={[
                      styles.progressNumber,
                      num <= adsWatched && styles.progressNumberComplete,
                    ]}
                  >
                    {num}
                  </Text>
                )}
              </Animated.View>
            ))}
          </View>

          <Text style={styles.adsWatchedText}>
            Progress: {adsWatched}/3 ads watched
          </Text>

          <TouchableOpacity
            style={[styles.watchAdButton, isLoading && styles.watchAdButtonDisabled]}
            onPress={handleWatchAd}
            activeOpacity={0.8}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#000" size="small" />
            ) : (
              <>
                <Ionicons name="play-circle" size={24} color="#000" />
                <Text style={styles.watchAdButtonText}>
                  Watch Ad {adsWatched + 1} of 3
                </Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleCancel}
            activeOpacity={0.8}
          >
            <Text style={styles.cancelButtonText}>Maybe Later</Text>
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
    backgroundColor: '#4CAF50',
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  bannerText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  adContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  adBox: {
    backgroundColor: '#1a1a1a',
    borderWidth: 2,
    borderColor: '#FFD700',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    width: '90%',
  },
  proTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 16,
  },
  proDescription: {
    color: '#CCC',
    fontSize: 14,
    textAlign: 'left',
    marginTop: 16,
    lineHeight: 22,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    padding: 12,
    backgroundColor: 'rgba(255, 107, 107, 0.2)',
    borderRadius: 8,
    gap: 8,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 13,
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
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#444',
  },
  progressCircleComplete: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  progressNumber: {
    color: '#888',
    fontSize: 20,
    fontWeight: 'bold',
  },
  progressNumberComplete: {
    color: '#FFF',
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
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 12,
  },
  watchAdButtonDisabled: {
    backgroundColor: '#998700',
  },
  watchAdButtonText: {
    color: '#000',
    fontSize: 17,
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
    fontSize: 32,
    fontWeight: 'bold',
    marginTop: 16,
  },
  successSubtext: {
    color: '#888',
    fontSize: 16,
    marginTop: 8,
  },
});

export default AdModal;
