import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ImageBackground,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ErrorScreenProps {
  onGoBack: () => void;
  message?: string;
}

const ErrorScreen: React.FC<ErrorScreenProps> = ({
  onGoBack,
  message = 'Could not load match.',
}) => {
  return (
    <ImageBackground
      source={require('../../assets/images/wallpaper.png')}
      style={styles.background}
      resizeMode="repeat"
    >
      <View style={styles.container}>
        <View style={styles.errorBox}>
          <Ionicons name="wifi" size={60} color="#666" />
          <View style={styles.slashLine} />
          <Text style={styles.errorText}>{message}</Text>
          <TouchableOpacity
            style={styles.goBackButton}
            onPress={onGoBack}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-back" size={18} color="#FFFFFF" />
            <Text style={styles.goBackText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#1a1a1a',
    width: '80%',
  },
  slashLine: {
    position: 'absolute',
    top: 45,
    width: 70,
    height: 3,
    backgroundColor: '#FF4444',
    transform: [{ rotate: '-45deg' }],
  },
  errorText: {
    fontSize: 18,
    color: '#1a1a1a',
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 24,
    textAlign: 'center',
  },
  goBackButton: {
    flexDirection: 'row',
    backgroundColor: '#7B68EE',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 25,
    alignItems: 'center',
    gap: 8,
  },
  goBackText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ErrorScreen;
