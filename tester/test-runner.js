import {
  api,
  connectSocket,
  waitForEvent,
  waitForHealth,
  assert,
  assertEqual,
  runTest,
  summary,
  sleep,
  BACKEND_HTTP,
} from "./lib/client.js";
import { createManager, createScenario } from "./setup.js";

// --- request helpers ---
const unlock = (teamId, challengeValue) =>
  api("POST", "/api/play/unlock-quest", { teamId, challengeValue });
const submit = (teamId, content) =>
  api("POST", "/api/play/submit", { teamId, content });
const validate = (id, status, validatorId) =>
  api("POST", `/api/staff/submissions/${id}/validate`, { status, validatorId });
const getState = (userId) =>
  api("GET", `/api/play/current-state?userId=${userId}`);
const listSubs = (roomId) =>
  api("GET", `/api/staff/submissions?roomId=${roomId}`);

// --- socket helpers ---
async function playerSocket(roomId, teamId) {
  const s = await connectSocket();
  s.emit("join_room", { roomId, teamId });
  await waitForEvent(s, "joined", 3000).catch(() => {});
  return s;
}
async function staffSocket(roomId) {
  const s = await connectSocket();
  s.emit("join_room", { roomId, isStaff: true });
  await waitForEvent(s, "joined", 3000).catch(() => {});
  return s;
}
/** Resolve if `event` does NOT arrive within `ms`; reject if it does. */
function expectNoEvent(socket, event, ms = 800) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    socket.once(event, () => {
      clearTimeout(t);
      reject(new Error(`unexpected "${event}" event received`));
    });
  });
}

// ============================================================
//  MATRIX HAPPY PATHS
// ============================================================
async function matrixHappyPath(manager, entry, approval) {
  const answer = "42";
  const sc = await createScenario(manager, { entry, approval, answer });
  const ps = await playerSocket(sc.roomId, sc.teamId);
  const ss = await staffSocket(sc.roomId);

  try {
    // Unlock → whole team gets quest_unlocked
    const unlockedP = waitForEvent(ps, "quest_unlocked");
    const u = await unlock(sc.teamId, sc.qrValue); // qrValue is null for OPEN
    assertEqual(u.status, 200, "unlock status");
    const uEvt = await unlockedP;
    assertEqual(uEvt.questId, sc.quest.id, "quest_unlocked.questId");

    if (approval === "AUTO") {
      // Auto quiz: correct answer approves immediately for the whole team.
      const vrP = waitForEvent(ps, "validation_result");
      const s = await submit(sc.teamId, answer);
      assertEqual(s.status, 201, "quiz submit status");
      assertEqual(s.body.result, "CORRECT", "quiz result");
      const vr = await vrP;
      assertEqual(vr.status, "APPROVED", "validation_result status");
      assert(vr.auto === true, "expected auto:true");
    } else {
      // Staff photo: submit → PENDING → staff sees it live → approves.
      const pendP = waitForEvent(ss, "submission_pending");
      const s = await submit(sc.teamId, "minio://photo.jpg");
      assertEqual(s.status, 201, "photo submit status");
      assertEqual(s.body.status, "PENDING", "submission is PENDING");
      const pend = await pendP;
      assertEqual(pend.submissionId, s.body.id, "submission_pending id");

      const listed = await listSubs(sc.roomId);
      assert(
        listed.body.some((x) => x.id === s.body.id),
        "submission appears in staff list"
      );

      const vrP = waitForEvent(ps, "validation_result");
      const v = await validate(s.body.id, "APPROVED", sc.staff.id);
      assertEqual(v.status, 200, "validate status");
      const vr = await vrP;
      assertEqual(vr.status, "APPROVED", "validation_result status");
    }

    // Advanced exactly once, score awarded once.
    const st = await getState(sc.player.id);
    assertEqual(st.body.currentSeqNum, 2, "currentSeqNum advanced once");
    assertEqual(st.body.team.totalScore, sc.score, "score awarded once");
    assertEqual(st.body.activeQuestId, null, "active quest cleared");
  } finally {
    ps.close();
    ss.close();
  }
}

// ============================================================
//  ENTRY EDGE CASES
// ============================================================
async function invalidQr(manager) {
  const sc = await createScenario(manager, { entry: "QR", approval: "STAFF" });
  const r = await unlock(sc.teamId, "wrong-code");
  assertEqual(r.status, 403, "invalid QR should be 403");
}

async function bypassQr(manager) {
  const sc = await createScenario(manager, { entry: "QR", approval: "STAFF" });
  const r = await unlock(sc.teamId, undefined); // no challengeValue at all
  assertEqual(r.status, 403, "bypassing QR should be 403");
}

async function secondQuestBlocked(manager) {
  const sc = await createScenario(manager, { entry: "OPEN", approval: "STAFF" });
  const ps = await playerSocket(sc.roomId, sc.teamId);
  try {
    const firstEvt = waitForEvent(ps, "quest_unlocked");
    const first = await unlock(sc.teamId);
    assertEqual(first.status, 200, "first unlock 200");
    await firstEvt; // one event fired

    // Second unlock while a quest is active → idempotent, NO new broadcast.
    const noSecond = expectNoEvent(ps, "quest_unlocked", 800);
    const second = await unlock(sc.teamId);
    assertEqual(second.status, 200, "second unlock 200 (idempotent)");
    assert(second.body.alreadyActive === true, "expected alreadyActive:true");
    await noSecond; // asserts no second quest_unlocked was emitted
  } finally {
    ps.close();
  }
}

// ============================================================
//  APPROVAL EDGE CASES
// ============================================================
async function staffRejectThenRetry(manager) {
  const sc = await createScenario(manager, { entry: "OPEN", approval: "STAFF" });
  const ps = await playerSocket(sc.roomId, sc.teamId);
  try {
    await unlock(sc.teamId);

    // First attempt rejected.
    const sub1 = await submit(sc.teamId, "minio://bad.jpg");
    const rejP = waitForEvent(ps, "validation_result");
    const r = await validate(sub1.body.id, "REJECTED", sc.staff.id);
    assertEqual(r.status, 200, "reject status");
    const rej = await rejP;
    assertEqual(rej.status, "REJECTED", "player notified REJECTED");

    // Quest still active, not advanced.
    let st = await getState(sc.player.id);
    assertEqual(st.body.currentSeqNum, 1, "not advanced after reject");
    assertEqual(st.body.activeQuestId, sc.quest.id, "still active after reject");

    // Retry succeeds.
    const sub2 = await submit(sc.teamId, "minio://good.jpg");
    const v = await validate(sub2.body.id, "APPROVED", sc.staff.id);
    assertEqual(v.status, 200, "retry approve status");
    st = await getState(sc.player.id);
    assertEqual(st.body.currentSeqNum, 2, "advanced after retry");
    assertEqual(st.body.team.totalScore, sc.score, "score awarded once");
  } finally {
    ps.close();
  }
}

async function submitTwiceRapidlyStaff(manager) {
  const sc = await createScenario(manager, { entry: "OPEN", approval: "STAFF" });
  await unlock(sc.teamId);

  // Two rapid photo submissions → two PENDING rows.
  const [a, b] = await Promise.all([
    submit(sc.teamId, "minio://p1.jpg"),
    submit(sc.teamId, "minio://p2.jpg"),
  ]);
  assertEqual(a.status, 201, "submit1 201");
  assertEqual(b.status, 201, "submit2 201");

  // Approving BOTH must still award only once.
  const [v1, v2] = await Promise.all([
    validate(a.body.id, "APPROVED", sc.staff.id),
    validate(b.body.id, "APPROVED", sc.staff.id),
  ]);
  const codes = [v1.status, v2.status].sort();
  assertEqual(JSON.stringify(codes), JSON.stringify([200, 409]), "one 200, one 409");

  const st = await getState(sc.player.id);
  assertEqual(st.body.team.totalScore, sc.score, "score awarded exactly once");
  assertEqual(st.body.currentSeqNum, 2, "advanced exactly once");
}

async function submitTwiceRapidlyAutoQuiz(manager) {
  const sc = await createScenario(manager, {
    entry: "OPEN",
    approval: "AUTO",
    answer: "42",
  });
  await unlock(sc.teamId);

  const [a, b] = await Promise.all([
    submit(sc.teamId, "42"),
    submit(sc.teamId, "42"),
  ]);
  const statuses = [a.status, b.status].sort();
  assertEqual(
    JSON.stringify(statuses),
    JSON.stringify([201, 409]),
    "one 201 (CORRECT), one 409"
  );

  const st = await getState(sc.player.id);
  assertEqual(st.body.team.totalScore, sc.score, "score awarded exactly once");
  assertEqual(st.body.currentSeqNum, 2, "advanced exactly once");
}

// ============================================================
//  CONCURRENCY — two staff approve the SAME submission at once
// ============================================================
async function concurrentApproval(manager) {
  const sc = await createScenario(manager, { entry: "OPEN", approval: "STAFF" });
  await unlock(sc.teamId);
  const sub = await submit(sc.teamId, "minio://race.jpg");

  const [v1, v2] = await Promise.all([
    validate(sub.body.id, "APPROVED", sc.staff.id),
    validate(sub.body.id, "APPROVED", sc.staff.id),
  ]);
  const codes = [v1.status, v2.status].sort();
  assertEqual(
    JSON.stringify(codes),
    JSON.stringify([200, 409]),
    "exactly one approval wins (200), the other 409"
  );

  const st = await getState(sc.player.id);
  assertEqual(st.body.team.totalScore, sc.score, "points added only once");
}

// ============================================================
//  QUIZ EDGE — dropped quiz restarts with no saved state
// ============================================================
async function droppedQuizRestarts(manager) {
  const sc = await createScenario(manager, {
    entry: "OPEN",
    approval: "AUTO",
    answer: "42",
  });

  // Open the quiz, then "drop" mid-quiz (disconnect, no partial submit).
  let ps = await playerSocket(sc.roomId, sc.teamId);
  const openedP = waitForEvent(ps, "quest_unlocked");
  await unlock(sc.teamId);
  const opened = await openedP;
  assert(opened.content, "quiz content delivered on unlock");
  ps.close(); // dropped connection, answered 0/N, nothing submitted

  // Reconnect / recover: no partial state should exist.
  const st = await getState(sc.player.id);
  assertEqual(st.body.activeQuestId, sc.quest.id, "quest still active after drop");
  assertEqual(
    st.body.pendingSubmissions.length,
    0,
    "no partial/pending quiz state saved"
  );

  // Re-unlock returns the FULL content again → restart from the beginning.
  const re = await unlock(sc.teamId);
  assertEqual(re.status, 200, "re-unlock status");
  assert(re.body.alreadyActive === true, "re-unlock idempotent");
  assert(re.body.content, "full content re-served on restart");

  // Completing after restart works.
  ps = await playerSocket(sc.roomId, sc.teamId);
  const vrP = waitForEvent(ps, "validation_result");
  const s = await submit(sc.teamId, "42");
  assertEqual(s.body.result, "CORRECT", "restarted quiz completes");
  const vr = await vrP;
  assertEqual(vr.status, "APPROVED", "approved after restart");
  ps.close();
}

// ============================================================
//  RUNNER
// ============================================================
export async function runAll() {
  console.log(`\n▶ Scavenger test suite — backend at ${BACKEND_HTTP}\n`);
  await waitForHealth();
  const manager = await createManager();

  console.log("MATRIX (Entry × Approval) happy paths:");
  await runTest("QR + Staff", () => matrixHappyPath(manager, "QR", "STAFF"));
  await runTest("QR + Auto (Quiz)", () => matrixHappyPath(manager, "QR", "AUTO"));
  await runTest("Open + Staff", () => matrixHappyPath(manager, "OPEN", "STAFF"));
  await runTest("Open + Auto (Quiz)", () => matrixHappyPath(manager, "OPEN", "AUTO"));

  console.log("\nENTRY edge cases:");
  await runTest("Invalid QR code → 403", () => invalidQr(manager));
  await runTest("Bypass QR on locked quest → 403", () => bypassQr(manager));
  await runTest("Second quest while active is blocked", () =>
    secondQuestBlocked(manager));

  console.log("\nAPPROVAL edge cases:");
  await runTest("Staff reject → team retries", () => staffRejectThenRetry(manager));
  await runTest("Submit twice rapidly (staff) → award once", () =>
    submitTwiceRapidlyStaff(manager));
  await runTest("Submit twice rapidly (auto quiz) → award once", () =>
    submitTwiceRapidlyAutoQuiz(manager));

  console.log("\nCONCURRENCY:");
  await runTest("Two staff approve same submission → points once", () =>
    concurrentApproval(manager));

  console.log("\nQUIZ edge cases:");
  await runTest("Dropped quiz restarts with no saved state", () =>
    droppedQuizRestarts(manager));

  return summary();
}

// Allow `node test-runner.js` to run standalone.
if (import.meta.url === `file://${process.argv[1]}`) {
  runAll()
    .then((ok) => process.exit(ok ? 0 : 1))
    .catch((err) => {
      console.error("Fatal:", err);
      process.exit(1);
    });
}
