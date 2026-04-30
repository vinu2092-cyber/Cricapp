/**
 * NativeAdCard (v1.0.13 — 2-banner staggered fill-rate-optimized)
 * ---------------------------------------------------------------------
 * User update 2026-04-22 (post AdMob report analysis):
 *
 *   • Banner 3 REMOVED globally (over-break ads in commentary dropped).
 *     Only two active slots remain:
 *
 *       Slot 0 → Banner #1 HEADER (BANNER 320×50) — 0s load delay
 *       Slot 1 → Banner #2 CONTEXTUAL (MEDIUM_RECTANGLE 300×250) — 3s stagger
 *
 *     Rationale: the previous 3-banner setup logged 290 low-fill requests
 *     on slot 2 (29% match rate, $0.12 eCPM) which dragged the app's
 *     overall eCPM down to $0.43. Cutting the tail request improves the
 *     match rate at the cost of total impression volume — per user brief:
 *       "रिक्वेस्ट बेशक कम हो। हमें अपनी रिपोर्ट खराब नहीं करनी है।"
 *
 *   • Banner 1 reverted from ANCHORED_ADAPTIVE_BANNER (0 prod impressions
 *     in AdMob report) back to plain BANNER (320×50) — the most
 *     compatible fixed size across old Android versions.
 *
 *   • Banner 2 reverted from INLINE_ADAPTIVE_BANNER (14% match rate) back
 *     to MEDIUM_RECTANGLE (300×250) — the classic IAB slot with the
 *     highest historical fill rate on AdMob.
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
  isSlotActive,
  AdSlotDescriptor,
} from '../services/NativeAdRotator';

// Stagger delays per slot index — v1.0.13 spec:
//   slot 0 → 0s  (Banner 1 header, loads immediately)
//   slot 1 → 3s  (Banner 2 contextual, staggered 3s so AdMob auction
//                 has time to rotate creatives between the two banners
//                 and can't return the same ad twice on screen)
//   slot 2+ → effectively 0s but slot 2 is inactive anyway (see
//             NativeAdRotator.ts — Banner 3 was removed in v1.0.13).
const STAGGER_DELAYS_MS = [0, 3000];

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
      // Explicit unit ID — treat as MEDIUM_RECTANGLE (only fixed format
      // supported by the v1.0.13 BannerSize union besides 'standard').
      return { kind: 'banner', size: 'medium-rect', unitId: adUnitId, label: 'explicit' };
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

  // v1.0.13 — if a legacy caller still passes slotIndex=2 (removed
  // Banner 3), the resolver returns an inactive placeholder. Render
  // nothing at all so we don't fire a request for an empty unit ID.
  if (!isSlotActive(slot)) return null;

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
