import prisma from "../prisma.js";
import { roomChannel } from "../sockets/index.js";

/**
 * POST /api/rooms
 * Body: { gameId, staffPassword? }
 * Opens a room and auto-generates one Team per Track in the game,
 * each team linked to its track.
 */
export async function createRoom(req, res, next) {
  try {
    const { gameId, staffPassword } = req.body;
    if (!gameId) return res.status(400).json({ error: "gameId is required" });

    const tracks = await prisma.track.findMany({ where: { gameId } });
    if (tracks.length === 0) {
      return res
        .status(400)
        .json({ error: "Game has no tracks; create tracks before opening a room" });
    }

    const room = await prisma.room.create({
      data: {
        gameId,
        staffPassword: staffPassword ?? null,
        teams: {
          create: tracks.map((track) => ({
            trackId: track.id,
            name: track.name,
          })),
        },
      },
      include: { teams: true },
    });

    res.status(201).json(room);
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
