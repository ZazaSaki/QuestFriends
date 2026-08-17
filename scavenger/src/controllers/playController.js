import { randomUUID } from "crypto";
import prisma from "../prisma.js";
import { getCurrentWaypoint } from "../utils/team.js";
import { externalClient, BUCKET } from "../minio.js";
import { teamChannel, staffChannel } from "../sockets/index.js";

const PRESIGNED_EXPIRY_SECONDS = 60 * 10; // 10 minutes

const normalize = (v) => String(v ?? "").trim().toLowerCase();

/**
 * Grade a submitted answer for an automated QUIZ against the answer key stored
 * in the quest's `content` JSON (`content.answer` string, or `content.answers`
 * array of accepted values). Comparison is trimmed + case-insensitive.
 *
 * Returns true/false when an answer key exists, or null when the quest has no
 * key (so the caller can fall back to staff approval).
 */
function isQuizCorrect(quest, answer) {
  const content = quest.content && typeof quest.content === "object" ? quest.content : {};
  const key = content.answer ?? content.answers;
  if (key === undefined || key === null) return null;

  const given = normalize(answer);
  if (Array.isArray(key)) return key.some((k) => normalize(k) === given);
  return normalize(key) === given;
}

/**
 * GET /api/play/current-state?userId=
 * Frontend recovery after a refresh: returns the player's team, its
 * currentSeqNum, and any pending submissions for that team.
 */
export async function currentState(req, res, next) {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const membership = await prisma.roomPlayer.findFirst({
      where: { userId: String(userId) },
      include: { team: true },
      orderBy: { joinedAt: "desc" },
    });
    if (!membership) {
      return res.status(404).json({ error: "User is not in any team" });
    }

    const team = membership.team;

    const pendingSubmissions = await prisma.submission.findMany({
      where: { teamId: team.id, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    });

    res.status(200).json({
      team: {
        id: team.id,
        name: team.name,
        roomId: team.roomId,
        trackId: team.trackId,
        totalScore: team.totalScore,
        currentSeqNum: team.currentSeqNum,
        activeQuestId: team.activeQuestId,
      },
      currentSeqNum: team.currentSeqNum,
      activeQuestId: team.activeQuestId,
      pendingSubmissions,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/play/next-coordinate?teamId=
 * Anti-hack: returns ONLY the geo target + challenge type for the team's
 * current waypoint. The quest content/description is deliberately withheld
 * until unlock-quest.
 */
export async function nextCoordinate(req, res, next) {
  try {
    const { teamId } = req.query;
    if (!teamId) return res.status(400).json({ error: "teamId is required" });

    const result = await getCurrentWaypoint(String(teamId));
    if (!result) return res.status(404).json({ error: "Team not found" });

    const { waypoint } = result;
    if (!waypoint) {
      return res.status(200).json({ finished: true });
    }

    res.status(200).json({
      latitude: waypoint.latitude,
      longitude: waypoint.longitude,
      radius: waypoint.radius,
      sequenceOrder: waypoint.sequenceOrder,
      openChallengeType: waypoint.quest.openChallengeType,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/play/unlock-quest
 * Body: { teamId, location?, challengeValue? }
 * Validates challengeValue against the quest's openChallengeValue when the
 * open-challenge type is PASSWORD or QR (Open Entry / NONE starts freely). On
 * success the quest is opened for the ENTIRE team via a `quest_unlocked` socket
 * broadcast, and the full quest `content` JSON is returned to the caller.
 *
 * A team may only have ONE active quest at a time: if a quest is already
 * active, a request to open a DIFFERENT quest is ignored (409); re-requesting
 * the already-active quest is idempotent.
 */
export async function unlockQuest(req, res, next) {
  try {
    const { teamId, challengeValue } = req.body;
    if (!teamId) return res.status(400).json({ error: "teamId is required" });

    const result = await getCurrentWaypoint(teamId);
    if (!result) return res.status(404).json({ error: "Team not found" });

    const { team, waypoint } = result;
    if (!waypoint) {
      return res.status(200).json({ finished: true });
    }

    const quest = waypoint.quest;

    // One active quest per team.
    if (team.activeQuestId) {
      if (team.activeQuestId === quest.id) {
        // Already open (e.g. a teammate opened it, or a re-sync). Idempotent.
        return res.status(200).json({
          questId: quest.id,
          title: quest.title,
          challengeType: quest.challengeType,
          content: quest.content,
          alreadyActive: true,
        });
      }
      // A different quest is active — ignore this new unlock.
      return res.status(409).json({ error: "Team already has an active quest" });
    }

    // Entry gating: QR / PASSWORD require a matching value; NONE (Open) is free.
    if (
      quest.openChallengeType === "PASSWORD" ||
      quest.openChallengeType === "QR"
    ) {
      if (!challengeValue || challengeValue !== quest.openChallengeValue) {
        return res.status(403).json({ error: "Invalid challenge value" });
      }
    }

    // Atomically claim the active-quest slot; guards against two teammates
    // racing to unlock at the same instant (only one write succeeds).
    const claim = await prisma.team.updateMany({
      where: { id: teamId, activeQuestId: null },
      data: { activeQuestId: quest.id },
    });

    if (claim.count === 0) {
      // Lost the race — a teammate just opened it. Return content idempotently
      // without emitting a second broadcast.
      return res.status(200).json({
        questId: quest.id,
        title: quest.title,
        challengeType: quest.challengeType,
        content: quest.content,
        alreadyActive: true,
      });
    }

    // Open the quest for the ENTIRE team.
    const io = req.app.get("io");
    io.to(teamChannel(teamId)).emit("quest_unlocked", {
      teamId,
      questId: quest.id,
      title: quest.title,
      challengeType: quest.challengeType,
      sequenceOrder: waypoint.sequenceOrder,
      content: quest.content,
    });

    res.status(200).json({
      questId: quest.id,
      title: quest.title,
      challengeType: quest.challengeType,
      content: quest.content,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/play/upload-url?teamId=&ext=
 * Returns a presigned MinIO PUT URL so the frontend uploads directly to
 * storage (never through Node). Signed with the EXTERNAL client so the URL is
 * reachable from the player's device.
 */
export async function uploadUrl(req, res, next) {
  try {
    const { teamId, ext } = req.query;
    const safeExt = typeof ext === "string" ? ext.replace(/[^a-zA-Z0-9]/g, "") : "";
    const prefix = teamId ? `${String(teamId)}/` : "";
    const objectName = `${prefix}${randomUUID()}${safeExt ? "." + safeExt : ""}`;

    const url = await externalClient.presignedPutObject(
      BUCKET,
      objectName,
      PRESIGNED_EXPIRY_SECONDS
    );

    // A matching presigned GET so the uploaded object can be rendered/reviewed
    // (bucket stays private). Signed against the same external host as the PUT.
    const getUrl = await externalClient.presignedGetObject(
      BUCKET,
      objectName,
      PRESIGNED_EXPIRY_SECONDS
    );

    res.status(200).json({
      uploadUrl: url,
      getUrl,
      // Durable, non-expiring URL (bucket is public-read) — the object URL
      // without the presign query string. Use this for authored/stored media.
      publicUrl: url.split("?")[0],
      objectName,
      bucket: BUCKET,
      method: "PUT",
      expiresIn: PRESIGNED_EXPIRY_SECONDS,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/play/submit
 * Body: { teamId, content }
 * content = the MinIO file URL (photo/video) or a quiz answer string.
 *
 * Approval type is derived from the quest's challengeType:
 *  - QUIZ  → AUTOMATED. Graded immediately against the answer key in
 *            quest.content (infinite attempts, no partial state persisted).
 *            Correct → auto-approved + team advances; incorrect → recorded
 *            REJECTED, quest stays active for a retry.
 *  - PHOTO / VIDEO → STAFF manual. Saved as PENDING for staff review.
 *  - QUIZ without an answer key → falls back to STAFF manual (PENDING).
 */
export async function submit(req, res, next) {
  try {
    const { teamId, content } = req.body;
    if (!teamId) return res.status(400).json({ error: "teamId is required" });

    const result = await getCurrentWaypoint(teamId);
    if (!result) return res.status(404).json({ error: "Team not found" });

    const { team, waypoint } = result;
    if (!waypoint) {
      return res.status(400).json({ error: "Team has finished its track" });
    }

    const quest = waypoint.quest;
    const io = req.app.get("io");

    // --- Automated quiz approval ---
    if (quest.challengeType === "QUIZ") {
      const correct = isQuizCorrect(quest, content);

      if (correct === true) {
        // Auto-approve atomically. The updateMany guard on activeQuestId ===
        // quest.id ensures a duplicate correct submission (race) can't advance
        // the team twice or double-award points.
        const outcome = await prisma.$transaction(async (tx) => {
          const claim = await tx.team.updateMany({
            where: { id: teamId, activeQuestId: quest.id },
            data: {
              totalScore: { increment: quest.score },
              currentSeqNum: { increment: 1 },
              activeQuestId: null,
            },
          });
          if (claim.count === 0) return { advanced: false };

          const submission = await tx.submission.create({
            data: {
              teamId,
              questId: quest.id,
              content: content ?? null,
              status: "APPROVED",
            },
          });
          const team = await tx.team.findUnique({ where: { id: teamId } });
          return { advanced: true, submission, team };
        });

        if (!outcome.advanced) {
          // Quest was already completed / is not active — discard safely.
          return res
            .status(409)
            .json({ error: "Quest is not active or already completed" });
        }

        io.to(teamChannel(teamId)).emit("validation_result", {
          status: "APPROVED",
          auto: true,
          teamId,
          questId: quest.id,
          awardedScore: quest.score,
          totalScore: outcome.team.totalScore,
          currentSeqNum: outcome.team.currentSeqNum,
          postChallengeContent: quest.postChallengeContent ?? null,
        });

        return res.status(201).json({
          result: "CORRECT",
          submission: outcome.submission,
          team: outcome.team,
        });
      }

      if (correct === false) {
        // Wrong answer: infinite attempts, no partial state. Record the attempt
        // and keep the quest active so the team can retry from the start.
        const submission = await prisma.submission.create({
          data: {
            teamId,
            questId: quest.id,
            content: content ?? null,
            status: "REJECTED",
          },
        });

        io.to(teamChannel(teamId)).emit("validation_result", {
          status: "REJECTED",
          auto: true,
          teamId,
          questId: quest.id,
          message: "Incorrect. Try again — the quiz restarts from the beginning.",
        });

        return res.status(200).json({ result: "INCORRECT", submission });
      }
      // correct === null → no answer key: fall through to staff approval.
    }

    // --- Staff manual approval (PHOTO / VIDEO, or QUIZ without a key) ---
    const submission = await prisma.submission.create({
      data: {
        teamId,
        questId: waypoint.questId,
        content: content ?? null,
        status: "PENDING",
      },
    });

    // Push the new pending submission to staff live (dashboard feed).
    // `id` mirrors the field name GET /api/staff/submissions returns, so the
    // dashboard can treat a live push and a refreshed row identically — it is
    // the id staff posts back to /validate. `submissionId` is kept as an alias
    // for clients still running a cached older bundle.
    io.to(staffChannel(team.roomId)).emit("submission_pending", {
      id: submission.id,
      submissionId: submission.id,
      teamId,
      teamName: team.name,
      questId: submission.questId,
      questTitle: quest.title,
      challengeType: quest.challengeType,
      content: submission.content,
      createdAt: submission.createdAt,
    });

    res.status(201).json(submission);
  } catch (err) {
    next(err);
  }
}
