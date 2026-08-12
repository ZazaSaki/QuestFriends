// Backend base URL — baked at build time by Vite (see Dockerfile / compose args).
// Default is same-origin ('') so requests go to /api/... on the page's own host
// and nginx reverse-proxies them to the backend (works locally, on a LAN IP, and
// behind a single Cloudflare tunnel — no CORS, no mixed content).
export const API_BASE = import.meta.env.VITE_API_URL ?? '';

/** Error carrying the HTTP status so callers can branch on 403 / 409. */
export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

async function request(method, path, body) {
  const res = await fetch(API_BASE + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `${method} ${path} → ${res.status}`;
    throw new ApiError(msg, res.status, data);
  }
  return data;
}

// ---- Room / lobby ----------------------------------------------------------

/** POST /api/rooms/:roomId/join-player → { user, team: { id, name, trackId } } */
export const joinPlayer = (roomId, username) =>
  request('POST', `/api/rooms/${encodeURIComponent(roomId)}/join-player`, { username });

/**
 * GET /api/rooms/:roomId → room incl. status, gameId and teams[] with
 * totalScore / currentSeqNum / members. Doubles as the leaderboard source —
 * the backend has no dedicated leaderboard endpoint.
 */
export const getRoom = (roomId) => request('GET', `/api/rooms/${encodeURIComponent(roomId)}`);

/** GET /api/games/:gameId → incl. `introduction` / `conclusion` block JSON. */
export const getGame = (gameId) => request('GET', `/api/games/${encodeURIComponent(gameId)}`);

// ---- Play loop -------------------------------------------------------------

/** GET /api/play/current-state?userId= — refresh recovery. */
export const getCurrentState = (userId) =>
  request('GET', `/api/play/current-state?userId=${encodeURIComponent(userId)}`);

/**
 * GET /api/play/next-coordinate?teamId=
 * → { latitude, longitude, radius, sequenceOrder, openChallengeType } | { finished: true }
 * Deliberately never carries the quest content (anti-cheat).
 */
export const getNextCoordinate = (teamId) =>
  request('GET', `/api/play/next-coordinate?teamId=${encodeURIComponent(teamId)}`);

/**
 * POST /api/play/unlock-quest — reveals the quest for the WHOLE team.
 * Throws ApiError 403 (wrong QR/passcode) or 409 (another quest already active).
 */
export const unlockQuest = (teamId, challengeValue) =>
  request('POST', '/api/play/unlock-quest', {
    teamId,
    ...(challengeValue ? { challengeValue } : {}),
  });

/** GET /api/play/upload-url → presigned MinIO PUT + durable publicUrl. */
export const getUploadUrl = (teamId, ext) =>
  request(
    'GET',
    `/api/play/upload-url?teamId=${encodeURIComponent(teamId)}&ext=${encodeURIComponent(ext)}`
  );

/** POST /api/play/submit — quiz answer string, or the MinIO URL of media. */
export const submitAnswer = (teamId, content) =>
  request('POST', '/api/play/submit', { teamId, content });

/**
 * Upload a capture straight to MinIO via the presigned PUT and return its
 * durable public URL (the bucket is public-read, so it renders forever).
 * Same flow as managerFrontend/src/lib/upload.ts.
 */
export async function uploadMedia(teamId, file) {
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
  const pre = await getUploadUrl(teamId, ext);
  const put = await fetch(pre.uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
  });
  if (!put.ok) throw new Error(`MinIO upload failed (${put.status})`);
  return pre.publicUrl;
}
