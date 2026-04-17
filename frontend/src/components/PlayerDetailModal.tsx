import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fetchPlayerProfile } from '../services/api';

interface Player {
  id?: string | number;
  name?: string;
  fullName?: string;
  role?: string;
  battingStyle?: string;
  bowlingStyle?: string;
  faceImageId?: string | number;
  captain?: boolean;
  keeper?: boolean;
  substitute?: boolean;
}

interface PlayerDetailModalProps {
  player: Player | null;
  visible: boolean;
  onClose: () => void;
}

const PHOTO_SIZE = 130;

const PlayerDetailModal: React.FC<PlayerDetailModalProps> = ({ player, visible, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!visible || !player?.id) {
        setProfile(null);
        return;
      }
      setLoading(true);
      const result = await fetchPlayerProfile(player.id);
      if (!cancelled) {
        setProfile(result);
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [visible, player?.id]);

  if (!player) return null;

  const photoUrl =
    player.faceImageId
      ? `https://www.cricbuzz.com/a/img/v1/192x192/i1/c${player.faceImageId}/player.jpg`
      : null;

  const info = profile?.info || {};
  const battingRows = extractStatRows(profile?.batting);
  const bowlingRows = extractStatRows(profile?.bowling);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} data-testid="player-modal-close">
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>

          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {/* Photo */}
            <View style={styles.photoWrap}>
              {photoUrl ? (
                <Image source={{ uri: photoUrl }} style={styles.photo} resizeMode="cover" />
              ) : (
                <View style={[styles.photo, styles.photoPlaceholder]}>
                  <Ionicons name="person" size={60} color="#BBB" />
                </View>
              )}
            </View>

            {/* Name + badges */}
            <Text style={styles.name} numberOfLines={2}>
              {info.name || player.fullName || player.name || 'Player'}
            </Text>
            {(info.nickName || info.role) ? (
              <Text style={styles.nickname} numberOfLines={1}>
                {[info.nickName, info.role || player.role].filter(Boolean).join(' • ')}
              </Text>
            ) : player.role ? (
              <Text style={styles.nickname}>{player.role}</Text>
            ) : null}

            <View style={styles.badgeRow}>
              {player.captain ? <Badge label="CAPTAIN" color="#FFC107" /> : null}
              {player.keeper ? <Badge label="WICKET-KEEPER" color="#00BCD4" /> : null}
              {player.substitute ? <Badge label="SUBSTITUTE" color="#9E9E9E" /> : null}
            </View>

            {/* Bio row */}
            {(info.bat || info.bowl || info.intlTeam || info.birthPlace) ? (
              <View style={styles.bioBox}>
                {info.intlTeam ? <BioLine label="Intl. Team" value={info.intlTeam} /> : null}
                {info.bat ? <BioLine label="Batting" value={info.bat} /> : null}
                {info.bowl ? <BioLine label="Bowling" value={info.bowl} /> : null}
                {info.birthPlace ? <BioLine label="Birthplace" value={info.birthPlace} /> : null}
                {info.DoBFormat || info.DoB ? <BioLine label="DOB" value={info.DoBFormat || info.DoB} /> : null}
              </View>
            ) : null}

            {/* Loading state */}
            {loading ? (
              <View style={styles.loading}>
                <ActivityIndicator size="small" color="#4CAF50" />
                <Text style={styles.loadingTxt}>Loading career stats…</Text>
              </View>
            ) : null}

            {/* Batting stats */}
            {battingRows.length > 0 ? (
              <View style={styles.statsBox}>
                <Text style={styles.statsTitle}>Batting Career</Text>
                <StatsGrid rows={battingRows} highlight={['Mat', 'Runs', 'Avg', 'SR']} />
              </View>
            ) : null}

            {/* Bowling stats */}
            {bowlingRows.length > 0 ? (
              <View style={styles.statsBox}>
                <Text style={styles.statsTitle}>Bowling Career</Text>
                <StatsGrid rows={bowlingRows} highlight={['Mat', 'Wkts', 'Econ', 'SR']} />
              </View>
            ) : null}

            {!loading && battingRows.length === 0 && bowlingRows.length === 0 ? (
              <Text style={styles.noStats}>Career stats not available.</Text>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const Badge: React.FC<{ label: string; color: string }> = ({ label, color }) => (
  <View style={[styles.badge, { backgroundColor: color }]}>
    <Text style={styles.badgeTxt}>{label}</Text>
  </View>
);

const BioLine: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.bioLine}>
    <Text style={styles.bioLabel}>{label}</Text>
    <Text style={styles.bioValue} numberOfLines={1}>{value}</Text>
  </View>
);

// Pick the 4 most-relevant columns per format row for a compact grid.
interface StatRow {
  format: string;
  values: Record<string, string>;
}

function extractStatRows(stats: any): StatRow[] {
  if (!stats || !Array.isArray(stats.headers) || !Array.isArray(stats.values)) return [];
  const headers: string[] = stats.headers; // e.g., ["ROWHEADER","Test","ODI","T20I","IPL"]
  const rowsSource: any[] = stats.values; // [{ values: ["Matches","112","214",...] }, ...]

  // Transpose: build one row per FORMAT with values keyed by stat name
  const formats = headers.slice(1); // drop ROWHEADER
  const out: StatRow[] = formats.map(fmt => ({ format: fmt, values: {} }));

  for (const row of rowsSource) {
    const vals: string[] = row?.values || [];
    if (vals.length < 2) continue;
    const statName = vals[0];
    for (let i = 1; i < vals.length && i - 1 < out.length; i++) {
      out[i - 1].values[statName] = vals[i];
    }
  }

  // Only keep formats that have actual data (non-empty Mat column)
  return out.filter(r => r.values['Matches'] || r.values['Mat'] || r.values['M']);
}

const StatsGrid: React.FC<{ rows: StatRow[]; highlight: string[] }> = ({ rows, highlight }) => {
  // Resolve actual stat keys (Cricbuzz headers vary: "Matches" vs "Mat")
  const resolveKey = (row: StatRow, wanted: string): string | undefined => {
    const keys = Object.keys(row.values);
    // Exact match first
    if (keys.includes(wanted)) return wanted;
    // Common aliases
    const aliases: Record<string, string[]> = {
      Mat: ['Matches', 'M'],
      Runs: ['Run'],
      Avg: ['Average'],
      SR: ['Strike Rate', 'S/R'],
      Wkts: ['Wickets', 'Wk'],
      Econ: ['Economy', 'Eco'],
    };
    for (const alias of aliases[wanted] || []) {
      if (keys.includes(alias)) return alias;
    }
    return undefined;
  };

  return (
    <View style={styles.grid}>
      {/* Header row */}
      <View style={styles.gridHeaderRow}>
        <Text style={[styles.gridCell, styles.gridHeaderCell, { flex: 1 }]}>Format</Text>
        {highlight.map(h => (
          <Text key={h} style={[styles.gridCell, styles.gridHeaderCell]}>{h}</Text>
        ))}
      </View>
      {rows.map((r, idx) => (
        <View key={idx} style={[styles.gridRow, idx % 2 === 1 && styles.gridRowAlt]}>
          <Text style={[styles.gridCell, styles.gridFormatCell, { flex: 1 }]}>{r.format}</Text>
          {highlight.map(h => {
            const key = resolveKey(r, h);
            return (
              <Text key={h} style={styles.gridCell}>
                {key ? (r.values[key] || '-') : '-'}
              </Text>
            );
          })}
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  modal: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '85%',
    backgroundColor: '#1E1E1E',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2C2C2C',
  },
  closeBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.4)',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 22,
    alignItems: 'center',
  },
  photoWrap: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: PHOTO_SIZE / 2,
    overflow: 'hidden',
    marginBottom: 10,
    borderWidth: 3,
    borderColor: '#4CAF50',
    backgroundColor: '#2C2C2C',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 4,
  },
  nickname: {
    color: '#B8B8B8',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
    justifyContent: 'center',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  badgeTxt: {
    color: '#000',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  bioBox: {
    width: '100%',
    marginTop: 14,
    backgroundColor: '#252525',
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
  bioLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bioLabel: {
    color: '#888',
    fontSize: 12,
  },
  bioValue: {
    color: '#EEE',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
    marginLeft: 10,
  },
  statsBox: {
    width: '100%',
    marginTop: 14,
  },
  statsTitle: {
    color: '#4CAF50',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  grid: {
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#252525',
  },
  gridHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#2F2F2F',
    paddingVertical: 6,
  },
  gridRow: {
    flexDirection: 'row',
    paddingVertical: 6,
  },
  gridRowAlt: {
    backgroundColor: '#2A2A2A',
  },
  gridCell: {
    flex: 1,
    textAlign: 'center',
    color: '#DDD',
    fontSize: 12,
  },
  gridHeaderCell: {
    color: '#888',
    fontWeight: '700',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  gridFormatCell: {
    color: '#4CAF50',
    fontWeight: '700',
  },
  loading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
  },
  loadingTxt: {
    color: '#888',
    fontSize: 12,
  },
  noStats: {
    color: '#666',
    fontSize: 12,
    marginTop: 14,
    fontStyle: 'italic',
  },
});

export default PlayerDetailModal;
