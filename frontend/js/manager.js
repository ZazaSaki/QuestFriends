const SESSION_KEY = "scavenger_manager_session";

let state = loadSession(SESSION_KEY) || {
  manager: null,
  game: null,
  quests: [],
  tracks: [], // { id, name, waypointCount }
  room: null,
};

function persist() { saveSession(SESSION_KEY, state); }

function markDone(stepId) { document.getElementById(stepId).classList.add("done"); document.getElementById(stepId).classList.remove("active"); }
function markActive(stepId) { document.getElementById(stepId).classList.add("active"); }

// ---------------- Step 1: identity + game ----------------
document.getElementById("createGameBtn").addEventListener("click", async () => {
  const username = document.getElementById("mgrUsername").value.trim();
  const title = document.getElementById("gameTitle").value.trim();
  if (!username || !title) return toast("Preenche o nome e o título do jogo.", "rust");

  const u = await api("POST", "/api/users", { username, role: "MANAGER" });
  if (!u.ok) return toast("Erro a criar utilizador: " + (u.body?.error || u.status), "rust");
  state.manager = u.body;

  const g = await api("POST", "/api/games", {
    title,
    creatorId: state.manager.id,
    introduction: { text: document.getElementById("gameIntro").value.trim() || undefined },
    conclusion: { text: document.getElementById("gameConclusion").value.trim() || undefined },
  });
  if (!g.ok) return toast("Erro a criar jogo: " + (g.body?.error || g.status), "rust");
  state.game = g.body;
  persist();
  toast("Jogo criado: " + state.game.title, "moss");
  markDone("step1");
  document.getElementById("addQuestBtn").disabled = false;
  document.getElementById("addTrackBtn").disabled = false;
  markActive("step2");
});

// ---------------- Step 2: quests ----------------
document.getElementById("qOpenType").addEventListener("change", (e) => {
  document.getElementById("qOpenValueWrap").classList.toggle("hidden", e.target.value === "NONE");
});
document.getElementById("qChallengeType").addEventListener("change", (e) => {
  document.getElementById("qAnswerWrap").classList.toggle("hidden", e.target.value !== "QUIZ");
});

document.getElementById("addQuestBtn").addEventListener("click", async () => {
  if (!state.game) return toast("Cria o jogo primeiro.", "rust");
  const title = document.getElementById("qTitle").value.trim();
  const score = Number(document.getElementById("qScore").value || 10);
  const openChallengeType = document.getElementById("qOpenType").value;
  const openChallengeValue = document.getElementById("qOpenValue").value.trim();
  const challengeType = document.getElementById("qChallengeType").value;
  const description = document.getElementById("qDescription").value.trim();
  const answer = document.getElementById("qAnswer").value.trim();
  const rewardText = document.getElementById("qReward").value.trim();

  if (!title || !description) return toast("Título e descrição são obrigatórios.", "rust");
  if (openChallengeType !== "NONE" && !openChallengeValue) return toast("Falta o valor do QR/palavra-passe.", "rust");

  const content = { description };
  if (challengeType === "QUIZ" && answer) content.answer = answer;

  const payload = {
    gameId: state.game.id,
    title, score,
    openChallengeType,
    challengeType,
    content,
  };
  if (openChallengeType !== "NONE") payload.openChallengeValue = openChallengeValue;
  if (rewardText) payload.postChallengeContent = { reward: rewardText };

  const r = await api("POST", "/api/quests", payload);
  if (!r.ok) return toast("Erro a criar quest: " + (r.body?.error || r.status), "rust");

  state.quests.push(r.body);
  persist();
  renderQuests();
  toast("Quest adicionada: " + r.body.title, "moss");

  ["qTitle", "qOpenValue", "qDescription", "qAnswer", "qReward"].forEach((id) => document.getElementById(id).value = "");
  document.getElementById("qScore").value = 10;

  markActive("step3");
});

function renderQuests() {
  const box = document.getElementById("questList");
  box.innerHTML = "";
  if (!state.quests.length) { box.appendChild(el("div", { class: "list-empty" }, "Ainda sem quests.")); return; }
  state.quests.forEach((q, i) => {
    box.appendChild(el("div", { class: "card dashed" }, [
      el("div", { class: "card-head" }, [
        el("h3", {}, `${i + 1}. ${q.title}`),
        el("span", { class: "badge amber" }, `${q.score} pts`),
      ]),
      el("div", { class: "muted mono", style: "font-size:0.75rem;" }, `abre: ${q.openChallengeType} · aprova: ${q.challengeType} · id: ${q.id.slice(0, 8)}…`),
    ]));
  });
}

// ---------------- Step 3: tracks & waypoints ----------------
document.getElementById("addTrackBtn").addEventListener("click", async () => {
  if (!state.game) return toast("Cria o jogo primeiro.", "rust");
  const name = document.getElementById("trackName").value.trim();
  if (!name) return toast("Dá um nome à track.", "rust");
  const r = await api("POST", "/api/tracks", { gameId: state.game.id, name });
  if (!r.ok) return toast("Erro a criar track: " + (r.body?.error || r.status), "rust");
  state.tracks.push({ id: r.body.id, name: r.body.name, waypoints: [] });
  persist();
  document.getElementById("trackName").value = "";
  renderTracks();
  toast("Track criada: " + name, "moss");
  document.getElementById("openRoomBtn").disabled = false;
  markActive("step4");
});

function renderTracks() {
  const box = document.getElementById("trackList");
  box.innerHTML = "";
  if (!state.tracks.length) { box.appendChild(el("div", { class: "list-empty" }, "Ainda sem tracks.")); return; }

  state.tracks.forEach((t) => {
    const questOptions = state.quests.map((q) => el("option", { value: q.id }, q.title));
    const select = el("select", {}, questOptions.length ? questOptions : [el("option", { value: "" }, "sem quests ainda")]);
    const seqInput = el("input", { type: "number", value: String(t.waypoints.length + 1), style: "width:70px;" });
    const latInput = el("input", { type: "text", placeholder: "lat", style: "width:90px;" });
    const lngInput = el("input", { type: "text", placeholder: "lng", style: "width:90px;" });
    const radInput = el("input", { type: "number", placeholder: "raio(m)", value: "20", style: "width:80px;" });

    const useLocBtn = el("button", { class: "small secondary", type: "button", onclick: () => {
      if (!navigator.geolocation) return toast("Geolocalização não suportada neste browser.", "rust");
      navigator.geolocation.getCurrentPosition(
        (pos) => { latInput.value = pos.coords.latitude.toFixed(6); lngInput.value = pos.coords.longitude.toFixed(6); },
        () => toast("Não foi possível obter a localização.", "rust")
      );
    }}, "usar a minha localização");

    const addBtn = el("button", { class: "small moss", type: "button", onclick: async () => {
      const questId = select.value;
      const lat = parseFloat(latInput.value), lng = parseFloat(lngInput.value), radius = parseInt(radInput.value, 10);
      if (!questId) return toast("Escolhe uma quest.", "rust");
      if (Number.isNaN(lat) || Number.isNaN(lng)) return toast("Coordenadas inválidas.", "rust");
      const r = await api("POST", `/api/tracks/${t.id}/waypoints`, {
        waypoints: [{ questId, sequenceOrder: parseInt(seqInput.value, 10) || t.waypoints.length + 1, latitude: lat, longitude: lng, radius: radius || 20 }],
      });
      if (!r.ok) return toast("Erro a adicionar waypoint: " + (r.body?.error || r.status), "rust");
      t.waypoints.push({ questId, lat, lng });
      persist();
      renderTracks();
      toast("Waypoint adicionado à " + t.name, "moss");
    }}, "adicionar waypoint");

    box.appendChild(el("div", { class: "card dashed" }, [
      el("div", { class: "card-head" }, [el("h3", {}, t.name), el("span", { class: "badge" }, `${t.waypoints.length} waypoints`)]),
      el("div", { class: "row" }, [select, seqInput]),
      el("div", { class: "row", style: "margin-top:8px;" }, [latInput, lngInput, radInput]),
      el("div", { style: "margin-top:8px; display:flex; gap:8px; flex-wrap:wrap;" }, [useLocBtn, addBtn]),
    ]));
  });
}

// ---------------- Step 4: room ----------------
document.getElementById("openRoomBtn").addEventListener("click", async () => {
  if (!state.game) return toast("Cria o jogo primeiro.", "rust");
  const staffPassword = document.getElementById("roomPassword").value.trim();
  const r = await api("POST", "/api/rooms", { gameId: state.game.id, staffPassword: staffPassword || undefined });
  if (!r.ok) return toast("Erro a abrir sala: " + (r.body?.error || r.status), "rust");
  state.room = r.body;
  persist();
  markDone("step4");
  toast("Sala aberta: " + state.room.id, "moss");
  renderRoomInfo();
  document.getElementById("refreshRosterBtn").disabled = false;
  document.getElementById("startRoomBtn").disabled = false;
  markActive("step5");
  await refreshRoster();
});

function renderRoomInfo() {
  const box = document.getElementById("roomInfo");
  box.innerHTML = "";
  if (!state.room) return;
  box.appendChild(el("div", { class: "card" }, [
    el("div", { class: "eyebrow" }, "ID da sala (partilha com jogadores e staff)"),
    el("div", { class: "mono", style: "font-size:1.1rem; margin:4px 0 10px; word-break:break-all;" }, state.room.id),
    el("div", { class: "muted" }, `Equipas criadas automaticamente: ${(state.room.teams || []).map(t => t.name).join(", ")}`),
  ]));
}

// ---------------- Step 5: lobby ----------------
async function refreshRoster() {
  if (!state.room) return;
  const r = await api("GET", `/api/rooms/${state.room.id}`);
  if (!r.ok) return toast("Erro ao obter roster.", "rust");
  const box = document.getElementById("rosterBox");
  const teams = r.body.teams || [];
  if (!teams.length) { box.innerHTML = ""; box.className = "list-empty"; box.textContent = "Sem equipas."; return; }
  box.className = "";
  box.innerHTML = "";
  teams.forEach((t) => {
    const members = (t.members || []).map((m) => m.user.username);
    box.appendChild(el("div", { class: "card dashed" }, [
      el("div", { class: "card-head" }, [el("h3", {}, t.name), el("span", { class: "badge amber" }, `${t.totalScore || 0} pts`)]),
      el("div", { class: "muted mono", style: "font-size:0.78rem;" }, members.length ? "jogadores: " + members.join(", ") : "sem jogadores ainda"),
    ]));
  });
}
document.getElementById("refreshRosterBtn").addEventListener("click", refreshRoster);

document.getElementById("startRoomBtn").addEventListener("click", async () => {
  if (!state.room) return;
  const r = await api("POST", `/api/rooms/${state.room.id}/start`);
  if (!r.ok) return toast("Erro a iniciar: " + (r.body?.error || r.status), "rust");
  toast("Jogo iniciado! (game_started emitido)", "moss");
  markDone("step5");
});

// ---------------- boot ----------------
document.getElementById("resetBtn").addEventListener("click", () => {
  clearSession(SESSION_KEY);
  location.reload();
});

function hydrate() {
  if (state.manager) {
    document.getElementById("mgrUsername").value = state.manager.username;
  }
  if (state.game) {
    document.getElementById("gameTitle").value = state.game.title;
    markDone("step1");
    document.getElementById("addQuestBtn").disabled = false;
    document.getElementById("addTrackBtn").disabled = false;
    markActive("step2");
  }
  renderQuests();
  renderTracks();
  if (state.tracks.length) { document.getElementById("openRoomBtn").disabled = false; markActive("step4"); }
  if (state.room) {
    renderRoomInfo();
    document.getElementById("refreshRosterBtn").disabled = false;
    document.getElementById("startRoomBtn").disabled = false;
    markActive("step5");
    refreshRoster();
  }
}

initSettings();
hydrate();
