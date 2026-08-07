import { io, Socket } from 'socket.io-client';
import { API_BASE } from './api';

const SOCKET_BASE = import.meta.env.VITE_SOCKET_URL ?? API_BASE;

/**
 * Connect as staff and join a room's channels so the manager receives
 * `player_location`, `validation_result`, `submission_pending`, `room_closed`.
 * Also answers `room_ping` so the room janitor sees the monitor as alive.
 *
 * With an empty base the socket connects to the page's own origin (`io()`),
 * hitting `/socket.io` which nginx proxies to the backend — so it tunnels
 * cleanly through Cloudflare. WebSocket with a polling fallback for resilience.
 */
export function connectStaff(roomId: string): Socket {
  const opts = { transports: ['websocket', 'polling'], forceNew: true } as const;
  const socket = SOCKET_BASE ? io(SOCKET_BASE, opts) : io(opts);
  socket.on('connect', () => {
    socket.emit('join_room', { roomId, isStaff: true });
  });
  socket.on('room_ping', (_data: unknown, ack?: (v: unknown) => void) => {
    if (typeof ack === 'function') ack({ alive: true });
  });
  return socket;
}
