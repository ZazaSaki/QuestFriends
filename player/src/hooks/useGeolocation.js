import { useEffect, useRef, useState } from 'react';

const DEFAULT_OPTIONS = {
  // The quest geofences are tens of metres wide — coarse network positioning is
  // not good enough, so we pay the battery cost for real GPS.
  enableHighAccuracy: true,
  maximumAge: 4000,
  timeout: 15000,
};

/**
 * Continuous GPS tracking via `navigator.geolocation.watchPosition`.
 *
 * @param {boolean} active  Pass false to release the GPS (e.g. once the quest is
 *                          unlocked and the player is standing still reading it).
 * @returns {{ coords: {latitude:number,longitude:number}|null, accuracy: number|null,
 *             timestamp: number|null, error: string|null, supported: boolean }}
 */
export function useGeolocation(active = true, options = DEFAULT_OPTIONS) {
  const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator;
  const [state, setState] = useState({
    coords: null,
    accuracy: null,
    timestamp: null,
    error: null,
  });

  // Keep the latest options without re-subscribing on every render.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!active) return undefined;
    if (!supported) {
      setState((s) => ({ ...s, error: 'Geolocation is not supported on this device.' }));
      return undefined;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) =>
        setState({
          coords: { latitude: pos.coords.latitude, longitude: pos.coords.longitude },
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
          error: null,
        }),
      (err) =>
        setState((s) => ({
          ...s,
          error:
            err.code === err.PERMISSION_DENIED
              ? 'Location permission denied — enable it in your browser settings.'
              : err.message || 'Could not get your location.',
        })),
      optionsRef.current
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [active, supported]);

  return { ...state, supported };
}
