/**
 * Player join link for a room.
 *
 * The player SPA reads `?room=<id>` off the query string on boot, and its QR
 * scanner accepts either a full join URL or a bare room UUID. So when
 * VITE_PLAYER_URL is not configured we fall back to the bare id: still usable
 * from the player's in-app scanner, just not from a generic camera app.
 */
export function playerJoinUrl(roomId: string): string {
  const base = import.meta.env.VITE_PLAYER_URL?.trim();
  if (!base) return roomId;
  return `${base.replace(/\/+$/, '')}/?room=${encodeURIComponent(roomId)}`;
}

/** True when a real player origin is configured (i.e. the link is a URL). */
export const hasPlayerUrl = (): boolean => !!import.meta.env.VITE_PLAYER_URL?.trim();
