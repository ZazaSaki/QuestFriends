/* Shared helpers */

// Set by /config.js (injected server-side from PUBLIC_BACKEND_URL). Falls back
// to localhost for the case where the file is opened directly, with no server.
const DEFAULT_API_BASE = window.__DEFAULT_API_BASE__ || "http://localhost:9101";

function getApiBase() {
  return localStorage.getItem("scavenger_api_base") || DEFAULT_API_BASE;
}
function setApiBase(url) {
  localStorage.setItem("scavenger_api_base", url.replace(/\/+$/, ""));
}

// Wire up the little settings drawer that's identical on every page.
function initSettings() {
  const toggle = document.getElementById("settingsToggle");
  const panel = document.getElementById("settingsPanel");
  const input = document.getElementById("apiBaseInput");
  if (!toggle || !panel || !input) return;
  input.value = getApiBase();
  toggle.addEventListener("click", () => panel.classList.toggle("hidden"));
  input.addEventListener("change", () => {
    setApiBase(input.value.trim() || DEFAULT_API_BASE);
    toast("Backend URL guardado: " + getApiBase(), "moss");
  });
}

async function api(method, path, body) {
  const res = await fetch(getApiBase() + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch (_) { /* no body */ }
  return { status: res.status, ok: res.ok, body: data };
}

function connectSocket() {
  // Loaded globally via the socket.io CDN script tag in each page.
  return io(getApiBase(), { transports: ["websocket"] });
}

// ---- toasts ----
function toast(msg, kind) {
  let area = document.querySelector(".toast-area");
  if (!area) {
    area = document.createElement("div");
    area.className = "toast-area";
    document.body.appendChild(area);
  }
  const el = document.createElement("div");
  el.className = "toast" + (kind ? " " + kind : "");
  el.textContent = msg;
  area.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

// ---- small local "session" store per role, so a reload doesn't lose you ----
function saveSession(key, obj) {
  localStorage.setItem(key, JSON.stringify(obj));
}
function loadSession(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch (_) { return null; }
}
function clearSession(key) {
  localStorage.removeItem(key);
}

// ---- geolocation ----
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fmtCoord(n) {
  return typeof n === "number" ? n.toFixed(5) : "—";
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c == null) return;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  });
  return node;
}
