/**
 * NativeAdCard (v1.0.12 — 3-role banner rotation + staggered load)
 * ----------------------------------------------------------------
 * 2026-04-21 user update: roles finalised as
 *   slotIndex=0 → Banner #1 HEADER       (BANNER 320×50)
 *   slotIndex=1 → Banner #2 CONTEXTUAL   (MEDIUM_RECTANGLE 300×250)
 *   slotIndex=2 → Banner #3 OVER-BREAK   (LARGE_BANNER 320×100)
 *
 * Policy compliance:
 *   • Three DIFFERENT sizes + three DIFFERENT unit IDs → Google never
 *     serves the same creative twice on one screen.
 *   • Full MATCH_PARENT width; zero horizontal padding/margin so the ad
 *     touches phone edges (user brief: "har tarah ki padding aur margin
 *     hata dein taaki ad mobile screen ke edges tak touch kare").
 *   • Minimum 16px vertical spacing from neighbouring ads (caller
 *     supplies marginVertical; default is 10, override to >= 8 for
 *     back-to-back placements).
 *   • STAGGERED LOADING — instead of all three banners firing at t=0,
 *     we delay the load by `slotIndex * 3.5s` so Google's ad server sees
 *     three distinct requests spaced ~3.5s apart → much higher fill rate
 *     and creative variety (user brief: "ek saath call nahi honi chahiye
 *     ... 3 se 4 seconds ka delay rakhein").
 *   • Refresh rate left at Google AdMob's "Optimized" (no manual refresh
 *     logic here) — refresh naturally aligns with the 30s API poll.
 *
 * Failed loads collapse to null so no empty boxes are ever visible.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BannerAd } from 'react-native-google-mobile-ads';
import {
  resolveAdSlot,
  resolveBannerSize,
  minHeightForSize,
  AdSlotDescriptor,
} from '../services/NativeAdRotator';

// Stagger delay per slot index in ms. 0 = immediate, 1 = ~3.5s, 2 = ~7s.
// User spec: "3 se 4 seconds ka delay" — we use 3500ms per step.
const STAGGER_STEP_MS = 3500;

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
   * Override stagger delay (ms). If omitted we derive it from slotIndex.
   * Set to 0 to force immediate load regardless of slot.
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
      return { kind: 'banner', size: 'medium', unitId: adUnitId, label: 'explicit' };
    }
    const idx = typeof slotIndex === 'number' ? slotIndex : 0;
    return resolveAdSlot(idx);
  }, [adUnitId, slotIndex]);

  const derivedDelay = useMemo(() => {
    if (typeof loadDelayMs === 'number') return Math.max(0, loadDelayMs);
    const idx = typeof slotIndex === 'number' ? Math.max(0, slotIndex) : 0;
    // Cap at slot 2 delay (7s) — higher slot indices shouldn't wait longer.
    const stepIdx = Math.min(idx, 2);
    return stepIdx * STAGGER_STEP_MS;
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

/** Renders a single banner. Collapses to null on load failure. */
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
        { minHeight: minH, marginVertical },
      ]}
    >
      {ready ? (
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
      ) : (
        // Transparent placeholder while we wait for the stagger — keeps
        // layout stable so commentary rows below don't jump when the ad
        // finally mounts. No visible UI so user never sees a blank slot.
        <View style={{ width: '100%', height: minH, backgroundColor: 'transparent' }} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  bannerWrap: {
    // Full-width ad container: zero horizontal padding/margin so the
    // banner fills the phone screen edge-to-edge per user brief.
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    marginHorizontal: 0,
    paddingHorizontal: 0,
  },
});

export default NativeAdCard;
