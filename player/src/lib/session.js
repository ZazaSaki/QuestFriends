// The player's identity lives on the phone: a refresh (or a locked screen mid-
// quest) must not cost them their team. Shape:
// { userId, teamId, teamName, roomId, username }
const SESSION_KEY = 'scavenger_player_session';

export function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* private mode / quota — the app still works for this page load */
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}
