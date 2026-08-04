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
