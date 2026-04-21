/**
 * NativeAdCard (v1.0.12 rev-3 — full-width adaptive + 0/3/6s stagger)
 * ---------------------------------------------------------------------
 * 2026-04-21 rev-3 user updates:
 *
 *   • Full-width header:  "Top Banner (Banner 1) ko screen ke edges tak
 *     stretch karein (width: 100%). Container ki har tarah ki horizontal
 *     padding/margin hata dein." → container is stretch + 0 horizontal
 *     padding + 0 horizontal margin. We also use ANCHORED_ADAPTIVE_BANNER
 *     (which is natively full-width) so the ad creative itself fills the
 *     screen, not just the container.
 *
 *   • Stagger per rev-3: Banner 1 = 0s, Banner 2 = 3s, Banner 3 = 6s.
 *     (Previously 0/3.5/7.) Ensures the three simultaneous ad requests
 *     fire 3s apart so Google's ad server cannot return the same creative
 *     to all three.
 *
 *   • "Ek baar mein screen par sirf EK hi ad dikhe" — enforced together
 *     with CommentarySection which now keeps a minimum 10-row gap between
 *     over-break banners (see shouldShowBannerForItem).
 *
 * Failed loads collapse to null so no empty boxes ever appear.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import { BannerAd } from 'react-native-google-mobile-ads';
import {
  resolveAdSlot,
  resolveBannerSize,
  minHeightForSize,
  AdSlotDescriptor,
} from '../services/NativeAdRotator';

// Stagger delays per slot index — user rev-3 spec:
//   slot 0 → 0s, slot 1 → 3s, slot 2 → 6s, slot 3+ → 6s (capped)
// Multiple simultaneous requests for same unit ID (e.g. multiple
// over-break ads) are further staggered per-instance by the caller via
// the `loadDelayMs` prop.
const STAGGER_DELAYS_MS = [0, 3000, 6000];

interface NativeAdCardProps {
  /** Explicit ad unit ID — treated as a MEDIUM_RECTANGLE banner. Back-compat. */
  adUnitId?: string;
  /** Stable slot index 0-2 for the three roles; >=3 wraps. */
  slotIndex?: number;
  /** Vertical margin — default 10, bump to >= 8 next to other ads. */
  marginVertical?: number;
  /** Fired after the ad successfully loads. */
  onLoaded?: () => void;
  /** Fired if the ad fails — parent can hide the slot entirely. */
  onFailed?: (err: unknown) => void;
  /**
   * Override stagger delay (ms). If omitted we derive it from slotIndex
   * via STAGGER_DELAYS_MS. Set to 0 to force immediate load regardless.
   */
  loadDelayMs?: number;
}

const NativeAdCard: React.FC<NativeAdCardProps> = ({
  adUnitId,
  slotIndex,
  marginVertical = 10,
  onLoaded,
  onFailed,
  loadDelayMs,
}) => {
  const slot: AdSlotDescriptor = useMemo(() => {
    if (adUnitId) {
      // Explicit unit ID — treat as contextual inline adaptive banner.
      return { kind: 'banner', size: 'inline-adaptive-medium', unitId: adUnitId, label: 'explicit' };
    }
    const idx = typeof slotIndex === 'number' ? slotIndex : 0;
    return resolveAdSlot(idx);
  }, [adUnitId, slotIndex]);

  const derivedDelay = useMemo(() => {
    if (typeof loadDelayMs === 'number') return Math.max(0, loadDelayMs);
    const idx = typeof slotIndex === 'number' ? Math.max(0, slotIndex) : 0;
    // Cap at last defined delay — higher indices don't wait longer.
    const safeIdx = Math.min(idx, STAGGER_DELAYS_MS.length - 1);
    return STAGGER_DELAYS_MS[safeIdx];
  }, [loadDelayMs, slotIndex]);

  return (
    <BannerSlot
      slot={slot}
      marginVertical={marginVertical}
      loadDelayMs={derivedDelay}
      onLoaded={onLoaded}
      onFailed={onFailed}
    />
  );
};

/**
 * Renders a single banner. Collapses to null on load failure.
 *
 * For INLINE_ADAPTIVE_BANNER the SDK auto-reads the container's width; we
 * set `width: '100%'` + `alignSelf: 'stretch'` so the banner fills the
 * screen edge-to-edge. For ANCHORED_ADAPTIVE_BANNER the SDK reads the
 * device screen width, so width is always 100% by design.
 */
const BannerSlot: React.FC<{
  slot: AdSlotDescriptor;
  marginVertical: number;
  loadDelayMs: number;
  onLoaded?: () => void;
  onFailed?: (err: unknown) => void;
}> = ({ slot, marginVertical, loadDelayMs, onLoaded, onFailed }) => {
  const [errored, setErrored] = useState(false);
  // Hold the BannerAd render back until the stagger delay elapses.
  const [ready, setReady] = useState(loadDelayMs <= 0);
  const bannerSize = resolveBannerSize(slot.size);
  const minH = minHeightForSize(slot.size);
  const screenWidth = Dimensions.get('window').width;

  useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => setReady(true), loadDelayMs);
    return () => clearTimeout(t);
  }, [ready, loadDelayMs]);

  if (errored) return null;

  return (
    <View
      style={[
        styles.bannerWrap,
        { minHeight: minH, marginVertical, width: screenWidth },
      ]}
    >
      {ready ? (
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
      ) : (
        // Transparent placeholder while we wait for the stagger — keeps
        // layout stable so commentary rows below don't jump when the ad
        // finally mounts.
        <View style={{ width: '100%', height: minH, backgroundColor: 'transparent' }} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  bannerWrap: {
    // TRUE full-width ad container — edge-to-edge. Uses Dimensions.width
    // explicitly so any ancestor padding/margin is bypassed (we also set
    // horizontal margin to NEGATIVE of typical page padding in callers
    // if needed, but here we just stretch to screen width).
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    marginHorizontal: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
});

export default NativeAdCard;
