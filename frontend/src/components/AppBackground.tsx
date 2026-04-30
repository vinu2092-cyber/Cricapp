import React from 'react';
import { View, ImageBackground, StyleSheet, ImageBackgroundProps } from 'react-native';
import { useWallpaper } from '../hooks/useWallpaper';

type Props = {
  children: React.ReactNode;
  style?: ImageBackgroundProps['style'];
  resizeMode?: ImageBackgroundProps['resizeMode'];
};

/**
 * AppBackground — renders the user-selected wallpaper behind its children.
 * Automatically picks between the packaged `wallpaper.png`, a solid color
 * (black / white / light green) or a custom photo from the user's gallery.
 */
export default function AppBackground({ children, style, resizeMode = 'cover' }: Props) {
  const { source, color } = useWallpaper();

  if (source) {
    return (
      <ImageBackground source={source} style={[styles.flex, style]} resizeMode={resizeMode}>
        {children}
      </ImageBackground>
    );
  }

  // Solid color fallback
  return (
    <View style={[styles.flex, style, { backgroundColor: color || '#FFFFFF' }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
