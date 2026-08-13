import Icon from '../components/Icon';
import { useDeviceOrientation } from '../hooks/useDeviceOrientation';
import { bearingTo, formatDistance, distanceUnit } from '../lib/geo';

/**
 * Converted from baseline/stitch_quest_expedition_ui/compass_overlay (+ _dark).
 *
 * The mock rotated the arrow by raw `deviceorientation.alpha`, which points the
 * needle at magnetic north rather than at the quest. Here the arrow points at
 * the waypoint: rotation = bearing(player → target) − device heading. With no
 * magnetometer we fall back to bearing alone (arrow relative to true north).
 *
 * The glyph is drawn `-rotate-45` in the mock because the Material `navigation`
 * icon already points up; that offset is dropped so 0° means "straight ahead".
 */
export default function CompassOverlay({ coords, target, distance, geoError, onClose }) {
  const { heading, needsPermission, granted, requestAccess } = useDeviceOrientation(true);

  const bearing =
    coords && target
      ? bearingTo(coords.latitude, coords.longitude, target.latitude, target.longitude)
      : null;

  const rotation = bearing == null ? null : (bearing - (heading ?? 0) + 360) % 360;
  const arrived = distance != null && target?.radius != null && distance <= target.radius;

  return (
    <div className="fixed inset-0 z-40 bg-background/90 dark:bg-[#1a1a1a]/95 backdrop-blur-sm flex flex-col justify-center items-center px-container-margin">
      <div className="flex flex-col items-center justify-center space-y-stack-lg flex-grow">
        <div
          className={`relative w-48 h-48 flex items-center justify-center${arrived ? ' animate-pulse' : ''}`}
        >
          <div className="absolute inset-0 border-4 border-primary/10 dark:border-white/10 rounded-full" />
          <div className="absolute inset-4 border-2 border-primary/20 dark:border-white/20 rounded-full" />
          <Icon
            name={arrived ? 'check_circle' : 'navigation'}
            fill
            className="text-primary dark:text-primary-fixed transition-transform duration-500 ease-out"
            style={{
              fontSize: '120px',
              transform: rotation == null ? undefined : `rotate(${rotation}deg)`,
            }}
          />
        </div>

        <div className="text-center">
          <h1 className="font-headline-xl text-headline-xl text-primary dark:text-primary-fixed mb-stack-sm tracking-tight">
            {formatDistance(distance)}
          </h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant uppercase tracking-widest font-semibold">
            {arrived ? 'You have arrived' : distanceUnit(distance)}
          </p>

          {geoError && (
            <p className="font-label-sm text-label-sm text-error dark:text-error-container mt-stack-md max-w-[280px] mx-auto">
              {geoError}
            </p>
          )}
          {!geoError && heading == null && (
            <p className="font-label-sm text-label-sm text-on-surface-variant mt-stack-md max-w-[280px] mx-auto">
              {needsPermission && !granted
                ? 'Tap below to let the compass use the device heading.'
                : 'No compass on this device — the arrow points relative to north.'}
            </p>
          )}
        </div>
      </div>

      <div className="w-full max-w-sm pb-[100px] space-y-stack-sm">
        {needsPermission && !granted && (
          <button
            type="button"
            onClick={requestAccess}
            className="w-full py-4 border-2 border-primary dark:border-primary-fixed-dim text-primary dark:text-primary-fixed rounded-3xl font-label-md text-label-md uppercase active:scale-95 transition-transform duration-200"
          >
            Enable Compass
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="w-full py-4 bg-primary-container text-on-primary rounded-3xl font-label-md text-label-md uppercase shadow-lg hover:bg-primary transition-colors active:scale-95 duration-200"
        >
          Close Compass
        </button>
      </div>
    </div>
  );
}
