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