# Scavenger — Backend API

Real-time, location-based quest game backend. Node.js (ESM) + Express + Socket.io + Prisma (PostgreSQL) + MinIO.

## Run

From the repo root (where `docker-compose.yml` lives):

```bash
cp .env_expample .env   # then fill in POSTGRES_* and MINIO_USER / MINIO_PASSWORD
docker compose up --build
```

- API: `http://localhost:9101` (container port 3000)
- MinIO console: `http://localhost:9111`
- On boot the `app` service runs `prisma generate` + `prisma db push`, ensures the MinIO bucket exists, then listens.

Seed a demo scenario (game, quests, track+waypoints, room+team) and print the IDs:

```bash
docker compose exec app npm run seed
```

## Layout

```
prisma/schema.prisma      Data model (Prisma)
prisma/seed.js            Demo data + printed test IDs
src/index.js              Express + Socket.io server bootstrap
src/prisma.js             Prisma client singleton
src/minio.js              MinIO clients (internal admin / external presign)
src/utils/haversine.js    Great-circle distance (meters)
src/utils/team.js         getCurrentWaypoint(teamId) helper
src/sockets/index.js      Socket.io handlers (join_room, player_location_update)
src/routes/*              Express routers
src/controllers/*         Route handlers
```

## MinIO URL policy

The **internal** endpoint (`MINIO_INTERNAL_ENDPOINT`/`MINIO_INTERNAL_PORT`) is used **only** for the backend's own in-Docker-network calls to MinIO (bucket ensure). **Every URL handed to a client — player or manager, including presigned upload URLs — is signed against `MINIO_EXTERNAL_URL`** so the signature matches the host the client actually reaches.

## REST API

Identity is passed explicitly (no auth layer): endpoints take `userId` / `teamId` in the body or query.

### Manager
- `POST /api/games` — `{ title, description?, introduction?, conclusion?, creatorId }`
- `POST /api/quests` — `{ gameId, title, openChallengeType?, openChallengeValue?, score?, content, challengeType?, postChallengeContent? }`
- `POST /api/rooms` — `{ gameId, staffPassword? }` → auto-creates one team per track

### Lobby / Staff
- `POST /api/rooms/:roomId/join-player` — `{ username }` → round-robin into the smallest team
- `POST /api/rooms/:roomId/join-staff` — `{ username, staffPassword }`
- `PUT  /api/teams/swap-member` — `{ userId, fromTeamId, toTeamId }`
- `POST /api/rooms/:roomId/start` — sets `PLAYING`, emits `game_started`

### Gameplay (anti-hack)
- `GET  /api/play/current-state?userId=` — recovery: team, `currentSeqNum`, `activeQuestId`, pending submissions
- `GET  /api/play/next-coordinate?teamId=` — **only** `{ latitude, longitude, radius, sequenceOrder, openChallengeType }`
- `POST /api/play/unlock-quest` — `{ teamId, challengeValue? }` → opens the quest **for the whole team** (emits `quest_unlocked`) and returns full quest `content` if the QR/password check passes. One active quest per team (see below).
- `GET  /api/play/upload-url?teamId=&ext=` — presigned MinIO PUT URL (external host)
- `POST /api/play/submit` — `{ teamId, content }` → approval depends on the quest's `challengeType` (see below)

### Staff validation
- `GET  /api/staff/submissions?roomId=` — PENDING submissions with team + quest info
- `POST /api/staff/submissions/:id/validate` — `{ status: APPROVED|REJECTED, validatorId? }`
  - APPROVED → adds quest score to team, `currentSeqNum++`, emits `validation_result` (with reward block)

## Socket.io events

Client → server:
- `join_room` `{ roomId, teamId?, isStaff? }`
- `player_location_update` `{ userId, teamId, lat, lng }`

Server → client:
- `game_started` (room channel)
- `player_location` (staff channel — live tracking)
- `at_location` (team channel — inside the waypoint radius, via Haversine)
- `quest_unlocked` (team channel — one member unlocked; opens the quest for the whole team)
- `validation_result` (team channel — approve/reject outcome; `auto:true` for auto-graded quizzes)

## Game mechanics

**Team-wide quest sync / one active quest.** Unlocking a quest (QR scan, password, or Open Entry) atomically claims the team's active-quest slot and broadcasts `quest_unlocked` to `team:<id>` so every member's screen opens together. A team can only have **one active quest at a time**: unlocking a *different* quest while one is active returns `409`; re-unlocking the same active quest is idempotent (`alreadyActive: true`). The slot is cleared when the quest is approved (staff or auto), advancing `currentSeqNum`.

**Entry × Approval types.**
- *Entry* is `Quest.openChallengeType`: `QR`/`PASSWORD` require a matching `challengeValue`; `NONE` = Open Entry, starts freely.
- *Approval* is derived from `Quest.challengeType`:
  - `QUIZ` → **automated**. `POST /submit` grades the answer against `content.answer` (string) or `content.answers` (array), trimmed + case-insensitive. Correct → auto-approved, points awarded, team advances. Incorrect → recorded `REJECTED`, quest stays active. **Infinite attempts, no partial state** — nothing per-question is stored, so a reconnecting player restarts the quiz. (A `QUIZ` with no answer key falls back to staff `PENDING`.)
  - `PHOTO`/`VIDEO` → **staff manual**. `POST /submit` saves `PENDING` for staff review.

**Race-safe staff validation.** Approvals use an atomic `updateMany({ where: { id, status: "PENDING" } })` inside a transaction: only the request whose flip returns `count === 1` awards points; concurrent duplicate approvals get `409` and award nothing — **no double points**. The same guard protects auto-graded quiz approval.
