const SESSION_KEY = "scavenger_staff_session";

let session = loadSession(SESSION_KEY) || null; // { userId, username, roomId }
let socket = null;
const liveLocations = new Map(); // userId -> { teamId, lat, lng, at }

const $ = (id) => document.getElementById(id);

function setConn(on) {
  $("connDot").classList.toggle("on", on);
  $("connLabel").textContent = on ? "ligado" : "sem ligação";
}

function renderMedia(url) {
  const clean = url.split("?")[0].toLowerCase();
  if (/\.(png|jpe?g|gif|webp)$/.test(clean)) return el("img", { src: url });
  if (/\.(mp4|webm|mov)$/.test(clean)) return el("video", { src: url, controls: "true" });
  if (/\.(mp3|wav|ogg|m4a)$/.test(clean)) return el("audio", { src: url, controls: "true" });
  return el("a", { href: url, target: "_blank" }, "abrir ficheiro");
}

// ---------------- Join ----------------
$("joinBtn").addEventListener("click", async () => {
  const roomId = $("roomIdInput").value.trim();
  const username = $("usernameInput").value.trim();
  const staffPassword = $("staffPasswordInput").value.trim();
  if (!roomId || !username) return toast("Preenche o ID da sala e o teu nome.", "rust");

  const r = await api("POST", `/api/rooms/${roomId}/join-staff`, { username, staffPassword: staffPassword || undefined });
  if (r.status === 403) return toast("Palavra-passe da staff incorreta.", "rust");
  if (!r.ok) return toast("Erro a entrar: " + (r.body?.error || r.status), "rust");

  session = { userId: r.body.user.id, username, roomId };
  saveSession(SESSION_KEY, session);
  toast("Bem-vindo à staff, " + username, "moss");
  enterDashboard();
});

$("resetBtn").addEventListener("click", () => {
  clearSession(SESSION_KEY);
  session = null;
  if (socket) socket.disconnect();
  location.reload();
});

function enterDashboard() {
  $("joinScreen").classList.add("hidden");
  $("dashScreen").classList.remove("hidden");
  connectRealtime();
  refreshPending();
  refreshRoster();
}

function connectRealtime() {
  if (socket) return;
  socket = connectSocket();
  socket.on("connect", () => {
    setConn(true);
    socket.emit("join_room", { roomId: session.roomId, isStaff: true });
  });
  socket.on("disconnect", () => setConn(false));
  socket.on("submission_pending", (s) => { prependPending(s); toast("Nova submissão: " + s.teamName, "amber"); });
  socket.on("player_location", (p) => { liveLocations.set(p.userId, p); renderLiveLocations(); });
}

// ---------------- Pending submissions ----------------
async function refreshPending() {
  const r = await api("GET", `/api/staff/submissions?roomId=${session.roomId}`);
  if (!r.ok) return toast("Erro a obter submissões.", "rust");
  const box = $("pendingList");
  box.innerHTML = "";
  const items = r.body || [];
  if (!items.length) { box.appendChild(el("div", { class: "list-empty" }, "Sem submissões pendentes.")); return; }
  items.forEach((s) => box.appendChild(buildPendingCard(s)));
}
$("refreshBtn").addEventListener("click", refreshPending);

function prependPending(s) {
  const box = $("pendingList");
  const emptyNote = box.querySelector(".list-empty");
  if (emptyNote) emptyNote.remove();
  box.prepend(buildPendingCard(s));
}

function buildPendingCard(s) {
  const card = el("div", { class: "card dashed", id: "sub-" + s.id });
  card.appendChild(el("div", { class: "card-head" }, [
    el("h3", {}, s.teamName || s.teamId),
    el("span", { class: "badge amber" }, s.challengeType),
  ]));
  card.appendChild(el("div", { class: "muted mono", style: "font-size:0.78rem; margin-bottom:8px;" }, s.questTitle || s.questId));
  card.appendChild(el("div", { class: "media-box", style: "margin-bottom:10px;" }, renderMedia(s.content)));
  const approveBtn = el("button", { class: "small moss", onclick: () => validate(s.id, "APPROVED", card) }, "aprovar");
  const rejectBtn = el("button", { class: "small rust", onclick: () => validate(s.id, "REJECTED", card) }, "rejeitar");
  card.appendChild(el("div", { style: "display:flex; gap:8px;" }, [approveBtn, rejectBtn]));
  return card;
}

async function validate(submissionId, status, cardEl) {
  const r = await api("POST", `/api/staff/submissions/${submissionId}/validate`, { status, validatorId: session.userId });
  if (r.status === 409) return toast("Já foi validada por outro membro da staff.", "rust");
  if (!r.ok) return toast("Erro a validar: " + (r.body?.error || r.status), "rust");
  toast(status === "APPROVED" ? "Aprovado!" : "Rejeitado.", status === "APPROVED" ? "moss" : "rust");
  cardEl.remove();
  if (!$("pendingList").children.length) $("pendingList").appendChild(el("div", { class: "list-empty" }, "Sem submissões pendentes."));
}

// ---------------- Roster ----------------
async function refreshRoster() {
  const r = await api("GET", `/api/rooms/${session.roomId}`);
  if (!r.ok) return toast("Erro a obter equipas.", "rust");
  const box = $("rosterList");
  box.innerHTML = "";
  const teams = r.body.teams || [];
  if (!teams.length) { box.appendChild(el("div", { class: "list-empty" }, "Sem equipas.")); return; }
  teams.forEach((t) => {
    const members = (t.members || []).map((m) => m.user.username).join(", ") || "sem jogadores";
    box.appendChild(el("div", { class: "card dashed" }, [
      el("div", { class: "card-head" }, [el("h3", {}, t.name), el("span", { class: "badge amber" }, `${t.totalScore || 0} pts`)]),
      el("div", { class: "muted mono", style: "font-size:0.76rem;" }, `seq ${t.currentSeqNum ?? 0} · ${members}`),
    ]));
  });
}
$("refreshRosterBtn").addEventListener("click", refreshRoster);

// ---------------- Live locations ----------------
function renderLiveLocations() {
  const box = $("liveLocations");
  if (!liveLocations.size) { box.className = "list-empty"; box.textContent = "sem sinais ainda."; return; }
  box.className = "stack";
  box.innerHTML = "";
  [...liveLocations.values()].sort((a, b) => b.at - a.at).forEach((p) => {
    box.appendChild(el("div", { class: "geo" }, `equipa ${p.teamId.slice(0, 8)}… · ${fmtCoord(p.lat)}, ${fmtCoord(p.lng)} · ${new Date(p.at).toLocaleTimeString()}`));
  });
}

// ---------------- boot ----------------
initSettings();
if (session) enterDashboard();
