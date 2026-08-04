import { io } from "socket.io-client";

// In-container base URL for the backend (Docker service name). The browser
// dashboard uses the host-mapped URL instead (see dashboard.html).
export const BACKEND_HTTP = process.env.BACKEND_HTTP || "http://app:3000";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Thin fetch wrapper. Returns { status, ok, body } and never throws on non-2xx
 * (tests assert on status codes explicitly).
 */
export async function api(method, path, body) {
  const res = await fetch(`${BACKEND_HTTP}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let parsed = null;
  const text = await res.text();
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  return { status: res.status, ok: res.ok, body: parsed };
}

/** Poll GET /health until the backend answers (or time out). */
export async function waitForHealth(timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BACKEND_HTTP}/health`);
      if (res.ok) return true;
    } catch {
      /* backend not up yet */
    }
    await sleep(1000);
  }
  throw new Error(`Backend not healthy at ${BACKEND_HTTP} after ${timeoutMs}ms`);
}

/** Open a fresh Socket.io connection and resolve once connected. */
export function connectSocket() {
  return new Promise((resolve, reject) => {
    const socket = io(BACKEND_HTTP, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
    });
    const t = setTimeout(() => reject(new Error("socket connect timeout")), 8000);
    socket.on("connect", () => {
      clearTimeout(t);
      resolve(socket);
    });
    socket.on("connect_error", (e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

/**
 * Resolve with the payload of the next `event` on `socket`, or reject on
 * timeout. Use BEFORE triggering the action, then await it.
 */
export function waitForEvent(socket, event, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`timeout waiting for "${event}"`)),
      timeoutMs
    );
    socket.once(event, (payload) => {
      clearTimeout(t);
      resolve(payload);
    });
  });
}

/** Assert helper — throws on falsy with a message. */
export function assert(cond, message) {
  if (!cond) throw new Error(message || "assertion failed");
}

export function assertEqual(actual, expected, label = "value") {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

// --- Tiny test harness (shared counters) ---
export const results = { passed: 0, failed: 0, names: [] };

export async function runTest(name, fn) {
  try {
    await fn();
    results.passed += 1;
    console.log(`  ✔ PASS  ${name}`);
    return true;
  } catch (err) {
    results.failed += 1;
    results.names.push(name);
    console.log(`  ✘ FAIL  ${name}`);
    console.log(`          ${err.message}`);
    return false;
  }
}

export function summary() {
  const total = results.passed + results.failed;
  console.log("\n" + "=".repeat(52));
  console.log(`  RESULTS: ${results.passed}/${total} passed, ${results.failed} failed`);
  if (results.failed > 0) {
    console.log("  Failed: " + results.names.join(", "));
  }
  console.log("=".repeat(52) + "\n");
  return results.failed === 0;
}
