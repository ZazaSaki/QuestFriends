# Player Frontend

Mobile-first React (Vite) app for players: join a room, hunt waypoints by GPS,
unlock quests with a QR/passcode, read the mission, and submit a quiz answer or a
photo/video. Built from the Google Stitch designs in
[`baseline/stitch_quest_expedition_ui/`](baseline/stitch_quest_expedition_ui) —
those HTML files stay in the repo as the visual reference.

Runs on **http://localhost:9103**.

## Run it

```bash
# In Docker, alongside the rest of the stack
docker compose up -d player          # → http://localhost:9103

# Locally, against the host-mapped backend (vite proxies /api, /socket.io, /scavenger)
cd player && npm install && npm run dev
```

## Joining a room

Rooms are identified by their UUID (`391ee1a1-7478-45c1-8ca7-776a71cd36fd`), and
`Room.id` is a case-sensitive String column — so the join field keeps whatever is
entered, verbatim: no truncation, no upper-casing. (The Stitch mock drew a 6-character
code box; that shape cannot address a real room.)

Three ways in, in order of how pleasant they are on a phone:

1. **A join link** — `http://<host>:9103/?room=<roomId>` prefills the field.
2. **The room QR** — scan it on the join screen. It accepts a bare UUID or a full
   join link.
3. **Typing/pasting the UUID** — the fallback.

The same rule applies to a quest's entry passcode in `QuestAccess`: the backend
compares `challengeValue !== quest.openChallengeValue` exactly, so whatever the
player types is sent unmodified.

## How it talks to the backend

Same-origin by default: the app calls `/api`, `/socket.io` and `/scavenger` on its
own host, and this container's nginx reverse-proxies them to the backend
(`10.5.0.10:3000`) and MinIO (`10.5.0.15:9000`). No CORS, no mixed content, and it
tunnels cleanly through a single Cloudflare hostname.

`VITE_API_URL` / `VITE_SOCKET_URL` override that with an absolute origin. **Vite
inlines `VITE_*` at build time**, so they are `build.args` in `docker-compose.yml`,
not runtime env — changing them requires `docker compose build player`.

The REST + Socket.io contract is documented in
[`scavenger/docs`](../scavenger/docs): `api-reference.md`, `websocket-events.md`,
`frontend-guide.md`.

### ⚠️ Media uploads need a phone-reachable `MINIO_URL`

`GET /api/play/upload-url` returns a **presigned absolute URL** built from
`MINIO_URL` in the root `.env`. It is currently:

```
MINIO_URL=http://localhost:9110
```

`localhost` on a player's phone is the phone itself, so photo/video submissions
will fail from any real device. Set it to an address the phone can reach before a
live game — the LAN IP of the host, or the public domain:

```
MINIO_URL=http://192.168.1.50:9110      # LAN testing
MINIO_URL=https://quest.example.com     # behind the tunnel
```

Everything else (REST, sockets, quest media) already works from a phone, because
it is same-origin through this container.

## Layout

```
src/
  App.jsx                     state machine + all backend I/O
  components/
    Layout.jsx                TopAppBar + canvas + floating pill nav
    BottomNav.jsx             the "Floating Pill" (mission / compass / leaderboard)
    InformationBlockRenderer.jsx  authored content blocks → text / image / audio / video
    ChallengeBlocks.jsx       quiz challenge
    MissionCamera.jsx         media capture + upload
    QrScanner.jsx             html5-qrcode viewfinder (lazy-loaded)
  screens/                    WaitingRoom · MissionScreen · QuestAccess · GameConclusion
  overlays/                   CompassOverlay · LeaderboardOverlay
  hooks/                      useGeolocation · useDeviceOrientation
  lib/                        api · socket · session · geo
```

### State

```
phase              JOIN → LOBBY → PLAYING → CONCLUSION
currentQuestState  LOCKED → ACCESS → ACTIVE → SUBMITTED → REWARD → (LOCKED)
```

`LOCKED` holds only the waypoint's coordinates — the backend deliberately withholds
quest content until `unlock-quest`, so the description cannot be read ahead.

### Content blocks

Quests, rewards and the game conclusion are authored in the manager as
`{ blocks: [{ type: 'Text' | 'Image' | 'Video' | 'Audio', content: string }] }`.
`InformationBlockRenderer` renders each type (audio and video as native
`<audio controls>` / `<video controls>`), tolerates the older flat shape
(`{ description }`, `{ image }`, …), and **drops a leading `Image` block** so
mission descriptions open on their text rather than a hero image.

## Design system

Tailwind v3 with the Stitch token config copied verbatim into `tailwind.config.js`
(`px-container-margin`, `text-headline-xl`, `font-body-md`, the full Material colour
map). Per-screen CSS from the Stitch `<style>` blocks lives in `src/index.css`,
each rule paired with its counterpart from the `*_dark` screens.

**Dark mode follows the phone's system setting** (`darkMode: 'media'`) — there is no
toggle, matching the designs. Fonts (Playfair Display, Inter, Material Symbols) load
from Google Fonts in `index.html`.

## Sensors

- `useGeolocation` — `watchPosition` with `enableHighAccuracy: true`. Active only
  while hunting a waypoint or with the compass open; released once a quest is open.
- `useDeviceOrientation` — compass heading, with the iOS 13+ `requestPermission()`
  gate exposed as an "Enable Compass" button.
- The compass arrow points at the **waypoint** (`bearing − heading`), not at north.
- Each fix emits `player_location_update` so staff see the team live; arrival is
  driven by the server's `at_location` event, with a local Haversine check as backup.
