import { useState, useEffect, useCallback } from 'react';
import { Plus, ChevronRight, Gamepad2, DoorOpen, RefreshCw, Edit3, Search } from 'lucide-react';
import { cn } from '../components/Layout';
import { useNavigate } from 'react-router-dom';
import { listGames, listRooms, createRoom, type GameSummary, type RoomSummary } from '../lib/api';

const STATUS_LABEL: Record<string, string> = { OPEN: 'open', PLAYING: 'active', FINISHED: 'completed' };

export default function Dashboard() {
  const navigate = useNavigate();
  const [games, setGames] = useState<GameSummary[]>([]);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [loadingGames, setLoadingGames] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [isCreateRoomModalOpen, setIsCreateRoomModalOpen] = useState(false);
  const [staffPassword, setStaffPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const loadGames = useCallback(async () => {
    setLoadingGames(true);
    setError(null);
    try {
      const g = await listGames();
      setGames(g);
      setSelectedGame((cur) => cur ?? (g[0]?.id ?? null));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingGames(false);
    }
  }, []);

  const loadRooms = useCallback(async (gameId: string) => {
    try {
      setRooms(await listRooms(gameId));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => { loadGames(); }, [loadGames]);
  useEffect(() => { if (selectedGame) loadRooms(selectedGame); else setRooms([]); }, [selectedGame, loadRooms]);

  const handleCreateRoom = async () => {
    if (!selectedGame) return;
    setCreating(true);
    setCreateError(null);
    try {
      const room = await createRoom(selectedGame, staffPassword || undefined);
      setIsCreateRoomModalOpen(false);
      setStaffPassword('');
      navigate(`/monitor/${room.id}`);
    } catch (e) {
      setCreateError((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const filteredGames = games.filter((g) => g.title.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="flex h-full relative">
      {/* Left Column: Games */}
      <div className="w-1/2 border-r border-neutral-200 flex flex-col bg-white">
        <div className="p-4 border-b border-neutral-200 flex items-center justify-between bg-white">
          <h2 className="text-lg font-semibold text-neutral-900 flex items-center gap-2">
            <Gamepad2 className="w-5 h-5 text-indigo-500" />
            Games {!loadingGames && `(${filteredGames.length})`}
          </h2>
          <div className="flex items-center gap-2">
            <button onClick={loadGames} className="p-2 text-neutral-500 hover:text-indigo-600 rounded-md hover:bg-neutral-100" title="Refresh">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button onClick={() => navigate('/builder')} className="p-2 text-white bg-indigo-600 rounded-md hover:bg-indigo-700 transition-colors" title="New game (Quest Builder)">
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
        {/* Search */}
        <div className="px-4 pt-3 pb-1 border-b border-neutral-100">
          <div className="relative">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search games…"
              className="w-full pl-9 pr-3 py-2 border border-neutral-200 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">{error}</div>}
          {loadingGames ? (
            <div className="text-sm text-neutral-400">Loading games…</div>
          ) : games.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-neutral-400 text-sm">
              <Gamepad2 className="w-12 h-12 text-neutral-200 mb-2" />
              No games yet — create one in the Quest Builder (or seed the backend).
            </div>
          ) : filteredGames.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-neutral-400 text-sm">
              <Search className="w-10 h-10 text-neutral-200 mb-2" />
              No games match “{query}”.
            </div>
          ) : (
            filteredGames.map((game) => (
              <div
                key={game.id}
                onClick={() => setSelectedGame(game.id)}
                className={cn(
                  'p-4 rounded-lg border cursor-pointer transition-all flex items-center justify-between group',
                  selectedGame === game.id ? 'border-indigo-500 bg-indigo-50 shadow-sm' : 'border-neutral-200 hover:border-indigo-300 hover:bg-neutral-50'
                )}
              >
                <div>
                  <h3 className={cn('font-medium', selectedGame === game.id ? 'text-indigo-900' : 'text-neutral-900')}>{game.title}</h3>
                  <span className="text-xs text-neutral-500 mt-1 block">
                    {game.questCount} quests · {game.trackCount} tracks · {game.roomCount} rooms
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); navigate(`/builder/${game.id}`); }}
                    className="p-1.5 text-neutral-400 hover:text-indigo-600 hover:bg-indigo-100 rounded transition-colors opacity-0 group-hover:opacity-100"
                    title="Edit in Quest Builder"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <ChevronRight className={cn('w-5 h-5', selectedGame === game.id ? 'text-indigo-500' : 'text-neutral-300 group-hover:text-neutral-400')} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right Column: Rooms */}
      <div className="w-1/2 flex flex-col bg-neutral-50/50">
        <div className="p-4 border-b border-neutral-200 flex items-center justify-between bg-white">
          <h2 className="text-lg font-semibold text-neutral-900 flex items-center gap-2">
            <DoorOpen className="w-5 h-5 text-emerald-500" />
            Rooms {selectedGame && `(${rooms.length})`}
          </h2>
          <button
            onClick={() => { setCreateError(null); setIsCreateRoomModalOpen(true); }}
            disabled={!selectedGame}
            className="p-2 text-white bg-emerald-600 rounded-md hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {!selectedGame ? (
            <div className="h-full flex items-center justify-center text-neutral-400 text-sm">Select a game to view its rooms</div>
          ) : rooms.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-neutral-400 text-sm">
              <DoorOpen className="w-12 h-12 text-neutral-200 mb-2" />
              No rooms created yet
            </div>
          ) : (
            rooms.map((room) => (
              <div
                key={room.id}
                onClick={() => navigate(`/monitor/${room.id}`)}
                className="p-4 bg-white rounded-lg border border-neutral-200 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow cursor-pointer"
              >
                <div>
                  <h3 className="font-medium text-neutral-900 font-mono">Room {room.id.slice(0, 8)}</h3>
                  <div className="flex items-center gap-3 mt-1 text-sm text-neutral-500">
                    <span>{room.teamCount} teams</span>
                    <span>•</span>
                    <span>{new Date(room.createdAt).toLocaleString()}</span>
                  </div>
                </div>
                <span className={cn(
                  'px-2.5 py-1 text-xs rounded-full font-medium capitalize',
                  room.status === 'PLAYING' ? 'bg-emerald-100 text-emerald-700' :
                  room.status === 'OPEN' ? 'bg-blue-100 text-blue-700' :
                  'bg-neutral-100 text-neutral-700'
                )}>
                  {STATUS_LABEL[room.status] ?? room.status}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Create Room Modal */}
      {isCreateRoomModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-xl w-[90vw] max-w-md overflow-hidden flex flex-col">
            <div className="p-4 border-b border-neutral-200 flex items-center justify-between bg-neutral-50">
              <h3 className="font-semibold text-neutral-900">Create New Room</h3>
              <button onClick={() => setIsCreateRoomModalOpen(false)} className="text-neutral-500 hover:text-neutral-700 text-xl leading-none">&times;</button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-sm text-neutral-600">
                A team is created automatically for each <b>track</b> in this game. Add tracks in the Quest Builder to change team count.
              </p>
              <div>
                <label className="text-sm font-medium text-neutral-700 mb-1 block">Staff Password (optional)</label>
                <input
                  type="text"
                  value={staffPassword}
                  onChange={(e) => setStaffPassword(e.target.value)}
                  placeholder="Leave blank for no password"
                  className="w-full px-3 py-2 border border-neutral-200 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white"
                />
              </div>
              {createError && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-2">{createError}</div>}
            </div>
            <div className="p-4 border-t border-neutral-200 flex justify-end gap-3 bg-neutral-50">
              <button onClick={() => setIsCreateRoomModalOpen(false)} className="px-4 py-2 border border-neutral-300 rounded-md text-neutral-700 hover:bg-neutral-100 transition-colors font-medium text-sm">Cancel</button>
              <button onClick={handleCreateRoom} disabled={creating} className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition-colors font-medium text-sm disabled:opacity-50">
                {creating ? 'Creating…' : 'Create Room'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
