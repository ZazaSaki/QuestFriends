You are an expert Backend Engineer building a Node.js + Express REST API for an interactive, real-time location-based quest game. 

TECH STACK:
- Language: Node.js (JavaScript / ES Modules)
- Web Server: Express.js
- Real-time Pub/Sub: Socket.io
- Database: PostgreSQL (running inside Docker)
- ORM: Prisma
- Environment variables: process.env.DATABASE_URL, process.env.PORT, process.env.MINIO_ENDPOINT, process.env.MINIO_ACCESS_KEY, process.env.MINIO_SECRET_KEY

DATABASE SCHEMA:
I have already provided the `prisma/schema.prisma` file containing models for Game, Quest, Track, TrackWaypoint, Room, Team, Submission, etc.

OBJECTIVE:
Build the core foundational backend API focusing on Manager creation, Live Gameplay security, Staff validations, and Real-time WebSockets. Ensure the code is modular (e.g., /src/routes, /src/controllers, /src/sockets).

PLEASE IMPLEMENT THE FOLLOWING CORE MODULES & ROUTES:

1. Setup & Sockets:
   - Include a start script (e.g., `npx prisma db push` then start server).
   - Initialize an Express server wrapped with a Socket.io server.
   - Socket.io should handle joining rooms (`socket.join(roomId)`) so we can broadcast game starts and validations.

2. Manager API:
   - POST /api/games (Include introduction and conclusion JSON blocks)
   - POST /api/quests (Include openChallengeType, openChallengeValue, score, content JSON, and postChallengeContent JSON)
   - POST /api/rooms (Open a room, set optional staffPassword, auto-generate teams linked to tracks)

3. Lobby & Staff API:
   - POST /api/rooms/:roomId/join-player - Assign user to the Team with the fewest members (Round-Robin).
   - POST /api/rooms/:roomId/join-staff - Require the `staffPassword`.
   - PUT /api/teams/swap-member - Move a user between teams.
   - POST /api/rooms/:roomId/start - Update room to PLAYING and emit `game_started` via Socket.io.

4. Gameplay API & Live Location Tracking (ANTI-HACKING & RECOVERY):
   - GET /api/play/current-state - Returns the player's team info, their `currentSeqNum`, and the status of any pending submissions. Used for frontend recovery if the browser refreshes.
   - SOCKET EVENT: `player_location_update` - Receives { userId, teamId, lat, lng }. 
     1. Broadcast this location to the 'staff-room' so managers can track players live.
     2. Get the Team's `currentSeqNum` waypoint from the database.
     3. Use the Haversine formula in JavaScript to calculate the distance (in meters) between the player's live location and the waypoint.
     4. If distance <= waypoint.radius, emit a socket event `at_location` back to the team.
   - GET /api/play/next-coordinate - Returns ONLY the { latitude, longitude, radius, sequenceOrder, openChallengeType } for the team's `currentSeqNum`. DO NOT return the quest content description yet to prevent hacking.
   - POST /api/play/unlock-quest - Accepts { location, challengeValue }. Validates `challengeValue` against `openChallengeValue` (if QR or Password). If valid, returns the full Quest `content` JSON.
   - GET /api/play/upload-url - Generate and return a MinIO (S3-compatible) Presigned URL so the frontend can upload photos/videos directly to storage without passing through the Node.js server.
   - POST /api/play/submit - Team submits { content } (The MinIO file URL or the quiz answer text). Saves as PENDING.

5. Staff Validation API:
   - GET /api/staff/submissions - Get all pending submissions with the team's current quest info.
   - POST /api/staff/submissions/:id/validate - Accepts { status: APPROVED/REJECTED }. If APPROVED:
     1. Add Quest `score` to Team `totalScore`.
     2. Increment Team `currentSeqNum`.
     3. Emit `validation_result` via Socket.io to the Team so they receive the `postChallengeContent` (reward block) or a rejection notice.
