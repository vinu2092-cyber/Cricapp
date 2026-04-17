import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fetchScorecard, fetchMatchInfo } from '../services/api';
import { useAdMob } from '../context/AdMobContext.native';

interface SquadPlayer {
  name: string;
  role: string;
  isCaptain: boolean;
  isKeeper: boolean;
  category: 'playing' | 'substitute' | 'bench';
  faceImageId?: string;
  imageUrl?: string;
}

interface Props {
  matchId: string;
  isLive: boolean;
}

// Solid opaque alternating shades for readability against wallpaper
const ROW_COLORS = [
  'rgba(232, 245, 233, 0.70)',  // Light green - 70% solid
  'rgba(255, 235, 238, 0.70)',  // Light red - 70% solid
  'rgba(255, 249, 196, 0.70)',  // Light yellow - 70% solid
];
const getRowBg = (idx: number) => ROW_COLORS[idx % 3];

// Determine player role from scorecard data
function getPlayerRole(player: any, isBowler: boolean, isKeeper: boolean): string {
  if (isKeeper) return 'WK-Batter';
  if (isBowler && player.runs !== undefined && player.runs > 0) return 'All-rounder';
  if (isBowler) return 'Bowler';
  return 'Batter';
}

// Profile image with Cricbuzz CDN support
function PlayerAvatar({ imageId, imageUrl, size = 44 }: { imageId?: string; imageUrl?: string; size?: number }) {
  // Cricbuzz face-image CDN (works with numeric faceImageId from mcenter endpoint)
  const imgSrc = imageUrl || (imageId
    ? `https://www.cricbuzz.com/a/img/v1/152x152/i1/c${imageId}/player.jpg`
    : null);

  if (imgSrc) {
    return (
      <Image
        source={{ uri: imgSrc }}
        style={[styles.avatarImage, { width: size, height: size, borderRadius: size / 2 }]}
      />
    );
  }

  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Ionicons name="person" size={size * 0.5} color="#999" />
    </View>
  );
}

export default function SquadsSection({ matchId, isLive }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [team1Name, setTeam1Name] = useState('');
  const [team2Name, setTeam2Name] = useState('');
  const [team1Short, setTeam1Short] = useState('');
  const [team2Short, setTeam2Short] = useState('');
  const [team1Playing, setTeam1Playing] = useState<SquadPlayer[]>([]);
  const [team2Playing, setTeam2Playing] = useState<SquadPlayer[]>([]);
  const [team1Subs, setTeam1Subs] = useState<SquadPlayer[]>([]);
  const [team2Subs, setTeam2Subs] = useState<SquadPlayer[]>([]);
  const [team1Bench, setTeam1Bench] = useState<SquadPlayer[]>([]);
  const [team2Bench, setTeam2Bench] = useState<SquadPlayer[]>([]);

  const { BannerAdComponent } = useAdMob();

  useEffect(() => {
    loadSquads();
  }, [matchId]);

  const loadSquads = async () => {
    try {
      // ============ STEP 1: Fetch BOTH match info AND scorecard ============
      const [infoData, scardData] = await Promise.all([
        fetchMatchInfo(matchId).catch(() => null),
        fetchScorecard(matchId).catch(() => null),
      ]);

      console.log('[Squads] matchInfo keys:', infoData ? Object.keys(infoData) : 'null');
      console.log('[Squads] scorecard keys:', scardData ? Object.keys(scardData) : 'null');

      // ============ STEP 2: DEEP extract player data from match info ============
      // Cricbuzz API can return players in many structures:
      // A) data.team1.players = { "playing XI": [...], "bench": [...] }  (OBJECT with named keys)
      // B) data.teams.team1.squad = [...], data.teams.team1.playingXI = [...]
      // C) data.team1.playerDetails = [...]
      // D) data.matchInfo.team1.players = [...]
      // We must check ALL paths exhaustively

      // Helper: Deep extract all player arrays from a team object
      const deepExtractPlayers = (teamObj: any): { playing11: any[]; bench: any[]; substitutes: any[]; allSquad: any[] } => {
        let playing11: any[] = [];
        let bench: any[] = [];
        let substitutes: any[] = [];
        let allSquad: any[] = [];

        if (!teamObj) return { playing11, bench, substitutes, allSquad };

        // Check if teamObj.players is an OBJECT with "playing XI" / "bench" keys
        const players = teamObj?.players;
        if (players && typeof players === 'object' && !Array.isArray(players)) {
          // OBJECT format: { "playing XI": [...], "bench": [...], "substitutes": [...] }
          playing11 = players['playing XI'] || players['playingXI'] || players['Playing XI'] || [];
          bench = players['bench'] || players['Bench'] || [];
          substitutes = players['substitutes'] || players['Substitutes'] || players['impact players'] || players['Impact Players'] || [];
          console.log('[Squads] Found players OBJECT: playing11=' + playing11.length + ', bench=' + bench.length + ', subs=' + substitutes.length);
        } else if (Array.isArray(players)) {
          // ARRAY format: all players in a flat list
          allSquad = players;
          console.log('[Squads] Found players ARRAY: ' + allSquad.length);
        }

        // Also check other field names
        if (playing11.length === 0) {
          playing11 = teamObj?.playing11 || teamObj?.playingXI || teamObj?.lineup || [];
        }
        if (allSquad.length === 0) {
          allSquad = teamObj?.playerDetails || teamObj?.squad || teamObj?.playerDtls || [];
        }
        if (bench.length === 0) {
          bench = teamObj?.bench || [];
        }
        if (substitutes.length === 0) {
          substitutes = teamObj?.substitutes || teamObj?.subs || teamObj?.impactPlayers || [];
        }

        return { playing11, bench, substitutes, allSquad };
      };

      // Try multiple paths for team info
      const getTeamData = (root: any, teamKey: string) => {
        return root?.[teamKey] || root?.teams?.[teamKey] || root?.matchInfo?.[teamKey] || {};
      };

      const team1Info = getTeamData(infoData, 'team1');
      const team2Info = getTeamData(infoData, 'team2');

      const t1Data = deepExtractPlayers(team1Info);
      const t2Data = deepExtractPlayers(team2Info);

      console.log('[Squads] T1 info: playing11=' + t1Data.playing11.length + ', bench=' + t1Data.bench.length + ', allSquad=' + t1Data.allSquad.length);
      console.log('[Squads] T2 info: playing11=' + t2Data.playing11.length + ', bench=' + t2Data.bench.length + ', allSquad=' + t2Data.allSquad.length);

      // ============ STEP 3: Extract players from scorecard ============
      const innings = scardData?.scorecard || [];
      const inn1 = innings[0];
      const inn2 = innings.length > 1 ? innings[1] : null;

      // Set team names (prefer match info names with lowercase API format, then scorecard)
      setTeam1Name(team1Info?.teamname || team1Info?.teamName || team1Info?.name || inn1?.batteamname || inn1?.batteamsname || 'Team 1');
      setTeam1Short(team1Info?.teamsname || team1Info?.teamSName || team1Info?.shortName || inn1?.batteamsname || 'TM1');
      if (inn2) {
        setTeam2Name(team2Info?.teamname || team2Info?.teamName || team2Info?.name || inn2?.batteamname || inn2?.batteamsname || 'Team 2');
        setTeam2Short(team2Info?.teamsname || team2Info?.teamSName || team2Info?.shortName || inn2?.batteamsname || 'TM2');
      } else {
        setTeam2Name(team2Info?.teamname || team2Info?.teamName || team2Info?.name || inn1?.bowlteamname || inn1?.bowlteamsname || 'Team 2');
        setTeam2Short(team2Info?.teamsname || team2Info?.teamSName || team2Info?.shortName || inn1?.bowlteamsname || 'TM2');
      }

      const hasInfoPlayers = t1Data.playing11.length > 0 || t2Data.playing11.length > 0 || t1Data.allSquad.length > 0 || t2Data.allSquad.length > 0;
      if (!inn1 && !hasInfoPlayers) {
        setError(true);
        setLoading(false);
        return;
      }

      // ============ STEP 4: Build Playing XI from scorecard ============
      const t1Batsmen = inn1?.batsman || [];
      const t1Bowlers = inn1?.bowler || []; // team2's bowlers in inn1
      const t2Batsmen = inn2?.batsman || [];
      const t2Bowlers = inn2?.bowler || []; // team1's bowlers in inn2
      const t1DNB = inn1?.dnb || inn1?.yettobat || inn1?.notbatted || [];
      const t2DNB = inn2?.dnb || inn2?.yettobat || inn2?.notbatted || [];

      // Build name → player object map from matchInfo (for faceImageId enrichment of
      // scorecard-sourced players, who don't carry image IDs on their own).
      const buildImageLookup = (teamData: { playing11: any[]; bench: any[]; substitutes: any[]; allSquad: any[] }) => {
        const map = new Map<string, { faceImageId?: string; imageUrl?: string }>();
        const addAll = (arr: any[]) => {
          for (const p of arr) {
            const n = (p?.name || p?.fullName || p?.fullname || p?.nickName || p?.playerName || '').toLowerCase().trim();
            if (!n) continue;
            const entry = {
              faceImageId: p.faceImageId || p.imageId || p.image_id || p.faceimageid,
              imageUrl: p.imageUrl || p.image_url,
            };
            if (entry.faceImageId || entry.imageUrl) {
              map.set(n, entry);
            }
          }
        };
        addAll(teamData.playing11);
        addAll(teamData.bench);
        addAll(teamData.substitutes);
        addAll(teamData.allSquad);
        return map;
      };

      const t1ImgLookup = buildImageLookup(t1Data);
      const t2ImgLookup = buildImageLookup(t2Data);

      // Helper: strip " (C)"/" (WK)" annotations before lookup, then enrich in-place
      const enrichWithImage = (player: SquadPlayer, lookup: Map<string, { faceImageId?: string; imageUrl?: string }>) => {
        if (player.faceImageId || player.imageUrl) return;
        const key = player.name.replace(/\s*\((C|WK)\)/gi, '').toLowerCase().trim();
        const hit = lookup.get(key);
        if (hit) {
          player.faceImageId = hit.faceImageId;
          player.imageUrl = hit.imageUrl;
        }
      };

      const scardT1Names = new Set<string>();
      const scardT2Names = new Set<string>();
      const t1BowledNames = new Set((t2Bowlers).map((b: any) => (b.name || b.nickname || '').toLowerCase()));
      const t2BowledNames = new Set((t1Bowlers).map((b: any) => (b.name || b.nickname || '').toLowerCase()));

      // ---- Team 1 from scorecard: batsmen inn1 + bowlers inn2 + DNB inn1 ----
      const t1PlayingList: SquadPlayer[] = [];

      for (const bat of t1Batsmen) {
        const name = bat.name || bat.nickname || '';
        if (!name) continue;
        const isKeeper = !!bat.iskeeper;
        const isCaptain = !!bat.iscaptain;
        const isBowlerToo = t1BowledNames.has(name.toLowerCase());
        t1PlayingList.push({
          name: name + (isCaptain ? ' (C)' : '') + (isKeeper ? ' (WK)' : ''),
          role: isBowlerToo ? 'All-rounder' : (isKeeper ? 'WK-Batter' : 'Batter'),
          isCaptain, isKeeper, category: 'playing',
        });
        scardT1Names.add(name.toLowerCase());
      }
      for (const bowl of t2Bowlers) {
        const name = bowl.name || bowl.nickname || '';
        if (!name || scardT1Names.has(name.toLowerCase())) continue;
        t1PlayingList.push({
          name: name + (bowl.iscaptain ? ' (C)' : ''),
          role: 'Bowler', isCaptain: !!bowl.iscaptain, isKeeper: false, category: 'playing',
        });
        scardT1Names.add(name.toLowerCase());
      }
      for (const dnb of t1DNB) {
        const name = dnb.name || dnb.nickname || (typeof dnb === 'string' ? dnb : '');
        if (!name || scardT1Names.has(name.toLowerCase())) continue;
        t1PlayingList.push({
          name, role: 'Batter', isCaptain: false, isKeeper: false, category: 'playing',
        });
        scardT1Names.add(name.toLowerCase());
      }

      // ---- Team 2 from scorecard: bowlers inn1 + batsmen inn2 + DNB inn2 ----
      const t2PlayingList: SquadPlayer[] = [];

      for (const bat of t2Batsmen) {
        const name = bat.name || bat.nickname || '';
        if (!name) continue;
        const isKeeper = !!bat.iskeeper;
        const isCaptain = !!bat.iscaptain;
        const isBowlerToo = t2BowledNames.has(name.toLowerCase());
        t2PlayingList.push({
          name: name + (isCaptain ? ' (C)' : '') + (isKeeper ? ' (WK)' : ''),
          role: isBowlerToo ? 'All-rounder' : (isKeeper ? 'WK-Batter' : 'Batter'),
          isCaptain, isKeeper, category: 'playing',
        });
        scardT2Names.add(name.toLowerCase());
      }
      for (const bowl of t1Bowlers) {
        const name = bowl.name || bowl.nickname || '';
        if (!name || scardT2Names.has(name.toLowerCase())) continue;
        t2PlayingList.push({
          name: name + (bowl.iscaptain ? ' (C)' : ''),
          role: 'Bowler', isCaptain: !!bowl.iscaptain, isKeeper: false, category: 'playing',
        });
        scardT2Names.add(name.toLowerCase());
      }
      for (const dnb of t2DNB) {
        const name = dnb.name || dnb.nickname || (typeof dnb === 'string' ? dnb : '');
        if (!name || scardT2Names.has(name.toLowerCase())) continue;
        t2PlayingList.push({
          name, role: 'Batter', isCaptain: false, isKeeper: false, category: 'playing',
        });
        scardT2Names.add(name.toLowerCase());
      }
      // If no inn2, use inn1 bowlers as T2 (already done above via t1Bowlers loop)
      if (!inn2 && t1Bowlers.length > 0) {
        for (const bowl of t1Bowlers) {
          const name = bowl.name || bowl.nickname || '';
          if (!name || scardT2Names.has(name.toLowerCase())) continue;
          t2PlayingList.push({
            name: name + (bowl.iscaptain ? ' (C)' : ''),
            role: 'Bowler', isCaptain: !!bowl.iscaptain, isKeeper: false, category: 'playing',
          });
          scardT2Names.add(name.toLowerCase());
        }
      }

      // ============ STEP 5: MERGE match info players with scorecard ============
      // If match info has playing11 data, fill in the MISSING players
      const toPlayer = (p: any, role?: string): SquadPlayer => {
        const name = p.name || p.fullName || p.fullname || p.nickName || '';
        const isKeeper = !!p.keeper || !!p.iskeeper;
        const isCaptain = !!p.captain || !!p.iscaptain;
        return {
          name: name + (isCaptain ? ' (C)' : '') + (isKeeper ? ' (WK)' : ''),
          role: role || p.role || (isKeeper ? 'WK-Batter' : 'Player'),
          isCaptain, isKeeper, category: 'playing',
        };
      };

      // Add missing T1 players from match info playing11
      for (const p of t1Data.playing11) {
        const name = (p.name || p.fullName || p.fullname || p.nickName || '').toLowerCase();
        if (!name || scardT1Names.has(name)) continue;
        const player = toPlayer(p);
        player.faceImageId = p.faceImageId || p.imageId || p.image_id;
        player.imageUrl = p.imageUrl || p.image_url;
        t1PlayingList.push(player);
        scardT1Names.add(name);
      }
      // Add missing T2 players from match info playing11
      for (const p of t2Data.playing11) {
        const name = (p.name || p.fullName || p.fullname || p.nickName || '').toLowerCase();
        if (!name || scardT2Names.has(name)) continue;
        const player = toPlayer(p);
        player.faceImageId = p.faceImageId || p.imageId || p.image_id;
        player.imageUrl = p.imageUrl || p.image_url;
        t2PlayingList.push(player);
        scardT2Names.add(name);
      }

      // If allSquad has data but playing11 was empty, use allSquad to fill
      if (t1Data.playing11.length === 0 && t1Data.allSquad.length > 0) {
        for (const p of t1Data.allSquad) {
          const name = (p.name || p.fullName || p.fullname || p.nickName || '').toLowerCase();
          if (!name || scardT1Names.has(name)) continue;
          const isSub = !!p.substitute || !!p.is_substitute || !!p.isSubstitute;
          const isPlaying = p.isPlaying === true || p.isPlaying11 === true;
          if (isPlaying || (!isSub && t1PlayingList.length < 11)) {
            const player = toPlayer(p);
            player.faceImageId = p.faceImageId || p.imageId || p.image_id;
            player.imageUrl = p.imageUrl || p.image_url;
            t1PlayingList.push(player);
            scardT1Names.add(name);
          }
        }
      }
      if (t2Data.playing11.length === 0 && t2Data.allSquad.length > 0) {
        for (const p of t2Data.allSquad) {
          const name = (p.name || p.fullName || p.fullname || p.nickName || '').toLowerCase();
          if (!name || scardT2Names.has(name)) continue;
          const isSub = !!p.substitute || !!p.is_substitute || !!p.isSubstitute;
          const isPlaying = p.isPlaying === true || p.isPlaying11 === true;
          if (isPlaying || (!isSub && t2PlayingList.length < 11)) {
            const player = toPlayer(p);
            player.faceImageId = p.faceImageId || p.imageId || p.image_id;
            player.imageUrl = p.imageUrl || p.image_url;
            t2PlayingList.push(player);
            scardT2Names.add(name);
          }
        }
      }

      // ============ STEP 6: Build Substitutes & Bench ============
      const t1SubsList: SquadPlayer[] = [];
      const t2SubsList: SquadPlayer[] = [];
      const t1BenchList: SquadPlayer[] = [];
      const t2BenchList: SquadPlayer[] = [];

      // Add explicit substitutes from match info - check multiple field variations
      for (const sub of t1Data.substitutes) {
        const name = (sub.name || sub.fullName || sub.fullname || sub.playerName || '').toLowerCase();
        if (!name || scardT1Names.has(name)) continue;
        const player = toPlayer(sub, 'Substitute');
        player.faceImageId = sub.faceImageId || sub.imageId || sub.image_id;
        player.imageUrl = sub.imageUrl || sub.image_url;
        t1SubsList.push(player);
      }
      for (const sub of t2Data.substitutes) {
        const name = (sub.name || sub.fullName || sub.fullname || sub.playerName || '').toLowerCase();
        if (!name || scardT2Names.has(name)) continue;
        const player = toPlayer(sub, 'Substitute');
        player.faceImageId = sub.faceImageId || sub.imageId || sub.image_id;
        player.imageUrl = sub.imageUrl || sub.image_url;
        t2SubsList.push(player);
      }

      // Add bench from match info - check multiple field variations
      for (const bp of t1Data.bench) {
        const name = (bp.name || bp.fullName || bp.fullname || bp.playerName || '').toLowerCase();
        if (!name || scardT1Names.has(name)) continue;
        if (t1SubsList.some(s => s.name.toLowerCase().includes(name))) continue;
        const player = toPlayer(bp, 'Bench');
        player.faceImageId = bp.faceImageId || bp.imageId || bp.image_id;
        player.imageUrl = bp.imageUrl || bp.image_url;
        t1BenchList.push(player);
      }
      for (const bp of t2Data.bench) {
        const name = (bp.name || bp.fullName || bp.fullname || bp.playerName || '').toLowerCase();
        if (!name || scardT2Names.has(name)) continue;
        if (t2SubsList.some(s => s.name.toLowerCase().includes(name))) continue;
        const player = toPlayer(bp, 'Bench');
        player.faceImageId = bp.faceImageId || bp.imageId || bp.image_id;
        player.imageUrl = bp.imageUrl || bp.image_url;
        t2BenchList.push(player);
      }

      // From allSquad: remaining players not in playing/subs → bench
      const t1SubNames = new Set(t1SubsList.map(p => p.name.replace(/ \(C\)| \(WK\)/g, '').toLowerCase()));
      const t2SubNames = new Set(t2SubsList.map(p => p.name.replace(/ \(C\)| \(WK\)/g, '').toLowerCase()));

      for (const sp of t1Data.allSquad) {
        const name = (sp.name || sp.fullName || sp.fullname || sp.nickName || sp.playerName || '').toLowerCase();
        if (!name || scardT1Names.has(name) || t1SubNames.has(name)) continue;
        if (t1BenchList.some(b => b.name.toLowerCase().includes(name))) continue;
        const isSub = !!sp.substitute || !!sp.is_substitute || !!sp.isSubstitute || sp.role === 'substitute' || sp.role === 'sub';
        const player = toPlayer(sp, isSub ? 'Substitute' : 'Bench');
        player.faceImageId = sp.faceImageId || sp.imageId || sp.image_id;
        player.imageUrl = sp.imageUrl || sp.image_url;
        if (isSub) {
          t1SubsList.push(player);
        } else {
          t1BenchList.push(player);
        }
      }
      for (const sp of t2Data.allSquad) {
        const name = (sp.name || sp.fullName || sp.fullname || sp.nickName || sp.playerName || '').toLowerCase();
        if (!name || scardT2Names.has(name) || t2SubNames.has(name)) continue;
        if (t2BenchList.some(b => b.name.toLowerCase().includes(name))) continue;
        const isSub = !!sp.substitute || !!sp.is_substitute || !!sp.isSubstitute || sp.role === 'substitute' || sp.role === 'sub';
        const player = toPlayer(sp, isSub ? 'Substitute' : 'Bench');
        player.faceImageId = sp.faceImageId || sp.imageId || sp.image_id;
        player.imageUrl = sp.imageUrl || sp.image_url;
        if (isSub) {
          t2SubsList.push(player);
        } else {
          t2BenchList.push(player);
        }
      }

      // Overflow from playing list (>11 from scorecard) → substitutes
      const t1Overflow = t1PlayingList.slice(11);
      const t2Overflow = t2PlayingList.slice(11);

      // ============ FINAL STEP: Balance team rosters ============
      // If one team has significantly fewer total players, redistribute from allSquad
      const t1TotalFound = t1PlayingList.length + t1SubsList.length + t1BenchList.length;
      const t2TotalFound = t2PlayingList.length + t2SubsList.length + t2BenchList.length;
      
      // If team2 has fewer players, check if we missed players from allSquad
      if (t2TotalFound < t1TotalFound - 2 && t2Data.allSquad.length > t2TotalFound) {
        for (const p of t2Data.allSquad) {
          const name = (p.name || p.fullName || p.fullname || p.nickName || p.playerName || '').toLowerCase();
          if (!name) continue;
          const inPlaying = scardT2Names.has(name);
          const inSubs = t2SubsList.some(s => s.name.toLowerCase().includes(name));
          const inBench = t2BenchList.some(b => b.name.toLowerCase().includes(name));
          
          if (!inPlaying && !inSubs && !inBench) {
            const player = toPlayer(p, 'Bench');
            player.faceImageId = p.faceImageId || p.imageId || p.image_id;
            player.imageUrl = p.imageUrl || p.image_url;
            t2BenchList.push(player);
          }
        }
      }
      
      // If team1 has fewer players, check if we missed players from allSquad
      if (t1TotalFound < t2TotalFound - 2 && t1Data.allSquad.length > t1TotalFound) {
        for (const p of t1Data.allSquad) {
          const name = (p.name || p.fullName || p.fullname || p.nickName || p.playerName || '').toLowerCase();
          if (!name) continue;
          const inPlaying = scardT1Names.has(name);
          const inSubs = t1SubsList.some(s => s.name.toLowerCase().includes(name));
          const inBench = t1BenchList.some(b => b.name.toLowerCase().includes(name));
          
          if (!inPlaying && !inSubs && !inBench) {
            const player = toPlayer(p, 'Bench');
            player.faceImageId = p.faceImageId || p.imageId || p.image_id;
            player.imageUrl = p.imageUrl || p.image_url;
            t1BenchList.push(player);
          }
        }
      }

      // ============ STEP 7: ENRICH all players with faceImageId from matchInfo lookup ============
      // Scorecard-sourced players don't always carry image IDs —
      // match by name against matchInfo squads so photos render in EVERY section
      // (Playing XI + Substitutes + Bench).
      t1PlayingList.forEach(p => enrichWithImage(p, t1ImgLookup));
      t2PlayingList.forEach(p => enrichWithImage(p, t2ImgLookup));
      t1SubsList.forEach(p => enrichWithImage(p, t1ImgLookup));
      t2SubsList.forEach(p => enrichWithImage(p, t2ImgLookup));
      t1BenchList.forEach(p => enrichWithImage(p, t1ImgLookup));
      t2BenchList.forEach(p => enrichWithImage(p, t2ImgLookup));
      t1Overflow.forEach(p => enrichWithImage(p, t1ImgLookup));
      t2Overflow.forEach(p => enrichWithImage(p, t2ImgLookup));

      setTeam1Playing(t1PlayingList.slice(0, 11));
      setTeam2Playing(t2PlayingList.slice(0, 11));
      setTeam1Subs([...t1SubsList, ...t1Overflow]);
      setTeam2Subs([...t2SubsList, ...t2Overflow]);
      setTeam1Bench(t1BenchList);
      setTeam2Bench(t2BenchList);

      setError(false);
    } catch (e) {
      console.warn('[Squads] Load failed:', e);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#4CAF50" size="large" />
        <Text style={styles.loadingText}>Loading Squads...</Text>
      </View>
    );
  }

  if (error || (team1Playing.length === 0 && team2Playing.length === 0)) {
    return (
      <View style={styles.center}>
        <Ionicons name="people-outline" size={40} color="#999" />
        <Text style={styles.errorText}>Squad data not available yet</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => { setLoading(true); loadSquads(); }}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const maxRows = Math.max(team1Playing.length, team2Playing.length);
  const maxSubRows = Math.max(team1Subs.length, team2Subs.length);

  return (
    <View style={styles.container}>
      {/* Team Header Banner */}
      <View style={styles.teamBanner}>
        <View style={styles.teamSide}>
          <Text style={styles.teamNameBanner}>{team1Short}</Text>
        </View>
        <View style={styles.vsContainer}>
          <Text style={styles.vsText}>vs</Text>
        </View>
        <View style={styles.teamSide}>
          <Text style={styles.teamNameBanner}>{team2Short}</Text>
        </View>
      </View>

      {/* Banner Ad - Start */}
      <View style={styles.bannerAdContainer}>
        <BannerAdComponent />
      </View>

      {/* Playing XI Section */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Playing XI</Text>
      </View>

      {Array.from({ length: maxRows }).map((_, idx) => {
        const p1 = team1Playing[idx];
        const p2 = team2Playing[idx];
        return (
          <View key={`playing-${idx}`} style={[styles.playerRow, { backgroundColor: getRowBg(idx) }]}>
            {/* Left player (Team 1) */}
            <View style={styles.playerLeft}>
              {p1 ? (
                <>
                  <PlayerAvatar imageId={p1.faceImageId} imageUrl={p1.imageUrl} />
                  <View style={styles.playerInfo}>
                    <Text style={styles.playerName} numberOfLines={1}>{p1.name}</Text>
                    <Text style={styles.playerRole}>{p1.role}</Text>
                  </View>
                </>
              ) : <View style={styles.emptyPlayer} />}
            </View>

            <View style={styles.divider} />

            {/* Right player (Team 2) */}
            <View style={styles.playerRight}>
              {p2 ? (
                <>
                  <View style={styles.playerInfoRight}>
                    <Text style={styles.playerNameRight} numberOfLines={1}>{p2.name}</Text>
                    <Text style={styles.playerRoleRight}>{p2.role}</Text>
                  </View>
                  <PlayerAvatar imageId={p2.faceImageId} imageUrl={p2.imageUrl} />
                </>
              ) : <View style={styles.emptyPlayer} />}
            </View>
          </View>
        );
      })}

      {/* Banner Ad - Between sections */}
      <View style={styles.bannerAdContainer}>
        <BannerAdComponent />
      </View>

      {/* Substitutes Section — ALWAYS VISIBLE */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Substitute Players</Text>
      </View>

      {(team1Subs.length > 0 || team2Subs.length > 0) ? (
        Array.from({ length: maxSubRows }).map((_, idx) => {
          const p1 = team1Subs[idx];
          const p2 = team2Subs[idx];
          return (
            <View key={`sub-${idx}`} style={[styles.playerRow, { backgroundColor: getRowBg(idx) }]}>
              <View style={styles.playerLeft}>
                {p1 ? (
                  <>
                    <PlayerAvatar size={38} imageId={p1.faceImageId} imageUrl={p1.imageUrl} />
                    <View style={styles.playerInfo}>
                      <Text style={styles.playerName} numberOfLines={1}>{p1.name}</Text>
                      <Text style={styles.playerRole}>{p1.role}</Text>
                    </View>
                  </>
                ) : <View style={styles.emptyPlayer} />}
              </View>
              <View style={styles.divider} />
              <View style={styles.playerRight}>
                {p2 ? (
                  <>
                    <View style={styles.playerInfoRight}>
                      <Text style={styles.playerNameRight} numberOfLines={1}>{p2.name}</Text>
                      <Text style={styles.playerRoleRight}>{p2.role}</Text>
                    </View>
                    <PlayerAvatar size={38} imageId={p2.faceImageId} imageUrl={p2.imageUrl} />
                  </>
                ) : <View style={styles.emptyPlayer} />}
              </View>
            </View>
          );
        })
      ) : (
        <View style={styles.emptySection}>
          <Text style={styles.emptySectionText}>No substitute players in this match</Text>
        </View>
      )}

      {/* Banner Ad - After substitutes */}
      <View style={styles.bannerAdContainer}>
        <BannerAdComponent />
      </View>

      {/* Bench Section — ALWAYS VISIBLE */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Bench Players</Text>
      </View>

      {(team1Bench.length > 0 || team2Bench.length > 0) ? (
        Array.from({ length: Math.max(team1Bench.length, team2Bench.length) }).map((_, idx) => {
          const p1 = team1Bench[idx];
          const p2 = team2Bench[idx];
          return (
            <View key={`bench-${idx}`} style={[styles.playerRow, { backgroundColor: getRowBg(idx) }]}>
              <View style={styles.playerLeft}>
                {p1 ? (
                  <>
                    <PlayerAvatar size={38} imageId={p1.faceImageId} imageUrl={p1.imageUrl} />
                    <View style={styles.playerInfo}>
                      <Text style={styles.playerName} numberOfLines={1}>{p1.name}</Text>
                      <Text style={styles.playerRole}>{p1.role}</Text>
                    </View>
                  </>
                ) : <View style={styles.emptyPlayer} />}
              </View>
              <View style={styles.divider} />
              <View style={styles.playerRight}>
                {p2 ? (
                  <>
                    <View style={styles.playerInfoRight}>
                      <Text style={styles.playerNameRight} numberOfLines={1}>{p2.name}</Text>
                      <Text style={styles.playerRoleRight}>{p2.role}</Text>
                    </View>
                    <PlayerAvatar size={38} imageId={p2.faceImageId} imageUrl={p2.imageUrl} />
                  </>
                ) : <View style={styles.emptyPlayer} />}
              </View>
            </View>
          );
        })
      ) : (
        <View style={styles.emptySection}>
          <Text style={styles.emptySectionText}>No bench players in this match</Text>
        </View>
      )}

      {/* Banner Ad - End of bench */}
      <View style={styles.bannerAdContainer}>
        <BannerAdComponent />
      </View>

      {/* Info footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Squad data extracted from match scorecard
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: 20 },
  center: { padding: 40, alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)', margin: 16, borderRadius: 12 },
  loadingText: { color: '#999', marginTop: 12, fontSize: 14 },
  errorText: { color: '#999', fontSize: 16, marginBottom: 12, marginTop: 8 },
  retryBtn: { backgroundColor: '#4CAF50', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  retryText: { color: '#FFF', fontWeight: 'bold' },

  teamBanner: {
    flexDirection: 'row',
    backgroundColor: 'rgba(34,34,34,0.9)',
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 10,
    overflow: 'hidden',
    alignItems: 'center',
    paddingVertical: 12,
  },
  teamSide: { flex: 1, alignItems: 'center' },
  teamNameBanner: { fontSize: 18, fontWeight: '800', color: '#FFF', letterSpacing: 1 },
  vsContainer: { paddingHorizontal: 12 },
  vsText: { fontSize: 14, color: '#4CAF50', fontWeight: '700' },

  sectionHeader: {
    backgroundColor: '#1B5E20',
    marginHorizontal: 12,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#FFF', textAlign: 'center', letterSpacing: 0.5 },

  playerRow: {
    flexDirection: 'row',
    marginHorizontal: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(0,0,0,0.08)',
    backgroundColor: 'rgba(255,255,255,0.70)',
    alignItems: 'center',
  },
  playerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  playerRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  divider: {
    width: 1,
    height: '80%',
    backgroundColor: 'rgba(0,0,0,0.1)',
    marginHorizontal: 4,
  },
  emptyPlayer: { flex: 1 },

  avatar: {
    backgroundColor: '#E8E8E8',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#DDD',
  },
  avatarImage: {
    backgroundColor: '#F5F5F5',
    borderWidth: 1.5,
    borderColor: '#DDD',
  },

  playerInfo: { flex: 1 },
  playerName: { fontSize: 14, fontWeight: '700', color: '#222' },
  playerRole: { fontSize: 11, color: '#666', marginTop: 1 },

  playerInfoRight: { flex: 1, alignItems: 'flex-end' },
  playerNameRight: { fontSize: 14, fontWeight: '700', color: '#222', textAlign: 'right' },
  playerRoleRight: { fontSize: 11, color: '#666', marginTop: 1, textAlign: 'right' },

  bannerAdContainer: {
    minHeight: 80,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
    marginHorizontal: 12,
  },

  footer: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 11,
    color: '#888',
    fontStyle: 'italic',
  },
  emptySection: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.50)',
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 4,
  },
  emptySectionText: {
    fontSize: 13,
    color: '#888',
    fontStyle: 'italic',
  },
});
