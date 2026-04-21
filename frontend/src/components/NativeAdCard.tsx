/**
 * NativeAdCard (v1.0.11 banner-only build)
 * ----------------------------------------
 * 2026-04-21 user update: native advanced ads (Videoads1 + Videoads2) had
 * ~0% match rate in production — scrapped them entirely. This component
 * is now a thin rotator over **banner ads only**:
 *
 *   Slot 0 → Banner #1 MEDIUM_RECTANGLE 300×250
 *   Slot 1 → Banner #2 ANCHORED_ADAPTIVE_BANNER (auto-adjusts width)
 *   Slot 2 → Banner #3 MEDIUM_RECTANGLE 300×250
 *   Slot 3+ cycles back.
 *
 * We keep the component name `NativeAdCard` so every call site
 * (`<NativeAdCard slotIndex={n} />`) continues to work unchanged — the
 * name is now a historical artefact of the previous build.
 *
 * AdMob policy:
 *   • Banner uses Google's own chrome (Ad badge + AdChoices icon).
 *   • Failed loads hide the slot silently → no empty boxes.
 *   • Different unit IDs per slot → Google serves different creatives.
 */

import React, { useMemo, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { BannerAd } from 'react-native-google-mobile-ads';
import { resolveAdSlot, resolveBannerSize, AdSlotDescriptor } from '../services/NativeAdRotator';

interface NativeAdCardProps {
  /** Explicit ad unit ID — treated as a MEDIUM_RECTANGLE banner. Back-compat. */
  adUnitId?: string;
  /** Stable slot index; resolves to a slot from the rotator. */
  slotIndex?: number;
  /** Vertical margin — callers inside tight layouts may want smaller gaps. */
  marginVertical?: number;
  /** Fired after the ad successfully loads. */
  onLoaded?: () => void;
  /** Fired if the ad fails — parent can hide the slot entirely. */
  onFailed?: (err: unknown) => void;
}

const NativeAdCard: React.FC<NativeAdCardProps> = ({
  adUnitId,
  slotIndex,
  marginVertical = 10,
  onLoaded,
  onFailed,
}) => {
  const slot: AdSlotDescriptor = useMemo(() => {
    if (adUnitId) {
      return { kind: 'banner', size: 'medium', unitId: adUnitId, label: 'explicit' };
    }
    const idx = typeof slotIndex === 'number' ? slotIndex : Math.floor(Math.random() * 3);
    return resolveAdSlot(idx);
  }, [adUnitId, slotIndex]);

  return <BannerSlot slot={slot} marginVertical={marginVertical} onLoaded={onLoaded} onFailed={onFailed} />;
};

/** Renders a single banner. Collapses to null on load failure. */
const BannerSlot: React.FC<{
  slot: AdSlotDescriptor;
  marginVertical: number;
  onLoaded?: () => void;
  onFailed?: (err: unknown) => void;
}> = ({ slot, marginVertical, onLoaded, onFailed }) => {
  const [errored, setErrored] = useState(false);
  const { width } = useWindowDimensions();
  const bannerSize = resolveBannerSize(slot.size);

  if (errored) return null;

  return (
    <View
      style={[
        styles.bannerWrap,
        // Medium rectangle is fixed 300×250; adaptive fills available width.
        slot.size === 'adaptive'
          ? { minHeight: 60, width: Math.max(320, width - 16) }
          : { minHeight: 250 },
        { marginVertical },
      ]}
    >
      <BannerAd
        unitId={slot.unitId}
        size={bannerSize}
        requestOptions={{ requestNonPersonalizedAdsOnly: false }}
        onAdLoaded={() => onLoaded?.()}
        onAdFailedToLoad={(err) => {
          // eslint-disable-next-line no-console
          console.warn('[BannerSlot] load failed', slot.label, (err as any)?.message || err);
          setErrored(true);
          onFailed?.(err);
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  bannerWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginHorizontal: 8,
  },
});

export default NativeAdCard;
