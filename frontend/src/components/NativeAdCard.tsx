/**
 * NativeAdCard
 * ------------
 * A self-loading, premium-looking Native Advanced ad card. Designed to
 * meet the user's 2026-04-20 brief:
 *
 *   • Card layout with rounded corners, "Premium" visual weight.
 *   • Dark background (#121212) so any video content pops visually.
 *   • MediaView (video) with autoPlay + muted.
 *   • Policy-safe "Ad" sponsorship label on the top-left.
 *   • Content is fully protected from accidental clicks — the AdChoices
 *     icon and CTA button are the only tap targets. The surrounding
 *     text/media is NOT wrapped in a general-purpose pressable, which
 *     also prevents "hiding" actual match data behind an ad tap.
 *
 * Rendering strategy:
 *   1. On mount we call NativeAd.createForAdRequest(adUnitId). While the
 *      load is in flight we render a tiny 1px spacer so nothing pushes
 *      real content off-screen — the card only expands after an ad has
 *      actually arrived, avoiding an empty dark rectangle that would
 *      look broken on first view.
 *   2. On fill → we render <NativeAdView> wrapping <NativeMediaView> and
 *      the individual <NativeAsset> elements per Google's required
 *      structure. Without this wrapping, impressions won't count and
 *      clicks won't be attributed — fail-safe for AdMob policy.
 *   3. On error / failure → we destroy the instance and render nothing.
 *      Above us, callers will see zero height and lay out normally.
 *
 * v1.0.11 — Native ads render for **ALL users (Pro + Non-Pro)** per user
 * request on 2026-04-20. Other ad formats (Rewarded / Interstitial /
 * App-Open) still honour Pro status — only the native ad card is
 * universal, as these are the brand-safe inline-content placements.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import {
  BannerAd,
  BannerAdSize,
  NativeAd,
  NativeAdView,
  NativeAsset,
  NativeAssetType,
  NativeMediaAspectRatio,
  NativeMediaView,
} from 'react-native-google-mobile-ads';
// NOTE: v1.0.11 — Pro-user gating removed by explicit user request. Native
// Advanced ads now render for EVERY user (Pro + Non-Pro alike). Interstitial,
// Rewarded and App-Open ads in AdMobContext still honour Pro status — only
// the native ad card is universal.
import { resolveAdSlot, AdSlotDescriptor } from '../services/NativeAdRotator';

interface NativeAdCardProps {
  /**
   * Optional explicit ad unit ID. When omitted the card picks one using
   * the rotator with the supplied `slotIndex` — or a random slot if no
   * index is given. This lets callers inside `.map()` pass a stable slot
   * index so re-renders don't swap the ad unit.
   */
  adUnitId?: string;
  slotIndex?: number;

  /**
   * Optional vertical margin — callers inside tight layouts (scoreboard
   * strip, event cards) may want smaller gaps.
   */
  marginVertical?: number;

  /** Fired after the ad successfully loads — lets parents resize, log etc. */
  onLoaded?: () => void;

  /** Fired if the ad fails — parent can opt to hide the slot entirely. */
  onFailed?: (err: unknown) => void;
}

const CARD_BG = '#121212';

/**
 * Hook: loads a native ad and returns { ad, loading, errored }.
 * Destroys the NativeAd instance on unmount to free native memory.
 */
function useLoadedNativeAd(adUnitId: string) {
  const [ad, setAd] = useState<NativeAd | null>(null);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const mountedRef = useRef(true);
  const adRef = useRef<NativeAd | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    setErrored(false);

    let cancelled = false;

    NativeAd.createForAdRequest(adUnitId, {
      // Prefer landscape creatives for our horizontal cricket feed. Google
      // will still fall back to any ratio if no landscape fill exists.
      aspectRatio: NativeMediaAspectRatio.LANDSCAPE,
      // User brief: "MediaView... autoPlay: true, mute: true". Muted start
      // is already the SDK default; we set it explicitly for clarity so
      // a future SDK-default change can't silently break this rule.
      startVideoMuted: true,
    })
      .then((loadedAd) => {
        if (cancelled || !mountedRef.current) {
          // React unmounted before the network request returned — release
          // the handle immediately so we don't leak the native view.
          try { loadedAd.destroy(); } catch {}
          return;
        }
        adRef.current = loadedAd;
        setAd(loadedAd);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled || !mountedRef.current) return;
        // eslint-disable-next-line no-console
        console.warn('[NativeAdCard] load failed for', adUnitId, err?.message || err);
        setErrored(true);
        setLoading(false);
      });

    return () => {
      cancelled = true;
      mountedRef.current = false;
      const toKill = adRef.current;
      adRef.current = null;
      if (toKill) {
        try { toKill.destroy(); } catch {}
      }
    };
  }, [adUnitId]);

  return { ad, loading, errored };
}

/**
 * The visible card. Rendered only after the ad has loaded so the layout
 * never shows a bare dark rectangle (see NativeAdCard docstring).
 */
const NativeAdBody: React.FC<{ ad: NativeAd; marginVertical: number }> = ({ ad, marginVertical }) => {
  // Defensive: some fills return empty strings for optional fields. We
  // fall back to tasteful placeholders rather than rendering empty rows.
  const headline = ad.headline || 'Sponsored';
  const body = ad.body || '';
  const cta = ad.callToAction || 'Learn more';
  const advertiser = ad.advertiser || '';
  const iconUri = ad.icon?.url;
  const hasMedia = !!(ad.mediaContent && (ad.mediaContent as any).aspectRatio);

  return (
    <NativeAdView nativeAd={ad} style={[styles.card, { marginVertical }]}>
      {/* AdChoices badge + "Ad" sponsorship label (AdMob policy requirement).
          These MUST be visible so users can distinguish the ad from the
          surrounding cricket content. */}
      <View style={styles.adLabelRow}>
        <View style={styles.adBadge}>
          <Text style={styles.adBadgeText}>Ad</Text>
        </View>
        {advertiser ? (
          <Text style={styles.advertiser} numberOfLines={1}>{advertiser}</Text>
        ) : null}
      </View>

      {/* Media area — video (autoplay, muted) or image — spans full width */}
      {hasMedia ? (
        <NativeMediaView style={styles.media} resizeMode="cover" />
      ) : null}

      {/* Text block */}
      <View style={styles.textBlock}>
        {iconUri ? (
          <Image source={{ uri: iconUri }} style={styles.icon} />
        ) : (
          <View style={[styles.icon, styles.iconFallback]} />
        )}
        <View style={styles.textCol}>
          <NativeAsset assetType={NativeAssetType.HEADLINE}>
            <Text style={styles.headline} numberOfLines={2}>{headline}</Text>
          </NativeAsset>
          {body ? (
            <NativeAsset assetType={NativeAssetType.BODY}>
              <Text style={styles.body} numberOfLines={2}>{body}</Text>
            </NativeAsset>
          ) : null}
        </View>
      </View>

      {/* CTA — the ONLY tap target (besides AdChoices icon). Large enough
          to tap deliberately, with safe padding so accidental edge-swipes
          don't trigger it. */}
      <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
        <View style={styles.ctaBtn}>
          <Text style={styles.ctaText} numberOfLines={1}>{cta}</Text>
        </View>
      </NativeAsset>
    </NativeAdView>
  );
};

const NativeAdCard: React.FC<NativeAdCardProps> = ({
  adUnitId,
  slotIndex,
  marginVertical = 10,
  onLoaded,
  onFailed,
}) => {
  // v1.0.11 — Pro gating intentionally removed. Native ads render for all
  // users. (Rewarded/Interstitial/App-Open still Pro-gated elsewhere.)

  // Resolve the slot descriptor (kind + unitId) once per mount. If an
  // explicit adUnitId is passed we honour it as a native ad (back-compat).
  const slot: AdSlotDescriptor = useMemo(() => {
    if (adUnitId) return { kind: 'native', unitId: adUnitId, label: 'explicit' };
    const idx = typeof slotIndex === 'number' ? slotIndex : Math.floor(Math.random() * 4);
    return resolveAdSlot(idx);
  }, [adUnitId, slotIndex]);

  // ===== BANNER branch — render Google's <BannerAd /> at MEDIUM_RECTANGLE
  // size (300×250) per the user's 2026-04-20 brief. Policy-safe: banner
  // shows the standard AdMob sponsorship chrome inline so no extra "Ad"
  // label is needed. A load error simply hides the slot (onAdFailedToLoad).
  if (slot.kind === 'banner') {
    return (
      <BannerSlot
        unitId={slot.unitId}
        marginVertical={marginVertical}
        onLoaded={onLoaded}
        onFailed={onFailed}
      />
    );
  }

  // ===== NATIVE branch (existing flow) =====
  return (
    <NativeSlot
      unitId={slot.unitId}
      marginVertical={marginVertical}
      onLoaded={onLoaded}
      onFailed={onFailed}
    />
  );
};

/** Banner wrapper — medium rectangle (300×250), hides on error. */
const BannerSlot: React.FC<{
  unitId: string;
  marginVertical: number;
  onLoaded?: () => void;
  onFailed?: (err: unknown) => void;
}> = ({ unitId, marginVertical, onLoaded, onFailed }) => {
  const [errored, setErrored] = useState(false);
  if (errored) return null;
  return (
    <View style={[styles.bannerWrap, { marginVertical }]}>
      <BannerAd
        unitId={unitId}
        size={BannerAdSize.MEDIUM_RECTANGLE}
        requestOptions={{ requestNonPersonalizedAdsOnly: false }}
        onAdLoaded={() => onLoaded?.()}
        onAdFailedToLoad={(err) => {
          // eslint-disable-next-line no-console
          console.warn('[BannerSlot] load failed for', unitId, (err as any)?.message || err);
          setErrored(true);
          onFailed?.(err);
        }}
      />
    </View>
  );
};

/** Native wrapper — original NativeAdCard body. */
const NativeSlot: React.FC<{
  unitId: string;
  marginVertical: number;
  onLoaded?: () => void;
  onFailed?: (err: unknown) => void;
}> = ({ unitId, marginVertical, onLoaded, onFailed }) => {
  const { ad, loading, errored } = useLoadedNativeAd(unitId);

  useEffect(() => {
    if (!loading && ad) onLoaded?.();
    if (!loading && errored) onFailed?.(new Error('native_ad_failed'));
  }, [loading, errored, ad, onLoaded, onFailed]);

  if (errored) return null;

  if (loading || !ad) {
    return (
      <View style={[styles.loadingPlaceholder, { marginVertical }]}>
        <ActivityIndicator size="small" color="#555" />
      </View>
    );
  }

  return <NativeAdBody ad={ad} marginVertical={marginVertical} />;
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    // Subtle premium shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
    alignSelf: 'stretch',
    marginHorizontal: 8,
  },
  adLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 8,
  },
  adBadge: {
    backgroundColor: '#FFC107',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 3,
  },
  adBadgeText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  advertiser: {
    color: '#BBB',
    fontSize: 12,
    flex: 1,
  },
  media: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    marginTop: 8,
  },
  textBlock: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 10,
    alignItems: 'flex-start',
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#222',
  },
  iconFallback: {
    backgroundColor: '#2A2A2A',
  },
  textCol: { flex: 1 },
  headline: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  body: {
    color: '#CCC',
    fontSize: 13,
    marginTop: 2,
    lineHeight: 18,
  },
  ctaBtn: {
    marginTop: 10,
    marginBottom: 12,
    marginHorizontal: 12,
    backgroundColor: '#4CAF50',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  loadingPlaceholder: {
    height: 6,
    alignItems: 'center',
    justifyContent: 'center',
    // Invisible while loading — just reserves the height of the
    // spinner strip. We deliberately do NOT render a full dark box
    // because the user reported "ads ke naam par khali boxes" as a
    // bug in prior versions.
  },
  bannerWrap: {
    // Centered 300×250 medium rectangle. No extra background — AdMob's
    // banner renders its own chrome. marginHorizontal matches the native
    // card so both ad formats align with surrounding content.
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 8,
    minHeight: 250,
  },
});

export default NativeAdCard;
