const toRad = (deg) => (deg * Math.PI) / 180;
const toDeg = (rad) => (rad * 180) / Math.PI;

const EARTH_RADIUS_M = 6371000;

/** Great-circle distance in metres — same formula the backend geofences with. */
export function haversineMeters(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Initial bearing from point 1 to point 2, in degrees clockwise from north. */
export function bearingTo(lat1, lon1, lat2, lon2) {
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Human-readable distance for the compass readout. */
export function formatDistance(meters) {
  if (meters == null || !Number.isFinite(meters)) return '—';
  if (meters >= 1000) return (meters / 1000).toFixed(1);
  return String(Math.round(meters));
}

export const distanceUnit = (meters) =>
  meters != null && meters >= 1000 ? 'Kilometers Away' : 'Meters Away';
