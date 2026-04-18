import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fetchScorecard, fetchMatchInfo, fetchTeamSquad } from '../services/api';
import { useAdMob } from '../context/AdMobContext.native';

interface Props {
  matchId: string;
  isLive: boolean;
}

// Small player avatar that matches Squads section styling. Uses the same Cricbuzz face-image CDN.
function MiniAvatar({ imageId, size = 32 }: { imageId?: string; size?: number }) {
  if (imageId) {
    return (
      <Image
        source={{ uri: `https://www.cricbuzz.com/a/img/v1/152x152/i1/c${imageId}/player.jpg` }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          marginRight: 6,
          backgroundColor: '#F5F5F5',
          borderWidth: 1,
          borderColor: '#DDD',
        }}
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        marginRight: 6,
        backgroundColor: '#E8E8E8',
        borderWidth: 1,
        borderColor: '#DDD',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name="person" size={size * 0.55} color="#999" />
    </View>
  );
}

// Strip suffix annotations (C)/(WK)/extra spaces for name-map lookup
function normalizeName(raw: string): string {
  return (raw || '').replace(/\s*\((c|wk)\)/gi, '').toLowerCase().trim();
}

// Determine if a batsman actually batted
function didBat(bat: any): boolean {
  if (bat.balls > 0 || bat.runs > 0) return true;
  const dec = (bat.outdec || '').toLowerCase().trim();
  if (!dec || dec === 'batting') return false;
  // Valid dismissals: caught, bowled, lbw, stumped, run out, hit wicket, retired, not out, etc.
  return true;
}

// 70% solid alternating rows for readability
const ROW_COLORS = [
  'rgba(232, 245, 233, 0.30)',  // Light green - 60% solid, 40% transparent
  'rgba(255, 235, 238, 0.30)',  // Light reddish - 60% solid, 40% transparent
  'rgba(255, 249, 196, 0.30)',  // Light yellow - 60% solid, 40% transparent
];
const getRowBg = (idx: number) => ROW_COLORS[idx % 3];

export default function ScorecardSection({ matchId, isLive }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeInnings, setActiveInnings] = useState(0);
  const [error, setError] = useState(false);
  const [playerImgMap, setPlayerImgMap] = useState<Record<string, string>>({});
  const { BannerAdComponent } = useAdMob();

  useEffect(() => {
    loadScorecard();
    loadPlayerImages();
    if (isLive) {
      const interval = setInterval(loadScorecard, 60000);
      return () => clearInterval(interval);
    }
  }, [matchId]);

  // Fetch match info once and build a name → faceImageId map so batter/bowler rows
  // can render a small Cricbuzz-style avatar next to each name (Cricket Guru parity).
  // Also pulls the per-team squad endpoint for richer photo coverage (subs+bench).
  const loadPlayerImages = async () => {
    try {
      const info = await fetchMatchInfo(matchId);
      if (!info) return;

      const map: Record<string, string> = {};
      const addTeam = (teamObj: any) => {
        if (!teamObj) return;
        const players = teamObj.players;
        const collect = (arr: any) => {
          if (!Array.isArray(arr)) return;
          for (const p of arr) {
            const name = normalizeName(p?.name || p?.fullName || p?.fullname || p?.nickName || p?.playerName || '');
            const id = p?.faceImageId || p?.imageId || p?.image_id || p?.faceimageid || p?.id;
            if (name && id) map[name] = String(id);
          }
        };
        if (players && typeof players === 'object' && !Array.isArray(players)) {
          collect(players['playing XI']);
          collect(players['playingXI']);
          collect(players['Playing XI']);
          collect(players['bench']);
          collect(players['Bench']);
          collect(players['substitutes']);
          collect(players['Substitutes']);
          collect(players['impact players']);
          collect(players['support staff']);
        } else if (Array.isArray(players)) {
          collect(players);
        }
        collect(teamObj.playerDetails);
        collect(teamObj.squad);
        collect(teamObj.playerDtls);
        collect(teamObj.bench);
        collect(teamObj.substitutes);
      };

      addTeam(info.team1);
      addTeam(info.team2);
      addTeam(info?.teams?.team1);
      addTeam(info?.teams?.team2);
      addTeam(info?.matchInfo?.team1);
      addTeam(info?.matchInfo?.team2);

      // Per-team full squad endpoint (Cricbuzz "Squads" tab data)
      const t1Id = info?.team1?.teamid || info?.team1?.teamId;
      const t2Id = info?.team2?.teamid || info?.team2?.teamId;
      const [t1Full, t2Full] = await Promise.all([
        t1Id ? fetchTeamSquad(matchId, t1Id).catch(() => null) : Promise.resolve(null),
        t2Id ? fetchTeamSquad(matchId, t2Id).catch(() => null) : Promise.resolve(null),
      ]);
      if (t1Full) addTeam(t1Full.team || t1Full);
      if (t2Full) addTeam(t2Full.team || t2Full);

      setPlayerImgMap(map);
    } catch {
      // Photos are a nice-to-have — silent fail keeps scorecard usable
    }
  };

  const loadScorecard = async () => {
    try {
      const result = await fetchScorecard(matchId);
      if (result) {
        setData(result);
        setError(false);
        const innings = result.scorecard || [];
        if (innings.length > 0) setActiveInnings(innings.length - 1);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={s.center} data-testid="scorecard-loading">
        <ActivityIndicator color="#4CAF50" size="large" />
        <Text style={s.loadingText}>Loading Scorecard...</Text>
      </View>
    );
  }

  if (error || !data?.scorecard?.length) {
    return (
      <View style={s.center} data-testid="scorecard-error">
        <Text style={s.errorText}>Scorecard not available</Text>
        <TouchableOpacity style={s.retryBtn} onPress={() => { setLoading(true); loadScorecard(); }}>
          <Text style={s.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const innings = data.scorecard || [];
  const inn = innings[activeInnings];
  if (!inn) return null;

  const allBatsmen = inn.batsman || [];
  const bowlers = inn.bowler || [];
  const extras = inn.extras || {};
  const fowData = inn.fow?.fow || inn.fow || [];
  const partnershipData = inn.partnership?.partnership || inn.partnership || [];
  const totalScore = inn.score ?? (inn.runs !== undefined ? inn.runs : '');
  const totalWickets = inn.wickets ?? '';
  const totalOvers = inn.overs ?? '';
  const runRate = inn.runrate ?? '';
  const isMatchComplete = data.ismatchcomplete === true || data.ismatchcomplete === 'True';

  // Separate batsmen who actually batted from those who didn't
  const battedPlayers = allBatsmen.filter((b: any) => didBat(b));
  const yetToBat = allBatsmen.filter((b: any) => !didBat(b));

  return (
    <View style={s.container} data-testid="scorecard-section">
      {/* Innings Toggle */}
      {innings.length > 1 && (
        <View style={s.inningsRow}>
          {innings.map((innItem: any, idx: number) => (
            <TouchableOpacity
              key={idx}
              style={[s.inningsTab, activeInnings === idx && s.inningsTabActive]}
              onPress={() => setActiveInnings(idx)}
              data-testid={`innings-tab-${idx}`}
            >
              <Text style={[s.inningsTabText, activeInnings === idx && s.inningsTabTextActive]}>
                {innItem.batteamsname || `Inn ${idx + 1}`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Banner Ad - Start of batting section */}
      <View style={s.bannerAdContainer}>
        <BannerAdComponent />
      </View>


      {/* Batting Section */}
      <View style={s.section}>
        <View style={s.headerRow}>
          <Text style={[s.headerCell, s.nameCol]}>Batter</Text>
          <Text style={s.headerCell}>R</Text>
          <Text style={s.headerCell}>B</Text>
          <Text style={s.headerCell}>4s</Text>
          <Text style={s.headerCell}>6s</Text>
          <Text style={s.headerCell}>SR</Text>
        </View>
        {battedPlayers.map((bat: any, idx: number) => (
          <View key={idx} style={[s.dataRow, { backgroundColor: getRowBg(idx) }]}>
            <View style={[s.nameCol, s.nameColRow]}>
              <MiniAvatar imageId={playerImgMap[normalizeName(bat.name || bat.nickname || '')]} />
              <View style={s.nameTextWrap}>
                <Text style={s.batName} numberOfLines={1}>
                  {bat.name || bat.nickname}
                  {bat.iscaptain ? ' (c)' : ''}
                  {bat.iskeeper ? ' (wk)' : ''}
                </Text>
                <Text style={s.dismissal} numberOfLines={1}>
                  {bat.outdec || 'not out'}
                </Text>
              </View>
            </View>
            <Text style={[s.statCell, s.runsBold]}>{bat.runs}</Text>
            <Text style={s.statCell}>{bat.balls}</Text>
            <Text style={s.statCell}>{bat.fours}</Text>
            <Text style={s.statCell}>{bat.sixes}</Text>
            <Text style={s.statCell}>{bat.strkrate || '0.00'}</Text>
          </View>
        ))}

        {/* Extras Row */}
        <View style={s.extrasRow}>
          <Text style={s.extrasLabel}>Extras</Text>
          <Text style={s.extrasDetail}>
            {extras.total || 0} (b {extras.byes || 0}, lb {extras.legbyes || 0}, w {extras.wides || 0}, nb {extras.noballs || 0})
          </Text>
        </View>

        {/* Total Row */}
        <View style={s.totalRow}>
          <Text style={s.totalLabel}>Total</Text>
          <Text style={s.totalScore}>
            {totalScore !== '' ? `${totalScore}-${totalWickets}` : '-'}
            {totalOvers ? ` (${totalOvers} Ov, RR: ${runRate})` : ''}
          </Text>
        </View>

        {/* Yet to Bat / Did Not Bat */}
        {yetToBat.length > 0 && (
          <View style={s.yetToBatSection}>
            <Text style={s.yetToBatTitle}>
              {isMatchComplete ? 'Did Not Bat' : 'Yet to Bat'}
            </Text>
            <Text style={s.yetToBatNames}>
              {yetToBat.map((b: any) => {
                let name = b.name || b.nickname || '';
                if (b.iscaptain) name += ' (c)';
                if (b.iskeeper) name += ' (wk)';
                return name;
              }).join(', ')}
            </Text>
          </View>
        )}
      </View>

      {/* Banner Ad - Between batting and bowling */}
      <View style={s.bannerAdContainer}>
        <BannerAdComponent />
      </View>

      {/* Bowling Section */}
      <View style={s.section}>
        <View style={s.headerRow}>
          <Text style={[s.headerCell, s.nameCol]}>Bowler</Text>
          <Text style={s.headerCell}>O</Text>
          <Text style={s.headerCell}>M</Text>
          <Text style={s.headerCell}>R</Text>
          <Text style={s.headerCell}>W</Text>
          <Text style={s.headerCell}>ECO</Text>
        </View>
        {bowlers.map((bowl: any, idx: number) => (
          <View key={idx} style={[s.dataRow, { backgroundColor: getRowBg(idx) }]}>
            <View style={[s.nameCol, s.nameColRow]}>
              <MiniAvatar imageId={playerImgMap[normalizeName(bowl.name || bowl.nickname || '')]} />
              <View style={s.nameTextWrap}>
                <Text style={s.bowlName} numberOfLines={1}>
                  {bowl.name || bowl.nickname}
                  {bowl.iscaptain ? ' (c)' : ''}
                </Text>
              </View>
            </View>
            <Text style={s.statCell}>{bowl.overs}</Text>
            <Text style={s.statCell}>{bowl.maidens}</Text>
            <Text style={s.statCell}>{bowl.runs}</Text>
            <Text style={[s.statCell, s.wicketsBold]}>{bowl.wickets}</Text>
            <Text style={s.statCell}>{bowl.economy}</Text>
          </View>
        ))}
      </View>

      {/* Banner Ad - End of bowling section */}
      <View style={s.bannerAdContainer}>
        <BannerAdComponent />
      </View>

      {/* Fall of Wickets */}
      {Array.isArray(fowData) && fowData.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Fall of Wickets</Text>
          <View style={s.fowContainer}>
            {fowData.map((fw: any, idx: number) => (
              <View key={idx} style={s.fowItem}>
                <Text style={s.fowScore}>{fw.runs}/{idx + 1}</Text>
                <Text style={s.fowName} numberOfLines={1}>{fw.batsmanname}</Text>
                <Text style={s.fowOver}>{fw.overnbr} ov</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Partnerships */}
      {Array.isArray(partnershipData) && partnershipData.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Partnerships</Text>
          {partnershipData.map((p: any, idx: number) => (
            <View key={idx} style={[s.partnerRow, { backgroundColor: getRowBg(idx) }]}>
              <View style={s.partnerInfo}>
                <Text style={s.partnerNames} numberOfLines={1}>
                  {p.bat1name} & {p.bat2name}
                </Text>
                <Text style={s.partnerDetail}>
                  {p.bat1name}: {p.bat1runs}({p.bat1balls}) | {p.bat2name}: {p.bat2runs}({p.bat2balls})
                </Text>
              </View>
              <View style={s.partnerTotal}>
                <Text style={s.partnerRuns}>{p.totalruns}</Text>
                <Text style={s.partnerBalls}>({p.totalballs}b)</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Match Status */}
      {data.status && (
        <View style={s.statusBar}>
          <Text style={s.statusText}>{data.status}</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { paddingBottom: 20 },
  center: { padding: 40, alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)', margin: 16, borderRadius: 12 },
  loadingText: { color: '#999', marginTop: 12, fontSize: 14 },
  errorText: { color: '#999', fontSize: 16, marginBottom: 12 },
  retryBtn: { backgroundColor: '#4CAF50', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  retryText: { color: '#FFF', fontWeight: 'bold' },

  bannerAdContainer: {
    minHeight: 80,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
    marginHorizontal: 12,
  },

  inningsRow: { flexDirection: 'row', backgroundColor: '#1B5E20', borderRadius: 8, margin: 12, marginBottom: 0, overflow: 'hidden' },
  inningsTab: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  inningsTabActive: { backgroundColor: '#4CAF50' },
  inningsTabText: { color: 'rgba(255,255,255,0.6)', fontWeight: '600', fontSize: 13 },
  inningsTabTextActive: { color: '#FFF' },

  section: { marginHorizontal: 12, marginTop: 12, backgroundColor: 'rgba(255,255,255,0.40)', borderRadius: 10, overflow: 'hidden', elevation: 2 },
  sectionTitle: { backgroundColor: '#1B5E20', color: '#FFF', fontSize: 13, fontWeight: '700', paddingVertical: 8, paddingHorizontal: 14, letterSpacing: 0.5 },

  headerRow: { flexDirection: 'row', backgroundColor: '#E8F5E9', paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#C8E6C9' },
  headerCell: { width: 40, textAlign: 'center', fontSize: 11, fontWeight: '700', color: '#333' },

  dataRow: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 10, borderBottomWidth: 0.5, borderBottomColor: '#E0E0E0', alignItems: 'center' },
  dataRowAlt: { backgroundColor: '#FAFAFA' },
  nameCol: { flex: 1, paddingRight: 6 },
  nameColRow: { flexDirection: 'row', alignItems: 'center' },
  nameTextWrap: { flex: 1, minWidth: 0 },
  statCell: { width: 40, textAlign: 'center', fontSize: 13, color: '#555' },
  runsBold: { fontWeight: 'bold', color: '#222' },
  wicketsBold: { fontWeight: 'bold', color: '#D32F2F' },

  batName: { fontSize: 14, fontWeight: '600', color: '#1565C0' },
  dismissal: { fontSize: 11, color: '#888', marginTop: 1 },
  bowlName: { fontSize: 14, fontWeight: '600', color: '#1565C0' },

  extrasRow: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 14, borderBottomWidth: 0.5, borderBottomColor: '#E0E0E0', backgroundColor: '#F5F5F5' },
  extrasLabel: { fontWeight: '600', fontSize: 13, color: '#555', marginRight: 8 },
  extrasDetail: { fontSize: 13, color: '#777' },

  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 14, backgroundColor: '#1B5E20' },
  totalLabel: { fontWeight: 'bold', fontSize: 14, color: '#FFF' },
  totalScore: { fontWeight: 'bold', fontSize: 14, color: '#FFF' },

  // Yet to Bat / Did Not Bat
  yetToBatSection: { paddingVertical: 10, paddingHorizontal: 14, backgroundColor: '#FFFDE7', borderTopWidth: 1, borderTopColor: '#FFF9C4' },
  yetToBatTitle: { fontWeight: '700', fontSize: 13, color: '#F57F17', marginBottom: 4 },
  yetToBatNames: { fontSize: 13, color: '#555', lineHeight: 20 },

  fowContainer: { flexDirection: 'row', flexWrap: 'wrap', padding: 10, gap: 6 },
  fowItem: { backgroundColor: '#F5F5F5', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, alignItems: 'center', minWidth: 70, borderWidth: 1, borderColor: '#E0E0E0' },
  fowScore: { fontSize: 14, fontWeight: 'bold', color: '#D32F2F' },
  fowName: { fontSize: 10, color: '#666', marginTop: 2, maxWidth: 80 },
  fowOver: { fontSize: 10, color: '#888', marginTop: 1 },

  partnerRow: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 0.5, borderBottomColor: '#E0E0E0', alignItems: 'center' },
  partnerInfo: { flex: 1 },
  partnerNames: { fontSize: 13, fontWeight: '600', color: '#333' },
  partnerDetail: { fontSize: 11, color: '#888', marginTop: 2 },
  partnerTotal: { alignItems: 'center', minWidth: 50 },
  partnerRuns: { fontSize: 16, fontWeight: 'bold', color: '#1B5E20' },
  partnerBalls: { fontSize: 11, color: '#888' },

  statusBar: { marginHorizontal: 12, marginTop: 12, backgroundColor: '#1B5E20', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  statusText: { color: '#FFF', fontWeight: '600', textAlign: 'center', fontSize: 13 },
});
