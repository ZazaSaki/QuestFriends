# WebSocket events (Socket.io)

The backend runs a **Socket.io** server on the same origin as the REST API
(`http://localhost:9101`). Real-time updates — game start, geofence hits, quest
reveals, submissions, and validations — flow over sockets.

## Connecting

The server auto-serves the client library at `/socket.io/socket.io.js`, or use
the `socket.io-client` npm package.

```js
import { io } from "socket.io-client";           // or load /socket.io/socket.io.js in the browser
const socket = io("http://localhost:9101", { transports: ["websocket"] });

socket.on("connect", () => {
  socket.emit("join_room", { roomId, teamId, isStaff: false });
});
```

## Channels (rooms)

A socket subscribes by emitting `join_room`. There are three channel kinds:

| Channel | Who joins | Receives |
|---------|-----------|----------|
| `room:<roomId>`  | everyone (`roomId`)            | `game_started`, `room_ping`, `room_closed` |
| `team:<teamId>`  | players (`teamId`)            | `quest_unlocked`, `at_location`, `validation_result` |
| `staff:<roomId>` | staff (`isStaff: true`)      | `player_location`, `submission_pending` |

`join_room` may be emitted more than once (e.g. to join multiple team channels).

---

## Client → server

### `join_room`
Subscribe this socket to the relevant channels.
```js
socket.emit("join_room", { roomId, teamId, isStaff });
// roomId → room channel; teamId → that team's channel; isStaff:true → staff channel
```
Server replies once with `joined`: `{ roomId, teamId, isStaff }`.

### `player_location_update`
A player's live GPS ping. Broadcast to staff for tracking; if within the current
waypoint's `radius` (Haversine), the team receives `at_location`.
```js
socket.emit("player_location_update", { userId, teamId, lat, lng });
```

---

## Server → client

### `joined`  *(to the emitting socket)*
Ack of `join_room`. `{ roomId, teamId, isStaff }`

### `game_started`  *(room channel)*
The manager started the room.
```json
{ "roomId": "...", "status": "PLAYING", "at": 1712345678000 }
```

### `room_ping`  *(room channel — must be acknowledged)*
A liveness probe from the room janitor for long-lived rooms. **Reply via the ack
callback** or the room may be considered abandoned and closed.
```js
socket.on("room_ping", (data, ack) => ack && ack({ alive: true }));
```

### `room_closed`  *(room channel)*
The room was ended/killed — stop the game and show a notice. `reason` is one of
`ended` (manual kill), `empty_timeout` (deleted, nobody joined), or `abandoned`
(no reply to `room_ping` after 3h).
```json
{ "roomId": "...", "reason": "ended", "status": "FINISHED", "at": 1712345678000 }
```

### `player_location`  *(staff channel)*
Live player position for staff dashboards.
```json
{ "userId": "...", "teamId": "...", "lat": 40.4168, "lng": -3.7038, "at": 1712345678000 }
```

### `at_location`  *(team channel)*
The player is inside the current waypoint's activation radius.
```json
{ "teamId": "...", "sequenceOrder": 1, "distance": 8.3, "openChallengeType": "QR" }
```

### `quest_unlocked`  *(team channel)*
A teammate opened the current quest — the quest is now active for the whole team.
Carries the full quest `content` so every member's UI can render it together.
```json
{ "teamId": "...", "questId": "...", "title": "...", "challengeType": "PHOTO", "sequenceOrder": 1, "content": { ... } }
```

### `submission_pending`  *(staff channel)*
A team submitted a photo/video awaiting review. `content` is the MinIO URL — render it directly.
```json
{ "submissionId": "...", "teamId": "...", "teamName": "...", "questId": "...", "questTitle": "...", "challengeType": "PHOTO", "content": "http://localhost:9110/scavenger/...", "createdAt": "..." }
```

### `validation_result`  *(team channel)*
Outcome of a submission — from staff **or** from an auto-graded quiz (`auto: true`).
```json
// APPROVED
{ "status": "APPROVED", "teamId": "...", "questId": "...", "awardedScore": 10,
  "totalScore": 30, "currentSeqNum": 2, "postChallengeContent": { "reward": "..." },
  "submissionId": "...", "auto": false }

// REJECTED
{ "status": "REJECTED", "teamId": "...", "questId": "...", "message": "…try again", "auto": false }
```
On **APPROVED**, render `postChallengeContent` (the reward), then reset to LOCKED and
fetch the next coordinate. See [frontend-guide.md](frontend-guide.md#the-game-loop).

---

## Typical listener setup (player UI)

```js
socket.on("quest_unlocked", (p)      => showQuest(p.content));      // whole team
socket.on("at_location", (p)         => flash("You're here!"));
socket.on("validation_result", (p) => {
  if (p.status === "APPROVED") { showReward(p.postChallengeContent); nextQuest(); }
  else                         { showRetry(p.message); }
});
```

See **[frontend-guide.md](frontend-guide.md)** for how these events fit the full game loop, and **[media-and-minio.md](media-and-minio.md)** for rendering the media in `content` / `submission_pending`.
