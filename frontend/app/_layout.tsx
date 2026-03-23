import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ProProvider } from '../src/context/ProContext';
import { AdMobProvider } from '../src/context/AdMobContext';
import AnimatedGlowBorder from '../src/components/AnimatedGlowBorder';

export default function RootLayout() {
  return (
    <ProProvider>
      <AdMobProvider>
        <StatusBar style="light" />
        <AnimatedGlowBorder>
          <Stack
            screenOptions={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
          />
        </AnimatedGlowBorder>
      </AdMobProvider>
    </ProProvider>
  );
}
