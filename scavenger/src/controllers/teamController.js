import prisma from "../prisma.js";

/**
 * PUT /api/teams/swap-member
 * Body: { userId, fromTeamId, toTeamId }
 * Moves a user's membership from one team to another.
 */
export async function swapMember(req, res, next) {
  try {
    const { userId, fromTeamId, toTeamId } = req.body;
    if (!userId || !fromTeamId || !toTeamId) {
      return res
        .status(400)
        .json({ error: "userId, fromTeamId and toTeamId are required" });
    }
    if (fromTeamId === toTeamId) {
      return res.status(400).json({ error: "fromTeamId and toTeamId are the same" });
    }

    const existing = await prisma.roomPlayer.findUnique({
      where: { userId_teamId: { userId, teamId: fromTeamId } },
    });
    if (!existing) {
      return res
        .status(404)
        .json({ error: "User is not a member of fromTeamId" });
    }

    const membership = await prisma.roomPlayer.update({
      where: { userId_teamId: { userId, teamId: fromTeamId } },
      data: { teamId: toTeamId },
    });

    res.status(200).json(membership);
  } catch (err) {
    next(err);
  }
}
