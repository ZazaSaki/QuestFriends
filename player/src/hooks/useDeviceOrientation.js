import { useCallback, useEffect, useState } from 'react';

const needsPermission =
  typeof DeviceOrientationEvent !== 'undefined' &&
  typeof DeviceOrientationEvent.requestPermission === 'function';

/**
 * Compass heading in degrees clockwise from north, or null when the device has
 * no magnetometer / the user has not granted access.
 *
 * iOS 13+ requires `DeviceOrientationEvent.requestPermission()` from inside a
 * user gesture, so the hook exposes `requestAccess` for the compass overlay to
 * call on tap; Android fires events immediately and `granted` starts true.
 */
export function useDeviceOrientation(active = true) {
  const [heading, setHeading] = useState(null);
  const [granted, setGranted] = useState(!needsPermission);

  const requestAccess = useCallback(async () => {
    if (!needsPermission) return true;
    try {
      const result = await DeviceOrientationEvent.requestPermission();
      const ok = result === 'granted';
      setGranted(ok);
      return ok;
    } catch {
      setGranted(false);
      return false;
    }
  }, []);

  useEffect(() => {
    if (!active || !granted || typeof window === 'undefined') return undefined;

    const onOrientation = (e) => {
      // iOS exposes a true-north heading directly; elsewhere `alpha` is degrees
      // counter-clockwise from north, so it has to be inverted.
      if (typeof e.webkitCompassHeading === 'number') setHeading(e.webkitCompassHeading);
      else if (typeof e.alpha === 'number') setHeading((360 - e.alpha) % 360);
    };

    window.addEventListener('deviceorientationabsolute', onOrientation, true);
    window.addEventListener('deviceorientation', onOrientation, true);
    return () => {
      window.removeEventListener('deviceorientationabsolute', onOrientation, true);
      window.removeEventListener('deviceorientation', onOrientation, true);
    };
  }, [active, granted]);

  return { heading, granted, needsPermission, requestAccess };
}
