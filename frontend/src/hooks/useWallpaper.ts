import { useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ImageSourcePropType } from 'react-native';

const WALLPAPER_KEY = 'cricapp_wallpaper_v1';
const CUSTOM_URI_KEY = 'cricapp_wallpaper_custom_uri_v1';

export type WallpaperChoice = 'default' | 'black' | 'white' | 'lightgreen' | 'custom';

/**
 * Built-in wallpaper presets — all packaged as solid background colors
 * (except `default` which uses the original painted wallpaper.png asset).
 * Pastel palette keeps the UI readable on light themes.
 */
export const WALLPAPER_PRESETS: Record<
  WallpaperChoice,
  { label: string; color?: string; source?: ImageSourcePropType }
> = {
  // "white" moved to label "Standard" so it reads as the shipped default.
  // The actual fallback-to-white is handled in useWallpaper() above.
  white:      { label: 'Standard',    color: '#FFFFFF' },
  default:    { label: 'Classic',     source: require('../../assets/images/wallpaper.png') },
  black:      { label: 'Black',       color: '#0E0E0E' },
  lightgreen: { label: 'Light Green', color: '#DDEEDD' },
  custom:     { label: 'Custom Photo' },
};

interface WallpaperState {
  choice: WallpaperChoice;
  customUri?: string;
}

/**
 * useWallpaper — single source of truth for background selection.
 * Any component rendering the match/home background should call this hook
 * to resolve either an `ImageSource` (for default/custom) or a `color` (for solids).
 */
export function useWallpaper() {
  // v1.0.11 — Default changed from 'default' (painted wallpaper.png) to
  // 'white'. User requested white to be the standard / out-of-the-box
  // wallpaper. Users who previously saved 'default' explicitly keep it;
  // only *unset* preferences are migrated to white.
  const [state, setState] = useState<WallpaperState>({ choice: 'white' });

  // Load persisted selection on mount
  useEffect(() => {
    (async () => {
      try {
        const [choiceRaw, customUri] = await Promise.all([
          AsyncStorage.getItem(WALLPAPER_KEY),
          AsyncStorage.getItem(CUSTOM_URI_KEY),
        ]);
        const choice = (choiceRaw as WallpaperChoice) || 'white';
        setState({ choice, customUri: customUri || undefined });
      } catch {
        /* ignore — fall back to white */
      }
    })();
  }, []);

  const setWallpaper = useCallback(async (choice: WallpaperChoice, customUri?: string) => {
    setState({ choice, customUri });
    try {
      await AsyncStorage.setItem(WALLPAPER_KEY, choice);
      if (customUri) await AsyncStorage.setItem(CUSTOM_URI_KEY, customUri);
    } catch {
      /* ignore persistence errors — in-memory state still reflects the change */
    }
  }, []);

  // Resolve what to actually render
  const resolved = (() => {
    if (state.choice === 'custom' && state.customUri) {
      return { source: { uri: state.customUri } as ImageSourcePropType };
    }
    const preset = WALLPAPER_PRESETS[state.choice] || WALLPAPER_PRESETS.default;
    if (preset.source) return { source: preset.source };
    if (preset.color) return { color: preset.color };
    return { source: WALLPAPER_PRESETS.default.source };
  })();

  return {
    choice: state.choice,
    customUri: state.customUri,
    source: (resolved as any).source as ImageSourcePropType | undefined,
    color: (resolved as any).color as string | undefined,
    setWallpaper,
  };
}
