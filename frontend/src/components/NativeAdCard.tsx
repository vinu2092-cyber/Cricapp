/**
 * NativeAdCard (v1.0.16 — zero-stagger, on-mount-only request)
 * -------------------------------------------------------------
 * User update 2026-05-06: Banner #1 (8616886104) DELETED globally.
 * Every active slot now uses Banner #2 (`2958604357`) at different
 * sizes (320×50 / 300×250). See NativeAdRotator.ts for rotation.
 *
 * IMPRESSION-RATE FIX:
 * --------------------
 *   • Removed all stagger delays (was 0s/3s previously). The component
 *     now mounts the BannerAd in the SAME paint cycle as the slot
 *     becoming visible. This guarantees the AdMob request and the
 *     on-screen impression fire together — no preload-then-unmount
 *     burning ad requests without an impression.
 *
 *   • Visibility-guarded: BannerAd is only rendered while the slot is
 *     active (not 'inactive') AND not in an errored state. If load
 *     fails the slot collapses to null instantly so we never reload
 *     a dead slot in the same session.
 *
 *   • Slot 2 (legacy Banner #3 placeholder) is still inactive — calls
 *     receive a null render, no request is fired.
 */

import React, { useMemo, useState } from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import { BannerAd } from 'react-native-google-mobile-ads';
import {
  resolveAdSlot,
  resolveBannerSize,
  minHeightForSize,
  isSlotActive,
  AdSlotDescriptor,
} from '../services/NativeAdRotator';

interface NativeAdCardProps {
  /** Explicit ad unit ID — treated as a MEDIUM_RECTANGLE banner. Back-compat. */
  adUnitId?: string;
  /** Stable slot index 0-2 for the three roles; >=3 wraps. */
  slotIndex?: number;
  /** Vertical margin — default 10. */
  marginVertical?: number;
  /** Fired after the ad successfully loads. */
  onLoaded?: () => void;
  /** Fired if the ad fails — parent can hide the slot entirely. */
  onFailed?: (err: unknown) => void;
  /**
   * v1.0.16 — accepted for back-compat only; ignored. We always load
   * immediately on mount to maximise the impression-to-request match
   * rate.
   */
  loadDelayMs?: number;
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
      // Explicit unit ID — treat as MEDIUM_RECTANGLE banner.
      return { kind: 'banner', size: 'medium-rect', unitId: adUnitId, label: 'explicit' };
    }
    const idx = typeof slotIndex === 'number' ? slotIndex : 0;
    return resolveAdSlot(idx);
  }, [adUnitId, slotIndex]);

  // Inactive slot → render nothing, fire no request.
  if (!isSlotActive(slot)) return null;

  return (
    <BannerSlot
      slot={slot}
      marginVertical={marginVertical}
      onLoaded={onLoaded}
      onFailed={onFailed}
    />
  );
};

/**
 * Renders a single banner. Loads on mount (no stagger). Collapses to
 * null on load failure so dead slots don't sit on screen waiting.
 */
const BannerSlot: React.FC<{
  slot: AdSlotDescriptor;
  marginVertical: number;
  onLoaded?: () => void;
  onFailed?: (err: unknown) => void;
}> = ({ slot, marginVertical, onLoaded, onFailed }) => {
  const [errored, setErrored] = useState(false);
  const bannerSize = resolveBannerSize(slot.size);
  const minH = minHeightForSize(slot.size);
  const screenWidth = Dimensions.get('window').width;

  if (errored) return null;

  return (
    <View
      style={[
        styles.bannerWrap,
        { minHeight: minH, marginVertical, width: screenWidth },
      ]}
    >
      <BannerAd
        unitId={slot.unitId}
        size={bannerSize}
        requestOptions={{ requestNonPersonalizedAdsOnly: false }}
        onAdLoaded={() => onLoaded?.()}
        onAdFailedToLoad={(err) => {
          if (__DEV__) {
            // eslint-disable-next-line no-console
            console.warn('[BannerSlot] load failed', slot.label, (err as any)?.message || err);
          }
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
    alignSelf: 'stretch',
    marginHorizontal: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
});

export default NativeAdCard;
