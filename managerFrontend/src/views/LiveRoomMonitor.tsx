import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { MapContainer, TileLayer, Popup, CircleMarker, useMap } from 'react-leaflet';
import { Copy, Users, ChevronDown, ChevronRight, Activity, Trophy } from 'lucide-react';
import { cn } from '../components/Layout';
import { getRoom, startRoom, endRoom, swapMember, type RoomDetail } from '../lib/api';
import { connectStaff } from '../lib/socket';

const COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
const DEFAULT_CENTER: [number, number] = [40.4168, -3.7038];

interface UIPlayer { userId: string; name: string; position: [number, number] | null }
interface UITeam { id: string; name: string; color: string; players: UIPlayer[]; score: number }

function mergeTeams(prev: UITeam[], detail: RoomDetail): UITeam[] {
  const pos = new Map<string, [number, number] | null>();
  prev.forEach((t) => t.players.forEach((p) => pos.set(p.userId, p.position)));
  return detail.teams.map((t, i) => ({
    id: t.id,
    name: t.name,
    color: COLORS[i % COLORS.length],
    score: t.totalScore,
    players: t.members.map((m) => ({ userId: m.user.id, name: m.user.username, position: pos.get(m.user.id) ?? null })),
  }));
}

// Recenter the map once, when the first player position arrives.
function RecenterOnFirstFix({ center }: { center: [number, number] | null }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (center && !done.current) { map.setView(center, 15); done.current = true; }
  }, [center, map]);
  return null;
}

export default function LiveRoomMonitor() {
  const { roomId } = useParams<{ roomId?: string }>();
  const [teams, setTeams] = useState<UITeam[]>([]);
  const [status, setStatus] = useState<string>('…');
  const [closedReason, setClosedReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedTeams, setExpandedTeams] = useState<Record<string, boolean>>({});
  const [isRoomInfoExpanded, setIsRoomInfoExpanded] = useState(true);
  const [isTeamRosterExpanded, setIsTeamRosterExpanded] = useState(true);
  const [playerActionMenu, setPlayerActionMenu] = useState<{ teamId: string; player: UIPlayer; x: number; y: number } | null>(null);
  const [swapTeamModal, setSwapTeamModal] = useState<{ teamId: string; player: UIPlayer } | null>(null);
  const [selectedSwapTeam, setSelectedSwapTeam] = useState('');

  const refresh = useCallback(async () => {
    if (!roomId) return;
    try {
      const detail = await getRoom(roomId);
      setStatus(detail.status);
      setTeams((prev) => mergeTeams(prev, detail));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [roomId]);

  // Initial load + polling fallback for roster/scores.
  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, 5000);
    return () => clearInterval(iv);
  }, [refresh]);

  // Live socket: player positions, score updates, room closure.
  useEffect(() => {
    if (!roomId) return;
    const socket = connectStaff(roomId);
    socket.on('player_location', (p: { userId: string; teamId: string; lat: number; lng: number }) => {
      setTeams((prev) => prev.map((t) => ({
        ...t,
        players: t.players.map((pl) => (pl.userId === p.userId ? { ...pl, position: [p.lat, p.lng] as [number, number] } : pl)),
      })));
    });
    socket.on('validation_result', (p: { teamId: string; totalScore?: number }) => {
      if (typeof p.totalScore === 'number') {
        setTeams((prev) => prev.map((t) => (t.id === p.teamId ? { ...t, score: p.totalScore! } : t)));
      } else { refresh(); }
    });
    socket.on('room_closed', (p: { reason: string }) => { setClosedReason(p.reason); setStatus('FINISHED'); });
    return () => { socket.disconnect(); };
  }, [roomId, refresh]);

  const toggleTeam = (id: string) => setExpandedTeams((p) => ({ ...p, [id]: !p[id] }));
  const sortedTeams = [...teams].sort((a, b) => b.score - a.score);
  const firstFix = teams.flatMap((t) => t.players).find((p) => p.position)?.position ?? null;

  const doStart = async () => { if (roomId) { try { await startRoom(roomId); setStatus('PLAYING'); } catch (e) { setError((e as Error).message); } } };
  const doEnd = async () => { if (roomId) { try { await endRoom(roomId); setStatus('FINISHED'); } catch (e) { setError((e as Error).message); } } };

  const executeSwap = async () => {
    if (!swapTeamModal || !selectedSwapTeam || !roomId) return;
    try {
      await swapMember(swapTeamModal.player.userId, swapTeamModal.teamId, selectedSwapTeam);
      setSwapTeamModal(null);
      setSelectedSwapTeam('');
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="flex h-full w-full bg-neutral-100 overflow-hidden relative">
      {closedReason && (
        <div className="absolute top-0 inset-x-0 z-[3000] bg-red-600 text-white text-center py-2 font-semibold">
          ⛔ Room closed ({closedReason})
        </div>
      )}

      {/* Left Panel */}
      <div className="bg-white border-r border-neutral-200 flex flex-col shadow-sm z-50 h-full w-[340px] overflow-y-auto">
        {/* Room Info */}
        <div className="flex flex-col border-b border-neutral-200 shrink-0">
          <div className="p-4 bg-neutral-50 flex items-center justify-between cursor-pointer hover:bg-neutral-100" onClick={() => setIsRoomInfoExpanded((v) => !v)}>
            <h2 className="font-semibold text-neutral-900 flex items-center gap-2"><Activity className="w-5 h-5 text-indigo-500" /> Live Room</h2>
            <div className="flex items-center gap-3">
              <span className={cn('flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full',
                status === 'PLAYING' ? 'text-emerald-600 bg-emerald-100' : status === 'OPEN' ? 'text-blue-600 bg-blue-100' : 'text-neutral-600 bg-neutral-100')}>
                <span className={cn('w-2 h-2 rounded-full', status === 'PLAYING' ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-400')} />{status}
              </span>
              {isRoomInfoExpanded ? <ChevronDown className="w-4 h-4 text-neutral-500" /> : <ChevronRight className="w-4 h-4 text-neutral-500" />}
            </div>
          </div>
          {isRoomInfoExpanded && (
            <div className="p-5 space-y-5">
              <div>
                <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2 block">Room ID</label>
                <div className="font-mono text-sm font-bold text-neutral-900 bg-neutral-100 px-3 py-2 rounded-md border border-neutral-200 break-all">{roomId}</div>
              </div>
              {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</div>}
              <div className="space-y-4 pt-1">
                <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider block border-b pb-2">Game Controls</label>
                <div className="flex flex-col gap-2">
                  <button onClick={doStart} className="w-full py-2 bg-emerald-600 text-white rounded-md font-medium hover:bg-emerald-700 transition-colors shadow-sm">Start Game</button>
                  <button disabled title="Pause is not supported by the backend" className="w-full py-2 bg-amber-100 text-amber-700 rounded-md font-medium opacity-50 cursor-not-allowed">Pause Game</button>
                  <button onClick={doEnd} className="w-full py-2 bg-red-100 text-red-700 rounded-md font-medium hover:bg-red-200 transition-colors">End Game</button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider block border-b pb-2">Invite Link</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-neutral-100 border border-neutral-200 rounded-md px-3 py-2 text-xs text-neutral-600 font-mono truncate">play.game/{roomId?.slice(0, 8)}</div>
                  <button onClick={() => roomId && navigator.clipboard?.writeText(roomId)} className="p-2 bg-indigo-50 text-indigo-600 rounded-md hover:bg-indigo-100 transition-colors shrink-0" title="Copy room ID"><Copy className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Team Roster */}
        <div className="flex flex-col border-b border-neutral-200 shrink-0">
          <div className="p-4 bg-neutral-50 flex items-center justify-between cursor-pointer hover:bg-neutral-100" onClick={() => setIsTeamRosterExpanded((v) => !v)}>
            <h2 className="font-semibold text-neutral-900 flex items-center gap-2"><Users className="w-5 h-5 text-indigo-500" /> Team Roster</h2>
            {isTeamRosterExpanded ? <ChevronDown className="w-4 h-4 text-neutral-500" /> : <ChevronRight className="w-4 h-4 text-neutral-500" />}
          </div>
          {isTeamRosterExpanded && (
            <div className="p-4 space-y-3 bg-white">
              <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4 flex items-center justify-between mb-2">
                <div><p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">Total Teams</p><p className="text-2xl font-bold text-indigo-900">{teams.length}</p></div>
                <Users className="w-8 h-8 text-indigo-200" />
              </div>
              {teams.map((team) => (
                <div key={team.id} className="border border-neutral-200 rounded-lg overflow-hidden shadow-sm">
                  <button onClick={() => toggleTeam(team.id)} className="w-full px-4 py-3 bg-white flex items-center justify-between hover:bg-neutral-50 transition-colors">
                    <div className="flex items-center gap-3"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: team.color }} /><span className="font-medium text-neutral-900">{team.name}</span></div>
                    <div className="flex items-center gap-2 text-neutral-400"><span className="text-xs font-medium">{team.players.length} players</span>{expandedTeams[team.id] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</div>
                  </button>
                  {expandedTeams[team.id] && (
                    <div className="bg-neutral-50 border-t border-neutral-100 p-3 space-y-1">
                      {team.players.length === 0 && <div className="text-xs text-neutral-400 px-3 py-1">No players joined</div>}
                      {team.players.map((player) => (
                        <button key={player.userId}
                          onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setPlayerActionMenu({ teamId: team.id, player, x: r.right + 10, y: r.top }); }}
                          className="w-full px-3 py-1.5 text-sm text-neutral-600 flex items-center gap-2 bg-white border border-neutral-100 rounded-md hover:bg-indigo-50 hover:border-indigo-100 transition-colors text-left">
                          <div className={cn('w-1.5 h-1.5 rounded-full', player.position ? 'bg-emerald-500' : 'bg-neutral-300')} />{player.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Scoreboard */}
        <div className="flex-1 flex flex-col bg-white">
          <div className="p-4 border-b border-neutral-200 bg-neutral-50 flex items-center">
            <h2 className="font-semibold text-neutral-900 flex items-center gap-2"><Trophy className="w-5 h-5 text-amber-500" /> Scoreboard</h2>
          </div>
          <div className="p-4 space-y-3">
            {sortedTeams.map((team, idx) => (
              <div key={team.id} className="flex items-center justify-between p-3 bg-white border border-neutral-200 rounded-lg shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-neutral-100 text-xs font-bold text-neutral-500">#{idx + 1}</div>
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: team.color }} /><span className="font-medium text-neutral-900">{team.name}</span></div>
                </div>
                <div className="font-bold text-indigo-600">{team.score}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Center: Live Map */}
      <div className="flex-1 relative z-0 flex flex-col">
        <MapContainer center={DEFAULT_CENTER} zoom={13} className="w-full h-full absolute inset-0" zoomControl={false}>
          <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <RecenterOnFirstFix center={firstFix} />
          {teams.flatMap((team) => team.players.filter((p) => p.position).map((player) => (
            <CircleMarker key={`${team.id}-${player.userId}`} center={player.position as [number, number]} radius={8}
              pathOptions={{ color: team.color, fillColor: team.color, fillOpacity: 0.8, weight: 2 }}>
              <Popup>
                <div className="font-semibold text-sm">{player.name}</div>
                <div className="text-xs text-neutral-500">Team: {team.name}</div>
                <div className="text-xs font-bold text-indigo-600 mt-1">Score: {team.score}</div>
              </Popup>
            </CircleMarker>
          )))}
        </MapContainer>
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] bg-white/90 backdrop-blur-sm p-3 rounded-lg shadow-lg border border-neutral-200 flex gap-4 pointer-events-none">
          {teams.length === 0 ? <span className="text-sm text-neutral-500">No teams</span> : teams.map((team) => (
            <div key={team.id} className="flex items-center gap-2 text-sm"><div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: team.color }} /><span className="font-medium text-neutral-700">{team.name}</span></div>
          ))}
        </div>
      </div>

      {/* Player Action Menu */}
      {playerActionMenu && (
        <>
          <div className="fixed inset-0 z-[1000]" onClick={() => setPlayerActionMenu(null)} />
          <div className="fixed z-[1001] bg-white rounded-md shadow-xl border border-neutral-200 py-1 min-w-[160px] flex flex-col overflow-hidden" style={{ top: playerActionMenu.y, left: playerActionMenu.x }}>
            <div className="px-3 py-2 border-b border-neutral-100 mb-1"><span className="text-xs font-semibold text-neutral-500 uppercase">{playerActionMenu.player.name}</span></div>
            <button className="px-4 py-2 text-sm text-left hover:bg-neutral-50 text-neutral-700 transition-colors"
              onClick={() => { setSwapTeamModal({ teamId: playerActionMenu.teamId, player: playerActionMenu.player }); setPlayerActionMenu(null); }}>Swap Team</button>
          </div>
        </>
      )}

      {/* Swap Team Modal */}
      {swapTeamModal && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-xl w-[90vw] max-w-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b border-neutral-200 flex items-center justify-between bg-neutral-50">
              <h3 className="font-semibold text-neutral-900">Swap Team</h3>
              <button onClick={() => setSwapTeamModal(null)} className="text-neutral-500 hover:text-neutral-700 text-xl leading-none">&times;</button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-sm text-neutral-600 mb-4">Move <span className="font-semibold text-neutral-900">{swapTeamModal.player.name}</span> to a different team.</p>
              <label className="text-sm font-medium text-neutral-700 mb-1 block">Select New Team</label>
              <select className="w-full px-3 py-2 border border-neutral-200 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm bg-white" value={selectedSwapTeam} onChange={(e) => setSelectedSwapTeam(e.target.value)}>
                <option value="" disabled>Choose a team...</option>
                {teams.filter((t) => t.id !== swapTeamModal.teamId).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
            </div>
            <div className="p-4 border-t border-neutral-200 flex justify-end gap-3 bg-neutral-50">
              <button onClick={() => setSwapTeamModal(null)} className="px-4 py-2 border border-neutral-300 rounded-md text-neutral-700 hover:bg-neutral-100 transition-colors font-medium text-sm">Cancel</button>
              <button onClick={executeSwap} disabled={!selectedSwapTeam} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed">Confirm Swap</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
