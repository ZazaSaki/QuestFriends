# REST API reference

Base URL (local): **`http://localhost:9101`**. All bodies and responses are JSON.

**Identity model:** there is no authentication layer. Endpoints that act on
behalf of someone take `userId` / `teamId` / `validatorId` **explicitly** in the
body or query string. IDs are UUID strings returned when you create resources.

**Errors:** failures return an appropriate status (`400/403/404/409/500`) with
`{ "error": "message" }`.

---

## Health

### `GET /health`
→ `200 { "ok": true }`

---

## Users

### `POST /api/users`
Upsert a user by username (used to create a MANAGER so games can be authored).
```json
{ "username": "alice", "role": "MANAGER" }   // role: MANAGER | STAFF | FOLLOWER (optional)
```
→ `201 { "id", "username", "role", "createdAt" }`

---

## Manager: games, quests, tracks

### `POST /api/games`
```json
{
  "title": "Downtown Hunt",
  "description": "optional",
  "introduction": { "text": "Welcome!" },   // optional JSON block
  "conclusion":   { "text": "You won!" },    // optional JSON block
  "creatorId": "<userId of a MANAGER>"
}
```
→ `201 { "id", "title", "introduction", "conclusion", "creatorId", ... }`

### `POST /api/quests`
```json
{
  "gameId": "<gameId>",
  "title": "The Old Fountain",
  "score": 10,
  "openChallengeType": "QR",          // entry: NONE | PASSWORD | QR  (default NONE)
  "openChallengeValue": "QR-ABC123",  // required if PASSWORD/QR
  "challengeType": "PHOTO",           // approval: QUIZ | PHOTO | VIDEO (default QUIZ)
  "content": { "description": "Snap the fountain", "answer": "1901" },  // JSON; `answer` used for QUIZ auto-grade
  "postChallengeContent": { "reward": "Built in 1901" }                 // JSON reward (optional)
}
```
→ `201 { "id", ... }`  · `content` is required.

### `POST /api/tracks`
Create a route, optionally with its waypoints inline.
```json
{
  "gameId": "<gameId>",
  "name": "Blue Route",
  "waypoints": [
    { "questId": "<questId>", "sequenceOrder": 1, "latitude": 40.4168, "longitude": -3.7038, "radius": 20 }
  ]
}
```
→ `201 { "id", "name", "waypoints": [...] }`

### `POST /api/tracks/:trackId/waypoints`
Append waypoints to an existing track (attach quests to a route after it exists).
```json
{ "waypoints": [ { "questId": "<id>", "sequenceOrder": 1, "latitude": 40.41, "longitude": -3.70, "radius": 20 } ] }
```
→ `201 [ { waypoint }, ... ]`

---

## Rooms & lobby

### `POST /api/rooms`
Open a room; **auto-creates one Team per Track** in the game.
```json
{ "gameId": "<gameId>", "staffPassword": "staff123" }   // staffPassword optional
```
→ `201 { "id", "status": "OPEN", "teams": [ { "id", "name", "trackId" }, ... ] }`

### `GET /api/rooms?status=OPEN`
List rooms, optionally filtered by `status` (`OPEN` | `PLAYING` | `FINISHED`). Used by players to discover joinable rooms.
→ `200 [ { "id", "gameId", "status", "createdAt", "teamCount" } ]`  ·  invalid status → `400`

### `GET /api/rooms/:roomId`
Live roster.
→ `200 { "id", "status", "teams": [ { "id", "name", "trackId", "currentSeqNum", "totalScore", "activeQuestId", "track": {...}, "members": [ { "user": { "id", "username" } } ] } ] }`

### `POST /api/rooms/:roomId/join-player`
Assign a user to the team with the **fewest members** (round-robin).
```json
{ "username": "bob" }
```
→ `201 { "user": {...}, "team": { "id", "name", "trackId" }, "membership": {...} }`

### `POST /api/rooms/:roomId/join-staff`
Requires the room's `staffPassword` (if set). Upserts the user as STAFF.
```json
{ "username": "carol", "staffPassword": "staff123" }
```
→ `200 { "user": {...}, "roomId" }`  ·  wrong password → `403`

### `POST /api/rooms/:roomId/start`
Sets the room to `PLAYING` and emits `game_started` (see [websocket-events.md](websocket-events.md)).
→ `200 { "id", "status": "PLAYING" }`

### `POST /api/rooms/:roomId/end`
Force-ends ("kills") a room: sets status `FINISHED` and emits `room_closed`
(`reason: "ended"`) to everyone in the room. The row is kept (soft end).
→ `200 { "id", "status": "FINISHED" }`

> **Automatic cleanup.** A background janitor also closes rooms: **empty** rooms
> (nobody ever joined) are **deleted** after ~10 min, and rooms older than 3h are
> **pinged** (`room_ping`) — if nobody answers they're ended. Both emit
> `room_closed`. Tunable via env (`ROOM_GC_*`, `ROOM_MAX_AGE_HOURS`, …); disable
> with `ROOM_GC_ENABLED=false`.

### `PUT /api/teams/swap-member`
Move a user between teams.
```json
{ "userId": "<id>", "fromTeamId": "<id>", "toTeamId": "<id>" }
```
→ `200 { membership }`

---

## Gameplay (`/api/play`)

### `GET /api/play/current-state?userId=<userId>`
Recovery after a refresh: the player's team, progress, and pending submissions.
→ `200`
```json
{
  "team": { "id", "name", "roomId", "trackId", "totalScore", "currentSeqNum", "activeQuestId" },
  "currentSeqNum": 1,
  "activeQuestId": null,
  "pendingSubmissions": [ { "id", "questId", "content", "status", "createdAt" } ]
}
```

### `GET /api/play/next-coordinate?teamId=<teamId>`
**Anti-cheat:** returns only the geo target + entry type for the team's current waypoint — **not** the quest content.
→ `200 { "latitude", "longitude", "radius", "sequenceOrder", "openChallengeType" }`
→ `200 { "finished": true }` when the track is complete.

### `POST /api/play/unlock-quest`
Opens the current quest **for the whole team** (emits `quest_unlocked`) and returns its full `content`. Enforces one active quest per team.
```json
{ "teamId": "<teamId>", "challengeValue": "QR-ABC123" }   // challengeValue required for QR/PASSWORD entry
```
→ `200 { "questId", "title", "challengeType", "content" }`
→ `200 { ..., "alreadyActive": true }` if the quest was already open (idempotent).
→ `403` invalid `challengeValue` · `409` a different quest is already active.

### `GET /api/play/upload-url?teamId=<teamId>&ext=<ext>`
Presigned MinIO URLs for a direct client upload. See [media-and-minio.md](media-and-minio.md).
→ `200 { "uploadUrl", "getUrl", "objectName", "bucket", "method": "PUT", "expiresIn": 600 }`

### `POST /api/play/submit`
Submit the current quest's answer/media.
```json
{ "teamId": "<teamId>", "content": "<MinIO URL for photo/video, or quiz answer text>" }
```
- **QUIZ** quest → graded instantly. `201 { "result": "CORRECT", ... }` (auto-approved) or `200 { "result": "INCORRECT", ... }` (retry). See auto-approve below.
- **PHOTO/VIDEO** quest → `201 { submission with status "PENDING" }` and emits `submission_pending` to staff.

---

## Staff validation (`/api/staff`)

### `GET /api/staff/submissions?roomId=<roomId>`
All `PENDING` submissions (optionally scoped to a room), with team + quest info.
→ `200 [ { "id", "teamId", "questId", "content", "status", "createdAt", "team": {...}, "quest": {...} } ]`

### `POST /api/staff/submissions/:id/validate`
```json
{ "status": "APPROVED", "validatorId": "<staff userId>" }   // status: APPROVED | REJECTED
```
- **APPROVED** → adds `quest.score` to `team.totalScore`, advances `currentSeqNum`, clears `activeQuestId`, emits `validation_result` (with the reward) to the team. `200`.
- **REJECTED** → emits `validation_result` (retry) to the team; quest stays active. `200`.
- Already handled by another staff member → `409` (no double-award; see [frontend-guide.md](frontend-guide.md#concurrency--safety)).

---

See also: **[websocket-events.md](websocket-events.md)** for the realtime events these endpoints emit, and **[frontend-guide.md](frontend-guide.md)** for the end-to-end flow.
