import prisma from "../prisma.js";
import { roomChannel } from "../sockets/index.js";

/** Upper bound on teams per room — a sanity guard, not a game-design limit. */
const MAX_TEAMS = 100;

const ROOM_STATUSES = ["OPEN", "PLAYING", "FINISHED"];

/**
 * POST /api/rooms
 * Body: { gameId, staffPassword?, teamCount? }
 *
 * Opens a room and auto-generates `teamCount` teams, assigning tracks
 * round-robin: team i plays tracks[i % tracks.length]. So when there are more
 * teams than tracks, several teams share a track (they run the same route);
 * when there are fewer, the surplus tracks simply go unused.
 *
 * `teamCount` defaults to one team per track, which is the historical behaviour.
 */
export async function createRoom(req, res, next) {
  try {
    const { gameId, staffPassword, teamCount } = req.body;
    if (!gameId) return res.status(400).json({ error: "gameId is required" });

    const tracks = await prisma.track.findMany({ where: { gameId } });
    if (tracks.length === 0) {
      return res
        .status(400)
        .json({ error: "Game has no tracks; create tracks before opening a room" });
    }

    let count = tracks.length;
    if (teamCount !== undefined && teamCount !== null && teamCount !== "") {
      count = Number(teamCount);
      if (!Number.isInteger(count) || count < 1 || count > MAX_TEAMS) {
        return res
          .status(400)
          .json({ error: `teamCount must be a whole number between 1 and ${MAX_TEAMS}` });
      }
    }

    // Teams sharing a track get a numbered suffix so names stay unique. The
    // first pass keeps the bare track name, matching pre-teamCount rooms.
    const teams = Array.from({ length: count }, (_, i) => {
      const track = tracks[i % tracks.length];
      const pass = Math.floor(i / tracks.length);
      return {
        trackId: track.id,
        name: pass === 0 ? track.name : `${track.name} (${pass + 1})`,
      };
    });

    const room = await prisma.room.create({
      data: {
        gameId,
        staffPassword: staffPassword ?? null,
        teams: { create: teams },
      },
      include: { teams: true },
    });

    res.status(201).json(room);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/rooms/:roomId
 * Live roster: the room with its teams, each team's members (username), and
 * progression fields. Used by the dashboard's Game Roster panel.
 */
export async function getRoom(req, res, next) {
  try {
    const { roomId } = req.params;

    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        teams: {
          include: {
            track: {
              select: {
                id: true,
                name: true,
                waypoints: {
                  select: {
                    sequenceOrder: true,
                    questId: true,
                    quest: { select: { id: true, title: true } },
                  },
                  orderBy: { sequenceOrder: "asc" },
                },
              },
            },
            members: { include: { user: { select: { id: true, username: true } } } },
          },
        },
      },
    });

    if (!room) return res.status(404).json({ error: "Room not found" });
    res.status(200).json(room);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/rooms/:roomId/join-player
 * Body: { username }
 * Upserts the user and assigns them (round-robin) to the team in this room
 * with the fewest members.
 */
export async function joinPlayer(req, res, next) {
  try {
    const { roomId } = req.params;
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: "username is required" });

    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) return res.status(404).json({ error: "Room not found" });

    // Upsert the player (role FOLLOWER by default).
    const user = await prisma.user.upsert({
      where: { username },
      update: {},
      create: { username, role: "FOLLOWER" },
    });

    // Round-robin: team with the fewest members wins.
    const teams = await prisma.team.findMany({
      where: { roomId },
      include: { _count: { select: { members: true } } },
    });
    if (teams.length === 0) {
      return res.status(400).json({ error: "Room has no teams" });
    }

    teams.sort((a, b) => a._count.members - b._count.members);
    const target = teams[0];

    const membership = await prisma.roomPlayer.upsert({
      where: { userId_teamId: { userId: user.id, teamId: target.id } },
      update: {},
      create: { userId: user.id, teamId: target.id },
    });

    res.status(201).json({
      user,
      team: { id: target.id, name: target.name, trackId: target.trackId },
      membership,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/rooms/:roomId/join-staff
 * Body: { username, staffPassword }
 * Requires the room's staffPassword. Upserts the user as STAFF.
 */
export async function joinStaff(req, res, next) {
  try {
    const { roomId } = req.params;
    const { username, staffPassword } = req.body;
    if (!username) return res.status(400).json({ error: "username is required" });

    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) return res.status(404).json({ error: "Room not found" });

    if (room.staffPassword && room.staffPassword !== staffPassword) {
      return res.status(403).json({ error: "Invalid staff password" });
    }

    const user = await prisma.user.upsert({
      where: { username },
      update: { role: "STAFF" },
      create: { username, role: "STAFF" },
    });

    res.status(200).json({ user, roomId });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/rooms/:roomId/start
 * Sets the room to PLAYING and emits `game_started` to the room channel.
 */
export async function startRoom(req, res, next) {
  try {
    const { roomId } = req.params;

    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) return res.status(404).json({ error: "Room not found" });

    const updated = await prisma.room.update({
      where: { id: roomId },
      data: { status: "PLAYING" },
    });

    const io = req.app.get("io");
    io.to(roomChannel(roomId)).emit("game_started", {
      roomId,
      status: updated.status,
      at: Date.now(),
    });

    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/rooms/:roomId/end
 * Closes the room for good: status → FINISHED and every connected client is
 * told the host ended it. `reason: "ended"` matches what the player app
 * already distinguishes from a janitor-driven close.
 */
export async function endRoom(req, res, next) {
  try {
    const { roomId } = req.params;

    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) return res.status(404).json({ error: "Room not found" });

    const updated = await prisma.room.update({
      where: { id: roomId },
      data: { status: "FINISHED" },
    });

    const io = req.app.get("io");
    io.to(roomChannel(roomId)).emit("room_closed", {
      roomId,
      reason: "ended",
      status: updated.status,
      at: Date.now(),
    });

    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/rooms?status=OPEN&gameId=<id>
 * List rooms, optionally filtered by status and/or game (for the Manager
 * dashboard).
 */
export async function listRooms(req, res, next) {
  try {
    const { status, gameId } = req.query;
    if (status && !ROOM_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of ${ROOM_STATUSES.join(", ")}` });
    }
    const rooms = await prisma.room.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(gameId ? { gameId: String(gameId) } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { teams: true } } },
    });

    res.status(200).json(
      rooms.map((r) => ({
        id: r.id,
        gameId: r.gameId,
        status: r.status,
        createdAt: r.createdAt,
        teamCount: r._count.teams,
      }))
    );
  } catch (err) {
    next(err);
  }
}
