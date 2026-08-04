import { randomUUID } from "crypto";
import { api, assert } from "./lib/client.js";

const uid = () => randomUUID().slice(0, 8);

/** Create (or reuse) a MANAGER user to author games. */
export async function createManager() {
  const res = await api("POST", "/api/users", {
    username: `manager-${uid()}`,
    role: "MANAGER",
  });
  assert(res.status === 201, `createManager failed: ${res.status}`);
  return res.body;
}

/**
 * Build one fully isolated scenario (own game/quest/track/room/team) for a
 * given Entry × Approval combination.
 *
 * @param {object} opts
 * @param {"QR"|"OPEN"} opts.entry
 * @param {"AUTO"|"STAFF"} opts.approval
 * @param {string} [opts.answer]  correct answer for AUTO quizzes
 * @param {number} [opts.score]
 * @param {object} manager  a MANAGER user (from createManager)
 */
export async function createScenario(manager, opts) {
  const { entry, approval, answer = "correct", score = 10 } = opts;

  const openChallengeType = entry === "QR" ? "QR" : "NONE";
  const qrValue = entry === "QR" ? `QR-${uid()}` : null;
  const challengeType = approval === "AUTO" ? "QUIZ" : "PHOTO";
  const content =
    approval === "AUTO"
      ? { description: `Auto quiz (${entry})`, answer }
      : { description: `Staff photo task (${entry})` };
  const staffPassword = "staff-pw";

  // 1. Game
  const game = await api("POST", "/api/games", {
    title: `Scenario ${entry}+${approval} ${uid()}`,
    creatorId: manager.id,
  });
  assert(game.status === 201, `game create failed: ${game.status}`);

  // 2. Quest
  const quest = await api("POST", "/api/quests", {
    gameId: game.body.id,
    title: `Quest ${entry}+${approval}`,
    openChallengeType,
    openChallengeValue: qrValue,
    challengeType,
    content,
    score,
    postChallengeContent: { reward: "Well done!" },
  });
  assert(quest.status === 201, `quest create failed: ${quest.status}`);

  // 3. Track with a single waypoint (sequenceOrder 1)
  const waypoint = { latitude: 40.4168, longitude: -3.7038, radius: 15 };
  const track = await api("POST", "/api/tracks", {
    gameId: game.body.id,
    name: `Track ${entry}+${approval}`,
    waypoints: [
      {
        questId: quest.body.id,
        sequenceOrder: 1,
        latitude: waypoint.latitude,
        longitude: waypoint.longitude,
        radius: waypoint.radius,
      },
    ],
  });
  assert(track.status === 201, `track create failed: ${track.status}`);

  // 4. Room (auto-generates one team per track in the game — here, exactly one)
  const room = await api("POST", "/api/rooms", {
    gameId: game.body.id,
    staffPassword,
  });
  assert(room.status === 201, `room create failed: ${room.status}`);
  assert(room.body.teams.length === 1, "expected exactly one team");
  const teamId = room.body.teams[0].id;

  // 5. Player joins
  const joinPlayer = await api("POST", `/api/rooms/${room.body.id}/join-player`, {
    username: `player-${uid()}`,
  });
  assert(joinPlayer.status === 201, `join-player failed: ${joinPlayer.status}`);

  // 6. Staff joins
  const joinStaff = await api("POST", `/api/rooms/${room.body.id}/join-staff`, {
    username: `staff-${uid()}`,
    staffPassword,
  });
  assert(joinStaff.status === 200, `join-staff failed: ${joinStaff.status}`);

  // 7. Start the room
  const start = await api("POST", `/api/rooms/${room.body.id}/start`);
  assert(start.status === 200, `start failed: ${start.status}`);

  return {
    game: game.body,
    quest: quest.body,
    track: track.body,
    room: room.body,
    roomId: room.body.id,
    teamId,
    player: joinPlayer.body.user,
    staff: joinStaff.body.user,
    staffPassword,
    qrValue,
    answer,
    score,
    waypoint,
  };
}
