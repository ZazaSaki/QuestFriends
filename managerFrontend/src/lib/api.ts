// Backend base URL — baked at build time by Vite (see Dockerfile / compose args).
// Default is same-origin ('') so requests go to /api/... on the page's own host
// and nginx reverse-proxies them to the backend (works locally and behind a
// single Cloudflare tunnel — no CORS, no mixed content). Set VITE_API_URL to an
// absolute URL only if the backend is on a different origin.
export const API_BASE = import.meta.env.VITE_API_URL ?? '';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(API_BASE + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `${method} ${path} → ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

// ---- Types (subset of backend responses used by the manager) ----
export interface GameSummary {
  id: string;
  title: string;
  description: string | null;
  createdAt: string;
  questCount: number;
  trackCount: number;
  roomCount: number;
}

export interface RoomSummary {
  id: string;
  gameId: string;
  status: 'OPEN' | 'PLAYING' | 'FINISHED';
  createdAt: string;
  teamCount: number;
}

export interface Member {
  user: { id: string; username: string };
}

export interface Team {
  id: string;
  name: string;
  trackId: string;
  currentSeqNum: number;
  totalScore: number;
  activeQuestId: string | null;
  track?: { id: string; name: string };
  members: Member[];
}

export interface RoomDetail {
  id: string;
  gameId: string;
  status: 'OPEN' | 'PLAYING' | 'FINISHED';
  createdAt: string;
  teams: Team[];
}

// ---- Game detail (Quest Builder) ----
export interface QuestDetail {
  id: string;
  title: string;
  score: number;
  openChallengeType: 'NONE' | 'PASSWORD' | 'QR';
  openChallengeValue: string | null;
  challengeType: 'QUIZ' | 'PHOTO' | 'VIDEO';
  content: unknown;
  postChallengeContent: unknown;
}

export interface WaypointDetail {
  id: string;
  questId: string;
  sequenceOrder: number;
  latitude: number;
  longitude: number;
  radius: number;
}

export interface TrackDetail {
  id: string;
  name: string;
  waypoints: WaypointDetail[];
}

export interface GameDetail {
  id: string;
  title: string;
  description: string | null;
  introduction: unknown;
  conclusion: unknown;
  quests: QuestDetail[];
  tracks: TrackDetail[];
}

// ---- Calls ----
export const listGames = () => request<GameSummary[]>('GET', '/api/games');

export const getGame = (gameId: string) => request<GameDetail>('GET', `/api/games/${gameId}`);

export const deleteGame = (gameId: string) =>
  request<{ id: string; deleted: boolean }>('DELETE', `/api/games/${gameId}`);

export interface UpdateGamePayload {
  title: string;
  introduction?: unknown;
  conclusion?: unknown;
  quests: Omit<NewQuest, 'gameId'>[];
  tracks: { name: string; waypoints: { questIndex: number; sequenceOrder: number; latitude: number; longitude: number }[] }[];
}
export const updateGame = (gameId: string, payload: UpdateGamePayload) =>
  request<GameDetail>('PUT', `/api/games/${gameId}`, payload);

// ---- Authoring (create) — used by QuestBuilder Save ----
export const createUser = (username: string, role = 'MANAGER') =>
  request<{ id: string; username: string; role: string }>('POST', '/api/users', { username, role });

export interface NewGame {
  title: string;
  description?: string;
  introduction?: unknown;
  conclusion?: unknown;
  creatorId: string;
}
export const createGame = (payload: NewGame) =>
  request<{ id: string }>('POST', '/api/games', payload);

export interface NewQuest {
  gameId: string;
  title: string;
  score?: number;
  openChallengeType?: 'NONE' | 'PASSWORD' | 'QR';
  openChallengeValue?: string | null;
  challengeType?: 'QUIZ' | 'PHOTO' | 'VIDEO';
  content: unknown;
  postChallengeContent?: unknown;
}
export const createQuest = (payload: NewQuest) =>
  request<{ id: string }>('POST', '/api/quests', payload);

export const createTrack = (gameId: string, name: string) =>
  request<{ id: string }>('POST', '/api/tracks', { gameId, name });

export interface NewWaypoint {
  questId: string;
  sequenceOrder: number;
  latitude: number;
  longitude: number;
  radius?: number;
}
export const appendWaypoints = (trackId: string, waypoints: NewWaypoint[]) =>
  request('POST', `/api/tracks/${trackId}/waypoints`, { waypoints });

// ---- Media upload (presigned) ----
export interface UploadUrls {
  uploadUrl: string;
  getUrl: string;
  publicUrl: string;
  objectName: string;
  bucket: string;
}
export const getUploadUrl = (ext: string) =>
  request<UploadUrls>('GET', `/api/play/upload-url?ext=${encodeURIComponent(ext)}`);

export const listRooms = (gameId?: string) =>
  request<RoomSummary[]>('GET', '/api/rooms' + (gameId ? `?gameId=${encodeURIComponent(gameId)}` : ''));

export const getRoom = (roomId: string) => request<RoomDetail>('GET', `/api/rooms/${roomId}`);

/** `teamCount` omitted = one team per track (tracks are shared round-robin above that). */
export const createRoom = (gameId: string, staffPassword?: string, teamCount?: number) =>
  request<RoomDetail>('POST', '/api/rooms', { gameId, staffPassword, teamCount });

export const startRoom = (roomId: string) =>
  request<{ id: string; status: string }>('POST', `/api/rooms/${roomId}/start`);

export const endRoom = (roomId: string) =>
  request<{ id: string; status: string }>('POST', `/api/rooms/${roomId}/end`);

/** Erases the room, its teams, members and submissions. Not undoable. */
export const deleteRoom = (roomId: string) =>
  request<{ id: string; deleted: boolean }>('DELETE', `/api/rooms/${roomId}`);

export const swapMember = (userId: string, fromTeamId: string, toTeamId: string) =>
  request('PUT', '/api/teams/swap-member', { userId, fromTeamId, toTeamId });
