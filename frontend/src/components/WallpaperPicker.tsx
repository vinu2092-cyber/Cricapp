import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import {
  useWallpaper,
  WALLPAPER_PRESETS,
  WallpaperChoice,
} from '../hooks/useWallpaper';

/**
 * Settings-section component that lets the user pick one of 4 preset
 * wallpapers or upload a custom photo from the gallery.
 * Persists via `useWallpaper` → AsyncStorage.
 */
export default function WallpaperPicker() {
  const { choice, customUri, setWallpaper } = useWallpaper();
  const [picking, setPicking] = useState(false);

  const onPickCustom = async () => {
    try {
      setPicking(true);
      // Ask for media library permission
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Permission needed',
          'Please allow photo library access to pick a custom wallpaper.',
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.85,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) return;
      await setWallpaper('custom', asset.uri);
    } catch {
      Alert.alert('Error', 'Could not pick image. Please try again.');
    } finally {
      setPicking(false);
    }
  };

  // v1.0.11 — ordering changed. 'white' (labelled "Standard") is now the
  // first tile so users immediately see the new default selection.
  const presetKeys: WallpaperChoice[] = ['white', 'default', 'black', 'lightgreen'];

  return (
    <View style={s.container}>
      <Text style={s.title}>Change Background</Text>
      <Text style={s.subtitle}>Pick a standard theme or upload your own photo</Text>

      <View style={s.grid}>
        {presetKeys.map((key) => {
          const preset = WALLPAPER_PRESETS[key];
          const isActive = choice === key;
          return (
            <TouchableOpacity
              key={key}
              style={[s.tile, isActive && s.tileActive]}
              onPress={() => setWallpaper(key)}
              data-testid={`wallpaper-${key}`}
            >
              <View style={[s.tileInner, preset.color ? { backgroundColor: preset.color } : null]}>
                {preset.source ? (
                  <Image source={preset.source} style={s.tileImg} resizeMode="cover" />
                ) : null}
              </View>
              <Text style={s.tileLabel}>{preset.label}</Text>
              {isActive ? (
                <View style={s.activeBadge}>
                  <Ionicons name="checkmark-circle" size={18} color="#4CAF50" />
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}

        {/* Custom tile */}
        <TouchableOpacity
          style={[s.tile, choice === 'custom' && s.tileActive]}
          onPress={onPickCustom}
          disabled={picking}
          data-testid="wallpaper-custom"
        >
          <View style={[s.tileInner, { backgroundColor: '#2A2A2A' }]}>
            {choice === 'custom' && customUri ? (
              <Image source={{ uri: customUri }} style={s.tileImg} resizeMode="cover" />
            ) : (
              <Ionicons name="image-outline" size={36} color="#AAA" />
            )}
          </View>
          <Text style={s.tileLabel}>{picking ? 'Opening…' : 'Custom Photo'}</Text>
          {choice === 'custom' ? (
            <View style={s.activeBadge}>
              <Ionicons name="checkmark-circle" size={18} color="#4CAF50" />
            </View>
          ) : null}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { marginBottom: 24 },
  title: { fontSize: 16, fontWeight: '700', color: '#FFF', marginBottom: 4 },
  subtitle: { fontSize: 12, color: '#999', marginBottom: 14 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  tile: {
    width: '30%',
    alignItems: 'center',
    position: 'relative',
  },
  tileActive: {
    transform: [{ scale: 1.03 }],
  },
  tileInner: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 10,
    backgroundColor: '#2A2A2A',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#333',
  },
  tileImg: { width: '100%', height: '100%' },
  tileLabel: { color: '#DDD', fontSize: 12, marginTop: 6, textAlign: 'center' },
  activeBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10,
  },
});
