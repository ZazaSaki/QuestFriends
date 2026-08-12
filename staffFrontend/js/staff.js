const SESSION_KEY = "scavenger_staff_session";

let session = loadSession(SESSION_KEY) || null; // { userId, username, roomId }
let socket = null;

// questId -> { questId, questTitle, items: Map<submissionId, submission> }
const questThreads = new Map();

// questId -> { questTitle, teamStatuses: [{ teamId, teamName, status }] }
// Built from the room roster's track.waypoints (needs the getRoom backend patch).
let questCatalog = new Map();

// Which single quest's conversation is currently open (WhatsApp-style: only
// one quest's approve/reject buttons are visible at a time, to avoid
// approving the wrong one while scrolling a flat list).
let openQuestId = null;

// Teams cache + selection state for the drag/drop (and tap-to-move) editor.
let lastTeams = [];
let selectedMember = null; // { userId, fromTeamId, chipEl }

// Live map state.
let map = null;
const markers = new Map(); // userId -> L.Marker
const liveLocations = new Map(); // userId -> { teamId, lat, lng, at }

const $ = (id) => document.getElementById(id);

function setConn(on) {
  $("connDot").classList.toggle("on", on);
  $("connLabel").textContent = on ? "ligado" : "sem ligação";
}

function initials(name) {
  return (name || "?").trim().slice(0, 2).toUpperCase();
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
  refreshTeams();
}

// ---------------- Tabs ----------------
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const name = btn.dataset.tab;
    document.querySelectorAll(".tabpanel").forEach((p) => p.classList.toggle("hidden", p.id !== "panel-" + name));
    if (name === "teams") refreshTeams();
    if (name === "live") { ensureMap(); renderLive(); }
  });
});

function connectRealtime() {
  if (socket) return;
  socket = connectSocket();
  socket.on("connect", () => {
    setConn(true);
    socket.emit("join_room", { roomId: session.roomId, isStaff: true });
  });
  socket.on("disconnect", () => setConn(false));
  socket.on("submission_pending", (s) => {
    addSubmissionToThread(s);
    renderQuestList();
    if (openQuestId === s.questId) renderQuestDetail(s.id);
    toast("Nova submissão: " + (s.teamName || s.teamId) + (s.questTitle ? " — " + s.questTitle : ""), "amber");
  });
  socket.on("player_location", (p) => {
    liveLocations.set(p.userId, p);
    if (map) upsertMarker(p);
    const empty = $("liveMapEmpty");
    if (empty) empty.classList.toggle("hidden", liveLocations.size > 0);
  });
}

/* =====================================================================
   QUESTS TAB — an "inbox" of quests; open one to see its conversation.
   Keeping only one quest's approve/reject buttons visible at a time avoids
   mis-approving the wrong quest while scrolling a long flat list.
   ===================================================================== */

async function refreshPending() {
  const r = await api("GET", `/api/staff/submissions?roomId=${session.roomId}`);
  if (!r.ok) return toast("Erro a obter submissões.", "rust");
  questThreads.clear();
  (r.body || []).forEach((s) => addSubmissionToThread(s));
  renderQuestList();
  if (openQuestId) renderQuestDetail();
}
$("refreshQuestsBtn").addEventListener("click", () => { refreshPending(); refreshTeams(); });

function addSubmissionToThread(s) {
  let thread = questThreads.get(s.questId);
  if (!thread) {
    thread = { questId: s.questId, questTitle: s.questTitle || s.questId, items: new Map() };
    questThreads.set(s.questId, thread);
  }
  thread.items.set(s.id, s);
  return thread;
}

function buildQuestSummary(questId) {
  const thread = questThreads.get(questId);
  const rosterEntry = questCatalog.get(questId);
  const pendingCount = thread ? thread.items.size : 0;
  const questTitle = thread?.questTitle || rosterEntry?.questTitle || questId;
  let subtitle = pendingCount ? `${pendingCount} por rever` : "sem pendentes";
  if (rosterEntry) subtitle += ` · ${rosterEntry.teamStatuses.length} equipa(s) atribuída(s)`;
  return { questId, questTitle, pendingCount, rosterEntry, thread, subtitle };
}

function renderQuestList() {
  const box = $("questList");
  if (!box) return;
  box.innerHTML = "";
  updateQuestsTabCount();

  const questIds = new Set([...questThreads.keys(), ...questCatalog.keys()]);
  const rows = [...questIds].map((id) => buildQuestSummary(id)).filter((q) => q.pendingCount > 0 || q.rosterEntry);

  if (!rows.length) { box.appendChild(el("div", { class: "list-empty" }, "Sem quests com atividade.")); return; }

  rows.sort((a, b) => b.pendingCount - a.pendingCount || a.questTitle.localeCompare(b.questTitle));
  rows.forEach((q) => box.appendChild(buildQuestRow(q)));
}

function buildQuestRow(q) {
  return el("div", { class: "quest-row", onclick: () => openQuest(q.questId) }, [
    el("div", { class: "avatar" }, initials(q.questTitle)),
    el("div", { class: "quest-row-body" }, [
      el("div", { class: "quest-row-title" }, q.questTitle),
      el("div", { class: "quest-row-sub" }, q.subtitle),
    ]),
    q.pendingCount ? el("div", { class: "unread" }, String(q.pendingCount)) : null,
    el("div", { class: "quest-row-chevron" }, "›"),
  ]);
}

function openQuest(questId) {
  openQuestId = questId;
  $("questListView").classList.add("hidden");
  $("questDetailView").classList.remove("hidden");
  renderQuestDetail();
}

$("backToQuestListBtn").addEventListener("click", () => {
  openQuestId = null;
  $("questDetailView").classList.add("hidden");
  $("questListView").classList.remove("hidden");
  renderQuestList();
});

function renderQuestDetail(highlightSubmissionId) {
  if (!openQuestId) return;
  const body = $("questDetailBody");
  body.innerHTML = "";
  const q = buildQuestSummary(openQuestId);

  const card = el("div", { class: "thread" });
  card.appendChild(el("div", { class: "thread-head" }, [
    el("h3", {}, q.questTitle),
    q.pendingCount ? el("span", { class: "badge amber" }, `${q.pendingCount} por rever`) : el("span", { class: "badge" }, "sem pendentes"),
  ]));

  if (q.pendingCount) {
    const msgs = el("div", { class: "thread-messages" });
    [...q.thread.items.values()]
      .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
      .forEach((s) => msgs.appendChild(buildMessage(s, q.thread, s.id === highlightSubmissionId)));
    card.appendChild(msgs);
  } else {
    card.appendChild(el("div", { class: "thread-empty" }, "Sem submissões pendentes nesta quest."));
  }

  if (q.rosterEntry && q.rosterEntry.teamStatuses.length) {
    card.appendChild(el("div", { class: "muted mono", style: "font-size:0.68rem; margin:10px 0 4px;" }, "equipas atribuídas"));
    const pills = el("div", { style: "display:flex; flex-wrap:wrap; gap:6px;" });
    q.rosterEntry.teamStatuses.forEach((ts) => {
      pills.appendChild(el("span", { class: "badge " + statusBadgeClass(ts.status) }, `${ts.teamName} · ${ts.status}`));
    });
    card.appendChild(pills);
  }

  body.appendChild(card);
}

function buildMessage(s, thread, highlight) {
  const teamName = s.teamName || s.teamId;
  const time = s.createdAt ? new Date(s.createdAt).toLocaleTimeString() : "";

  const bubble = el("div", { class: "bubble" }, [
    el("div", { class: "bubble-head" }, [
      el("span", { class: "team" }, teamName),
      el("span", { class: "badge" }, s.challengeType),
    ]),
    time ? el("div", { class: "time" }, time) : null,
    el("div", { class: "media-box", style: "margin-top:8px;" }, renderMedia(s.content)),
    el("div", { class: "bubble-actions" }, [
      el("button", { class: "small moss", onclick: () => resolveMessage(s, "APPROVED", thread, msgEl) }, "aprovar"),
      el("button", { class: "small rust", onclick: () => resolveMessage(s, "REJECTED", thread, msgEl) }, "recusar"),
    ]),
  ]);

  const msgEl = el("div", { class: "msg" + (highlight ? " new-arrival" : "") }, [
    el("div", { class: "avatar" }, initials(teamName)),
    bubble,
  ]);
  return msgEl;
}

async function resolveMessage(s, status, thread, msgEl) {
  const r = await api("POST", `/api/staff/submissions/${s.id}/validate`, { status, validatorId: session.userId });
  if (r.status === 409) return toast("Já foi validada por outro membro da staff.", "rust");
  if (!r.ok) return toast("Erro a validar: " + (r.body?.error || r.status), "rust");

  toast(status === "APPROVED" ? "Aprovado!" : "Recusado.", status === "APPROVED" ? "moss" : "rust");
  thread.items.delete(s.id);
  msgEl.classList.add("leaving");
  setTimeout(() => {
    renderQuestList();
    if (openQuestId === s.questId) renderQuestDetail();
  }, 220);
  refreshTeams(); // keeps the scoreboard + "equipas atribuídas" status fresh right after a score changes
}

function updateQuestsTabCount() {
  let total = 0;
  questThreads.forEach((t) => (total += t.items.size));
  $("tabCountQuests").textContent = total ? String(total) : "";
}

// Derives, per quest, which teams are assigned to it and how far along they
// are — "a caminho" / "chegou" / "quest ativa" / "concluída". Needs
// team.track.waypoints (with nested quest.title) from GET /api/rooms/:roomId.
function buildQuestCatalog(teams) {
  const catalog = new Map();
  teams.forEach((t) => {
    const waypoints = t.track?.waypoints || [];
    waypoints.forEach((wp) => {
      const questId = wp.questId;
      const questTitle = wp.quest?.title || questId;
      if (!catalog.has(questId)) catalog.set(questId, { questTitle, teamStatuses: [] });

      let status = "a caminho";
      if (t.currentSeqNum > wp.sequenceOrder) status = "concluída";
      else if (t.currentSeqNum === wp.sequenceOrder) status = t.activeQuestId === questId ? "quest ativa" : "chegou";

      catalog.get(questId).teamStatuses.push({ teamId: t.id, teamName: t.name, status });
    });
  });
  questCatalog = catalog;
}

function statusBadgeClass(status) {
  if (status === "concluída") return "moss";
  if (status === "quest ativa" || status === "chegou") return "amber";
  return "";
}

/* =====================================================================
   TEAMS TAB — search + drag-and-drop (with tap-to-move fallback for touch)
   Moves a player using PUT /api/teams/swap-member.
   ===================================================================== */

async function refreshTeams() {
  const r = await api("GET", `/api/rooms/${session.roomId}`);
  if (!r.ok) return toast("Erro a obter equipas.", "rust");
  lastTeams = r.body.teams || [];
  renderTeamsBoard($("teamSearchInput").value.trim().toLowerCase());
  buildQuestCatalog(lastTeams);
  renderQuestList();
  if (openQuestId) renderQuestDetail();
  renderScoreboard();
}
$("refreshTeamsBtn").addEventListener("click", refreshTeams);
$("teamSearchInput").addEventListener("input", (e) => renderTeamsBoard(e.target.value.trim().toLowerCase()));

function renderTeamsBoard(filter) {
  const board = $("teamsBoard");
  board.innerHTML = "";
  selectedMember = null;

  if (!lastTeams.length) { board.appendChild(el("div", { class: "list-empty" }, "Sem equipas.")); return; }

  lastTeams.forEach((t) => {
    const members = t.members || [];
    const teamMatches = filter && t.name.toLowerCase().includes(filter);
    const matchingMemberIds = new Set(
      members.filter((m) => m.user.username.toLowerCase().includes(filter || "\u0000")).map((m) => m.user.id)
    );
    const teamHasAnyMatch = !filter || teamMatches || matchingMemberIds.size > 0;

    const memberList = el("div", { class: "member-list" });
    if (!members.length) {
      memberList.appendChild(el("div", { class: "member-empty" }, "sem jogadores"));
    } else {
      members.forEach((m) => {
        const dim = filter && !teamMatches && !matchingMemberIds.has(m.user.id);
        memberList.appendChild(buildChip(m.user, t.id, dim));
      });
    }

    const col = el("div", { class: "team-col" + (filter && !teamHasAnyMatch ? " dimmed" : ""), "data-team-id": t.id }, [
      el("div", { class: "team-col-head" }, [
        el("h3", {}, t.name),
        el("span", { class: "badge amber" }, `${t.totalScore || 0} pts`),
      ]),
      el("div", { class: "muted mono", style: "font-size:0.72rem; margin-bottom:8px;" }, `seq ${t.currentSeqNum ?? 0}`),
      memberList,
    ]);

    wireDropTarget(col, t.id);
    board.appendChild(col);
  });
}

function buildChip(user, teamId, dim) {
  const chip = el("div", {
    class: "member-chip" + (dim ? " dimmed" : ""),
    draggable: "true",
    "data-user-id": user.id,
    "data-from-team": teamId,
  }, [
    el("span", { class: "avatar" }, initials(user.username)),
    el("span", {}, user.username),
  ]);

  chip.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", JSON.stringify({ userId: user.id, fromTeamId: teamId }));
    chip.classList.add("dragging");
  });
  chip.addEventListener("dragend", () => chip.classList.remove("dragging"));

  // Touch / click fallback: tap a chip to select it, then tap a team column to move it there.
  chip.addEventListener("click", (e) => {
    e.stopPropagation();
    if (selectedMember && selectedMember.userId === user.id) {
      selectedMember.chipEl.classList.remove("selected");
      selectedMember = null;
      return;
    }
    if (selectedMember) selectedMember.chipEl.classList.remove("selected");
    selectedMember = { userId: user.id, fromTeamId: teamId, chipEl: chip };
    chip.classList.add("selected");
    toast("Selecionado " + user.username + " — toca na equipa de destino.", "amber");
  });

  return chip;
}

function wireDropTarget(col, teamId) {
  col.addEventListener("dragover", (e) => { e.preventDefault(); col.classList.add("drop-hover"); });
  col.addEventListener("dragleave", () => col.classList.remove("drop-hover"));
  col.addEventListener("drop", (e) => {
    e.preventDefault();
    col.classList.remove("drop-hover");
    let payload;
    try { payload = JSON.parse(e.dataTransfer.getData("text/plain")); } catch (_) { return; }
    if (!payload || payload.fromTeamId === teamId) return;
    moveMember(payload.userId, payload.fromTeamId, teamId);
  });

  // Tap-to-move fallback: tapping the column background (not a chip) with a selection active.
  col.addEventListener("click", () => {
    if (!selectedMember) return;
    if (selectedMember.fromTeamId === teamId) {
      selectedMember.chipEl.classList.remove("selected");
      selectedMember = null;
      return;
    }
    moveMember(selectedMember.userId, selectedMember.fromTeamId, teamId);
  });
}

async function moveMember(userId, fromTeamId, toTeamId) {
  const r = await api("PUT", "/api/teams/swap-member", { userId, fromTeamId, toTeamId });
  if (!r.ok) return toast("Erro a mover jogador: " + (r.body?.error || r.status), "rust");
  toast("Jogador movido.", "moss");
  selectedMember = null;
  refreshTeams();
}

/* =====================================================================
   AO VIVO — real Leaflet map of player positions + a live scoreboard.
   ===================================================================== */

function ensureMap() {
  if (map) { setTimeout(() => map.invalidateSize(), 50); return; }
  map = L.map("liveMap").setView([20, 0], 2);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap",
  }).addTo(map);
  liveLocations.forEach((p) => upsertMarker(p));
  fitMapToMarkers();
  setTimeout(() => map.invalidateSize(), 50);
}

function upsertMarker(p) {
  const team = lastTeams.find((t) => t.id === p.teamId);
  const label = team ? team.name : (p.teamId || "").slice(0, 8);
  const popupHtml = `<b>${label}</b><br>${new Date(p.at).toLocaleTimeString()}`;
  if (markers.has(p.userId)) {
    markers.get(p.userId).setLatLng([p.lat, p.lng]).setPopupContent(popupHtml);
  } else {
    const marker = L.marker([p.lat, p.lng]).addTo(map).bindPopup(popupHtml);
    markers.set(p.userId, marker);
  }
}

function fitMapToMarkers() {
  if (!markers.size) return;
  const group = L.featureGroup([...markers.values()]);
  map.fitBounds(group.getBounds().pad(0.3));
}

function renderLive() {
  const empty = $("liveMapEmpty");
  if (empty) empty.classList.toggle("hidden", liveLocations.size > 0);
  renderScoreboard();
}
$("refreshLiveBtn").addEventListener("click", () => { refreshTeams(); renderLive(); });

function renderScoreboard() {
  const box = $("scoreboard");
  if (!box) return;
  box.innerHTML = "";
  if (!lastTeams.length) { box.appendChild(el("div", { class: "list-empty" }, "Sem equipas.")); return; }

  [...lastTeams]
    .sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0))
    .forEach((t, i) => {
      const rank = i + 1;
      box.appendChild(el("div", { class: "score-row rank-" + rank }, [
        el("div", { class: "score-rank" }, "#" + rank),
        el("div", { class: "score-name" }, t.name),
        el("div", { class: "score-points mono" }, `${t.totalScore || 0} pts`),
      ]));
    });
}

// ---------------- boot ----------------
initSettings();
if (session) enterDashboard();
