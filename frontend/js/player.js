const SESSION_KEY = "scavenger_player_session";

let session = loadSession(SESSION_KEY) || null; // { userId, teamId, teamName, roomId, username }
let socket = null;
let watchId = null;
let currentTarget = null; // { latitude, longitude, radius, sequenceOrder, openChallengeType }
let activeQuest = null;   // { questId, title, challengeType, content }
let insideRadius = false;

const $ = (id) => document.getElementById(id);

function showScreen(name) {
  ["joinScreen", "waitScreen", "gameScreen", "conclusionScreen"].forEach((s) => $(s).classList.toggle("hidden", s !== name));
}

function setConn(on) {
  $("connDot").classList.toggle("on", on);
  $("connLabel").textContent = on ? "ligado" : "sem ligação";
}

// ---------------- Join / resume ----------------
$("joinBtn").addEventListener("click", async () => {
  const roomId = $("roomIdInput").value.trim();
  const username = $("usernameInput").value.trim();
  if (!roomId || !username) return toast("Preenche o ID da sala e o teu nome.", "rust");

  const r = await api("POST", `/api/rooms/${roomId}/join-player`, { username });
  if (!r.ok) return toast("Não foi possível entrar: " + (r.body?.error || r.status), "rust");

  session = {
    userId: r.body.user.id,
    teamId: r.body.team.id,
    teamName: r.body.team.name,
    roomId,
    username,
  };
  saveSession(SESSION_KEY, session);
  toast("Bem-vindo, " + username + "! Equipa: " + session.teamName, "moss");
  enterLobby();
});

$("resumeBtn").addEventListener("click", async () => {
  if (!session) return toast("Sem sessão guardada neste telemóvel.", "rust");
  toast("A retomar sessão de " + session.username + "…", "moss");
  enterLobby();
});

$("resetBtn").addEventListener("click", () => {
  clearSession(SESSION_KEY);
  session = null;
  if (watchId) navigator.geolocation.clearWatch(watchId);
  if (socket) socket.disconnect();
  location.reload();
});

async function enterLobby() {
  connectRealtime();

  // Figure out whether the room is already playing.
  const roomState = await api("GET", `/api/rooms/${session.roomId}`);
  const playing = roomState.ok && roomState.body.status === "PLAYING";

  if (playing) {
    startGame();
  } else {
    $("teamNameLabel").textContent = session.teamName;
    showScreen("waitScreen");
  }
}

function connectRealtime() {
  if (socket) return;
  socket = connectSocket();
  socket.on("connect", () => {
    setConn(true);
    socket.emit("join_room", { roomId: session.roomId, teamId: session.teamId, isStaff: false });
  });
  socket.on("disconnect", () => setConn(false));
  socket.on("game_started", () => { toast("O jogo começou!", "moss"); startGame(); });
  socket.on("quest_unlocked", (p) => { if (p.teamId === session.teamId) renderActiveQuest(p); });
  socket.on("at_location", () => {
    insideRadius = true;
    $("unlockBtn").disabled = false;
    toast("Chegaste ao waypoint!", "moss");
  });
  socket.on("validation_result", (p) => { if (p.teamId === session.teamId) handleValidation(p); });
}

// ---------------- Game loop ----------------
async function startGame() {
  showScreen("gameScreen");
  $("questCard").classList.add("hidden");
  $("rewardCard").classList.add("hidden");
  $("retryCard").classList.add("hidden");
  $("locateCard").classList.remove("hidden");

  // Recovery: is there already an active quest for this team?
  const cs = await api("GET", `/api/play/current-state?userId=${session.userId}`);
  if (cs.ok && cs.body.activeQuestId) {
    const r = await api("POST", "/api/play/unlock-quest", { teamId: session.teamId });
    if (r.ok) { renderActiveQuest(r.body); return; }
  }
  loadNextCoordinate();
}

async function loadNextCoordinate() {
  $("questCard").classList.add("hidden");
  $("rewardCard").classList.add("hidden");
  $("retryCard").classList.add("hidden");
  $("locateCard").classList.remove("hidden");
  activeQuest = null;
  insideRadius = false;
  $("unlockBtn").disabled = true;

  const r = await api("GET", `/api/play/next-coordinate?teamId=${session.teamId}`);
  if (!r.ok) return toast("Erro a obter próximo waypoint.", "rust");

  if (r.body.finished) { showConclusion(); return; }

  currentTarget = r.body;
  $("seqBadge").textContent = "waypoint " + currentTarget.sequenceOrder;
  $("entryTypeLabel").textContent = currentTarget.openChallengeType;
  $("challengeValueWrap").classList.toggle("hidden", currentTarget.openChallengeType === "NONE");

  startGeoTracking();
}

function startGeoTracking() {
  if (!navigator.geolocation) { $("geoBox").textContent = "geolocalização não suportada neste browser."; return; }
  if (watchId) navigator.geolocation.clearWatch(watchId);
  watchId = navigator.geolocation.watchPosition(onPosition, onGeoError, { enableHighAccuracy: true, maximumAge: 4000, timeout: 15000 });
}

function onGeoError() {
  $("geoBox").textContent = "sem acesso à localização — permite-o nas definições do browser.";
}

function onPosition(pos) {
  if (!currentTarget) return;
  const { latitude: lat, longitude: lng } = pos.coords;
  const dist = haversineMeters(lat, lng, currentTarget.latitude, currentTarget.longitude);
  $("geoBox").textContent = `tu: ${fmtCoord(lat)}, ${fmtCoord(lng)}  ·  alvo: ${fmtCoord(currentTarget.latitude)}, ${fmtCoord(currentTarget.longitude)}  ·  ${Math.round(dist)}m`;
  const pct = Math.max(4, Math.min(100, (currentTarget.radius / Math.max(dist, 1)) * 100));
  $("distFill").style.width = pct + "%";

  if (socket && socket.connected) {
    socket.emit("player_location_update", { userId: session.userId, teamId: session.teamId, lat, lng });
  }

  if (dist <= currentTarget.radius && !insideRadius) {
    insideRadius = true;
    $("unlockBtn").disabled = false;
  }
}

$("unlockBtn").addEventListener("click", async () => {
  const body = { teamId: session.teamId };
  if (currentTarget.openChallengeType !== "NONE") {
    const val = $("challengeValueInput").value.trim();
    if (!val) return toast("Introduz o código / palavra-passe.", "rust");
    body.challengeValue = val;
  }
  const r = await api("POST", "/api/play/unlock-quest", body);
  if (r.status === 403) return toast("Código / palavra-passe errado.", "rust");
  if (r.status === 409) return toast("Já há outra quest ativa.", "rust");
  if (!r.ok) return toast("Erro a desbloquear: " + (r.body?.error || r.status), "rust");
  renderActiveQuest(r.body);
});

function renderActiveQuest(q) {
  activeQuest = q;
  if (watchId) { navigator.geolocation.clearWatch(watchId); watchId = null; }
  $("locateCard").classList.add("hidden");
  $("rewardCard").classList.add("hidden");
  $("retryCard").classList.add("hidden");
  $("questCard").classList.remove("hidden");

  $("questTitle").textContent = q.title;
  $("questTypeBadge").textContent = q.challengeType;
  $("questDescription").textContent = q.content?.description || "";

  const isQuiz = q.challengeType === "QUIZ";
  $("quizAnswerWrap").classList.toggle("hidden", !isQuiz);
  $("mediaSubmitWrap").classList.toggle("hidden", isQuiz);
  $("quizAnswerInput").value = "";
  $("uploadStatus").textContent = "";
}

$("submitQuizBtn").addEventListener("click", async () => {
  const answer = $("quizAnswerInput").value.trim();
  if (!answer) return toast("Escreve uma resposta.", "rust");
  const r = await api("POST", "/api/play/submit", { teamId: session.teamId, content: answer });
  if (!r.ok && r.status !== 200 && r.status !== 201) return toast("Erro a submeter: " + (r.body?.error || r.status), "rust");
  if (r.body?.result === "INCORRECT") { toast("Resposta errada, tenta outra vez.", "rust"); return; }
  toast("Resposta enviada — a validar…", "moss");
});

$("submitMediaBtn").addEventListener("click", async () => {
  const file = $("mediaFileInput").files[0];
  if (!file) return toast("Escolhe uma foto ou vídeo.", "rust");
  $("uploadStatus").textContent = "a enviar…";
  try {
    const ext = (file.name.split(".").pop() || "bin").toLowerCase();
    const pre = await api("GET", `/api/play/upload-url?teamId=${session.teamId}&ext=${ext}`);
    if (!pre.ok) throw new Error(pre.body?.error || "falha a pedir URL de upload");

    const put = await fetch(pre.body.uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
    if (!put.ok) throw new Error("falha no upload para o MinIO: " + put.status);

    const sub = await api("POST", "/api/play/submit", { teamId: session.teamId, content: pre.body.getUrl });
    if (!sub.ok) throw new Error(sub.body?.error || "falha a registar submissão");

    $("uploadStatus").textContent = "enviado — a aguardar validação da staff.";
    toast("Ficheiro enviado!", "moss");
  } catch (err) {
    $("uploadStatus").textContent = "";
    toast("Erro no envio: " + err.message, "rust");
  }
});

function handleValidation(p) {
  $("questCard").classList.add("hidden");
  if (p.status === "APPROVED") {
    $("scoreGain").textContent = p.awardedScore ?? "";
    $("rewardText").textContent = p.postChallengeContent?.reward || p.postChallengeContent?.text || "";
    $("rewardCard").classList.remove("hidden");
  } else {
    $("retryText").textContent = p.message || "A staff pediu para tentares outra vez.";
    $("retryCard").classList.remove("hidden");
    // Quest stays active server-side — bring the quest card back so they can resubmit.
    setTimeout(() => { $("retryCard").classList.add("hidden"); if (activeQuest) renderActiveQuest(activeQuest); }, 2400);
  }
}

$("continueBtn").addEventListener("click", () => { loadNextCoordinate(); });

async function showConclusion() {
  showScreen("conclusionScreen");
  let finalScore = "";
  const cs = await api("GET", `/api/play/current-state?userId=${session.userId}`);
  if (cs.ok) finalScore = cs.body.team?.totalScore;
  $("conclusionText").innerHTML = "";
  $("conclusionText").appendChild(el("div", {}, [
    el("div", { class: "eyebrow" }, "Missão completa"),
    el("h2", {}, session.teamName),
    finalScore !== "" ? el("p", { class: "mono" }, "Pontuação final: " + finalScore) : null,
  ]));
}

// ---------------- boot ----------------
initSettings();
if (session) {
  $("joinScreen").querySelector("h1").textContent = "Bem-vindo de volta";
}