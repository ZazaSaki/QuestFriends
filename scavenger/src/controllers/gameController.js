import prisma from "../prisma.js";

/**
 * POST /api/games
 * Body: { title, description?, introduction?, conclusion?, creatorId }
 * introduction / conclusion are JSON blocks (text, media).
 */
export async function createGame(req, res, next) {
  try {
    const { title, description, introduction, conclusion, creatorId } = req.body;

    if (!title || !creatorId) {
      return res.status(400).json({ error: "title and creatorId are required" });
    }

    const game = await prisma.game.create({
      data: {
        title,
        description: description ?? null,
        introduction: introduction ?? undefined,
        conclusion: conclusion ?? undefined,
        creatorId,
      },
    });

    res.status(201).json(game);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/games/:gameId
 * A single game with its quests and tracks (each track with its waypoints,
 * and each waypoint's quest title) — used by the Quest Builder to load a
 * game for editing.
 */
export async function getGame(req, res, next) {
  try {
    const { gameId } = req.params;

    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        quests: true,
        tracks: {
          include: {
            waypoints: {
              include: { quest: { select: { id: true, title: true } } },
              orderBy: { sequenceOrder: "asc" },
            },
          },
        },
      },
    });

    if (!game) return res.status(404).json({ error: "Game not found" });
    res.status(200).json(game);
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/games/:gameId
 * Body: { title, introduction?, conclusion?, quests[], tracks[] }
 *
 * Replaces the game's quests and tracks wholesale — the Quest Builder always
 * sends the complete graph, so incremental diffing would buy nothing. Waypoints
 * reference quests positionally via `questIndex` into the quests array, since
 * the client has no ids for quests it is about to create.
 *
 * Refused while any room exists: a room's teams are pinned to tracks
 * (Team.trackId has no cascade), and re-creating tracks would strand teams
 * mid-game. Delete the rooms first, or delete the whole game.
 */
export async function updateGame(req, res, next) {
  try {
    const { gameId } = req.params;
    const { title, introduction, conclusion, quests = [], tracks = [] } = req.body;

    if (!title) return res.status(400).json({ error: "title is required" });

    const existing = await prisma.game.findUnique({ where: { id: gameId } });
    if (!existing) return res.status(404).json({ error: "Game not found" });

    const roomCount = await prisma.room.count({ where: { gameId } });
    if (roomCount > 0) {
      return res.status(409).json({
        error:
          `This game has ${roomCount} room(s). Delete them before editing its ` +
          `quests or tracks, otherwise teams already playing would lose their track.`,
      });
    }

    // Reject half-placed waypoints up front so a partial graph never lands.
    for (const [ti, track] of tracks.entries()) {
      for (const w of track.waypoints ?? []) {
        if (!Number.isFinite(w.latitude) || !Number.isFinite(w.longitude)) {
          return res.status(400).json({
            error: `Track "${track.name ?? ti + 1}" has a waypoint without valid coordinates`,
          });
        }
        if (!quests[w.questIndex]) {
          return res.status(400).json({
            error: `Track "${track.name ?? ti + 1}" references quest #${w.questIndex}, which does not exist`,
          });
        }
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.game.update({
        where: { id: gameId },
        data: {
          title,
          introduction: introduction ?? undefined,
          conclusion: conclusion ?? undefined,
        },
      });

      // Waypoints cascade from both quests and tracks, so these two clear them.
      await tx.quest.deleteMany({ where: { gameId } });
      await tx.track.deleteMany({ where: { gameId } });

      const questIds = [];
      for (const q of quests) {
        const created = await tx.quest.create({
          data: {
            gameId,
            title: q.title ?? "Untitled Quest",
            score: typeof q.score === "number" ? q.score : 10,
            openChallengeType: q.openChallengeType ?? "NONE",
            openChallengeValue: q.openChallengeValue ?? null,
            challengeType: q.challengeType ?? "QUIZ",
            content: q.content ?? {},
            postChallengeContent: q.postChallengeContent ?? undefined,
          },
        });
        questIds.push(created.id);
      }

      for (const [ti, track] of tracks.entries()) {
        await tx.track.create({
          data: {
            gameId,
            name: track.name ?? `Track ${ti + 1}`,
            waypoints: {
              create: (track.waypoints ?? []).map((w) => ({
                questId: questIds[w.questIndex],
                sequenceOrder: w.sequenceOrder,
                latitude: w.latitude,
                longitude: w.longitude,
                radius: w.radius ?? 20,
              })),
            },
          },
        });
      }
    });

    // Same shape as GET /api/games/:gameId — the builder reloads from this.
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        quests: true,
        tracks: {
          include: {
            waypoints: {
              include: { quest: { select: { id: true, title: true } } },
              orderBy: { sequenceOrder: "asc" },
            },
          },
        },
      },
    });

    res.status(200).json(game);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/games/:gameId
 * Removes the game with its rooms, quests and tracks.
 *
 * Rooms go first and explicitly: their teams reference tracks without a
 * cascade, so letting the Game cascade fire on both at once can trip the
 * Team → Track foreign key depending on delete ordering.
 */
export async function deleteGame(req, res, next) {
  try {
    const { gameId } = req.params;

    const existing = await prisma.game.findUnique({ where: { id: gameId } });
    if (!existing) return res.status(404).json({ error: "Game not found" });

    await prisma.$transaction(async (tx) => {
      // Cascades to teams → room players & submissions.
      await tx.room.deleteMany({ where: { gameId } });
      // Cascades to quests, tracks and their waypoints.
      await tx.game.delete({ where: { id: gameId } });
    });

    res.status(200).json({ id: gameId, deleted: true });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/games
 * List all games with quest/track/room counts (for the Manager dashboard).
 */
export async function listGames(req, res, next) {
  try {
    const games = await prisma.game.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { quests: true, tracks: true, rooms: true } },
      },
    });

    res.status(200).json(
      games.map((g) => ({
        id: g.id,
        title: g.title,
        description: g.description,
        createdAt: g.createdAt,
        questCount: g._count.quests,
        trackCount: g._count.tracks,
        roomCount: g._count.rooms,
      }))
    );
  } catch (err) {
    next(err);
  }
}