import prisma from "../prisma.js";

/**
 * POST /api/quests
 * Body: {
 *   gameId, title,
 *   openChallengeType?, openChallengeValue?,
 *   score?, content (JSON),
 *   challengeType?, postChallengeContent? (JSON)
 * }
 */
export async function createQuest(req, res, next) {
  try {
    const {
      gameId,
      title,
      openChallengeType,
      openChallengeValue,
      score,
      content,
      challengeType,
      postChallengeContent,
    } = req.body;

    if (!gameId || !title || content === undefined) {
      return res
        .status(400)
        .json({ error: "gameId, title and content are required" });
    }

    const quest = await prisma.quest.create({
      data: {
        gameId,
        title,
        openChallengeType: openChallengeType ?? undefined,
        openChallengeValue: openChallengeValue ?? null,
        score: score ?? undefined,
        content,
        challengeType: challengeType ?? undefined,
        postChallengeContent: postChallengeContent ?? undefined,
      },
    });

    res.status(201).json(quest);
  } catch (err) {
    next(err);
  }
}
