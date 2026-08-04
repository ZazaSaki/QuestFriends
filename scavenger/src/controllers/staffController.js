import prisma from "../prisma.js";
import { teamChannel } from "../sockets/index.js";

/**
 * GET /api/staff/submissions?roomId=
 * Lists PENDING submissions (optionally scoped to a room) with team +
 * quest info so staff can review them.
 */
export async function listPendingSubmissions(req, res, next) {
  try {
    const { roomId } = req.query;

    const submissions = await prisma.submission.findMany({
      where: {
        status: "PENDING",
        ...(roomId ? { team: { roomId: String(roomId) } } : {}),
      },
      include: {
        team: true,
        quest: true,
      },
      orderBy: { createdAt: "asc" },
    });

    res.status(200).json(submissions);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/staff/submissions/:id/validate
 * Body: { status: "APPROVED" | "REJECTED", validatorId? }
 * On APPROVED: add the quest score to the team's totalScore, advance
 * currentSeqNum, and emit `validation_result` to the team with the reward
 * block. On REJECTED: emit a rejection notice.
 */
export async function validateSubmission(req, res, next) {
  try {
    const { id } = req.params;
    const { status, validatorId } = req.body;

    if (status !== "APPROVED" && status !== "REJECTED") {
      return res
        .status(400)
        .json({ error: "status must be APPROVED or REJECTED" });
    }

    // Read for the payload (score / teamId). The atomic updateMany below — NOT
    // this read — is the sole source of truth for who wins the validation.
    const submission = await prisma.submission.findUnique({
      where: { id },
      include: { quest: true, team: true },
    });
    if (!submission) {
      return res.status(404).json({ error: "Submission not found" });
    }

    const io = req.app.get("io");

    if (status === "APPROVED") {
      // Two atomic guards, both inside one transaction, so points are awarded
      // AT MOST once no matter how the request is duplicated:
      //   1. submission PENDING → APPROVED  — stops the SAME submission being
      //      approved twice (two staff, same id).
      //   2. team award conditional on activeQuestId === this quest — stops a
      //      DIFFERENT stale PENDING submission for the same quest awarding
      //      again after the team has already advanced.
      // If either guard fails we throw to roll back the whole transaction.
      let outcome;
      try {
        outcome = await prisma.$transaction(async (tx) => {
          const claim = await tx.submission.updateMany({
            where: { id, status: "PENDING" },
            data: { status: "APPROVED", validatorId: validatorId ?? null },
          });
          if (claim.count === 0) {
            const e = new Error("ALREADY_PROCESSED");
            e.code = "ALREADY_PROCESSED";
            throw e;
          }

          const award = await tx.team.updateMany({
            where: { id: submission.teamId, activeQuestId: submission.questId },
            data: {
              totalScore: { increment: submission.quest.score },
              currentSeqNum: { increment: 1 },
              activeQuestId: null,
            },
          });
          if (award.count === 0) {
            // Quest is no longer the team's active quest (already advanced).
            const e = new Error("QUEST_NOT_ACTIVE");
            e.code = "QUEST_NOT_ACTIVE";
            throw e;
          }

          const team = await tx.team.findUnique({ where: { id: submission.teamId } });
          return { team };
        });
      } catch (e) {
        if (e.code === "ALREADY_PROCESSED" || e.code === "QUEST_NOT_ACTIVE") {
          // Roll back leaves the submission PENDING; no points awarded.
          return res
            .status(409)
            .json({ error: "Submission already processed", awarded: false });
        }
        throw e;
      }

      io.to(teamChannel(submission.teamId)).emit("validation_result", {
        submissionId: id,
        status: "APPROVED",
        teamId: submission.teamId,
        questId: submission.questId,
        awardedScore: submission.quest.score,
        totalScore: outcome.team.totalScore,
        currentSeqNum: outcome.team.currentSeqNum,
        postChallengeContent: submission.quest.postChallengeContent ?? null,
      });

      return res.status(200).json({
        status: "APPROVED",
        team: outcome.team,
      });
    }

    // REJECTED — same atomic guard; the quest stays active so the team can
    // resubmit (activeQuestId is left untouched).
    const claim = await prisma.submission.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "REJECTED", validatorId: validatorId ?? null },
    });
    if (claim.count === 0) {
      return res
        .status(409)
        .json({ error: "Submission already processed" });
    }

    io.to(teamChannel(submission.teamId)).emit("validation_result", {
      submissionId: id,
      status: "REJECTED",
      teamId: submission.teamId,
      questId: submission.questId,
      message: "Your submission was rejected. Please try again.",
    });

    res.status(200).json({ status: "REJECTED" });
  } catch (err) {
    next(err);
  }
}
