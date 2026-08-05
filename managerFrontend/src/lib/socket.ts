import { io, Socket } from 'socket.io-client';
import { API_BASE } from './api';

const SOCKET_BASE = import.meta.env.VITE_SOCKET_URL ?? API_BASE;

/**
 * Connect as staff and join a room's channels so the manager receives
 * `player_location`, `validation_result`, `submission_pending`, `room_closed`.
 * Also answers `room_ping` so the room janitor sees the monitor as alive.
 */
export function connectStaff(roomId: string): Socket {
  const socket = io(SOCKET_BASE, { transports: ['websocket'], forceNew: true });
  socket.on('connect', () => {
    socket.emit('join_room', { roomId, isStaff: true });
  });
  socket.on('room_ping', (_data: unknown, ack?: (v: unknown) => void) => {
    if (typeof ack === 'function') ack({ alive: true });
  });
  return socket;
}
