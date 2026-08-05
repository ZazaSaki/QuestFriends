import prisma from "../prisma.js";

/**
 * GET /api/games
 * List games (newest first) with quest/track/room counts. Used by the manager
 * dashboard.
 */
export async function listGames(req, res, next) {
  try {
    const games = await prisma.game.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { quests: true, tracks: true, rooms: true } } },
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

/**
 * GET /api/games/:gameId
 * Full game detail for the Quest Builder: game + quests + tracks (with their
 * waypoints). Returns 404 if the game does not exist.
 */
export async function getGame(req, res, next) {
  try {
    const { gameId } = req.params;
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        quests: true,
        tracks: {
          include: { waypoints: { orderBy: { sequenceOrder: "asc" } } },
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
 * In-place update of a game's authoring content. Body:
 *   { title?, description?, introduction?, conclusion?,
 *     quests: [{ title, score?, openChallengeType?, openChallengeValue?,
 *                challengeType?, content, postChallengeContent? }],
 *     tracks: [{ name, waypoints: [{ questIndex, sequenceOrder, latitude,
 *                longitude, radius? }] }] }
 *
 * Quests are replaced (their old waypoints/submissions cascade away); tracks are
 * reconciled by index — updated or added but NEVER deleted — so any Team that
 * references a track stays valid (no schema change / no data loss for teams).
 */
export async function updateGame(req, res, next) {
  try {
    const { gameId } = req.params;
    const { title, description, introduction, conclusion, quests = [], tracks = [] } = req.body;

    const game = await prisma.game.findUnique({ where: { id: gameId } });
    if (!game) return res.status(404).json({ error: "Game not found" });

    await prisma.$transaction(async (tx) => {
      await tx.game.update({
        where: { id: gameId },
        data: {
          title: title ?? game.title,
          description: description ?? undefined,
          introduction: introduction ?? undefined,
          conclusion: conclusion ?? undefined,
        },
      });

      // Replace quests (cascades their waypoints + submissions). Tracks stay.
      await tx.quest.deleteMany({ where: { gameId } });
      const questIds = [];
      for (const q of quests) {
        const created = await tx.quest.create({
          data: {
            gameId,
            title: q.title,
            score: q.score ?? undefined,
            openChallengeType: q.openChallengeType ?? undefined,
            openChallengeValue: q.openChallengeValue ?? null,
            challengeType: q.challengeType ?? undefined,
            content: q.content,
            postChallengeContent: q.postChallengeContent ?? undefined,
          },
        });
        questIds.push(created.id);
      }

      // Reconcile tracks by index — reuse existing (preserves teams), add new.
      const existing = await tx.track.findMany({ where: { gameId }, orderBy: { id: "asc" } });
      for (let i = 0; i < tracks.length; i++) {
        let trackId;
        if (existing[i]) {
          trackId = existing[i].id;
          await tx.track.update({ where: { id: trackId }, data: { name: tracks[i].name ?? existing[i].name } });
          await tx.trackWaypoint.deleteMany({ where: { trackId } }); // safety (already cascaded via quests)
        } else {
          const t = await tx.track.create({ data: { gameId, name: tracks[i].name ?? `Track ${i + 1}` } });
          trackId = t.id;
        }
        const wps = (tracks[i].waypoints ?? [])
          .filter((w) => questIds[w.questIndex] !== undefined)
          .map((w) => ({
            trackId,
            questId: questIds[w.questIndex],
            sequenceOrder: w.sequenceOrder,
            latitude: w.latitude,
            longitude: w.longitude,
            radius: w.radius ?? undefined,
          }));
        if (wps.length) await tx.trackWaypoint.createMany({ data: wps });
      }
      // Tracks the new payload no longer covers: keep the row, clear waypoints.
      for (let i = tracks.length; i < existing.length; i++) {
        await tx.trackWaypoint.deleteMany({ where: { trackId: existing[i].id } });
      }
    });

    const updated = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        quests: true,
        tracks: { include: { waypoints: { orderBy: { sequenceOrder: "asc" } } } },
      },
    });
    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/games/:gameId
 * Removes a game and everything under it. Rooms are deleted first (which
 * cascades their teams) so the Team→Track relation can't block the track
 * cascade; then the game is deleted (cascades quests, tracks, waypoints).
 */
export async function deleteGame(req, res, next) {
  try {
    const { gameId } = req.params;
    const game = await prisma.game.findUnique({ where: { id: gameId } });
    if (!game) return res.status(404).json({ error: "Game not found" });

    await prisma.$transaction([
      prisma.room.deleteMany({ where: { gameId } }),
      prisma.game.delete({ where: { id: gameId } }),
    ]);

    res.status(200).json({ id: gameId, deleted: true });
  } catch (err) {
    next(err);
  }
}

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
