import { io } from 'socket.io-client';
import { API_BASE } from './api';

const SOCKET_BASE = import.meta.env.VITE_SOCKET_URL ?? API_BASE;

/**
 * Connect as a player and subscribe to this room's + team's channels, so the
 * device receives `game_started`, `quest_unlocked`, `at_location`,
 * `validation_result` and `room_closed`.
 *
 * With an empty base the socket connects to the page's own origin (`io()`),
 * hitting `/socket.io` which nginx proxies to the backend — so it tunnels
 * cleanly through Cloudflare. WebSocket with a polling fallback, because phones
 * roam between mobile networks mid-quest.
 *
 * `room_ping` MUST be acknowledged or the room janitor considers the room
 * abandoned and closes it (see scavenger/docs/websocket-events.md).
 */
export function connectPlayer({ roomId, teamId }) {
  const opts = { transports: ['websocket', 'polling'], forceNew: true };
  const socket = SOCKET_BASE ? io(SOCKET_BASE, opts) : io(opts);

  socket.on('connect', () => {
    socket.emit('join_room', { roomId, teamId, isStaff: false });
  });

  socket.on('room_ping', (_data, ack) => {
    if (typeof ack === 'function') ack({ alive: true });
  });

  return socket;
}
