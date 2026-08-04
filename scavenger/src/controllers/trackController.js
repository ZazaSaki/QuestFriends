import prisma from "../prisma.js";

/** Validate a waypoints array; returns an error string or null. */
function validateWaypoints(waypoints) {
  if (waypoints !== undefined && !Array.isArray(waypoints)) {
    return "waypoints must be an array";
  }
  for (const wp of waypoints ?? []) {
    if (
      !wp ||
      !wp.questId ||
      wp.sequenceOrder === undefined ||
      wp.latitude === undefined ||
      wp.longitude === undefined
    ) {
      return "each waypoint requires questId, sequenceOrder, latitude and longitude";
    }
  }
  return null;
}

const waypointData = (wp) => ({
  questId: wp.questId,
  sequenceOrder: wp.sequenceOrder,
  latitude: wp.latitude,
  longitude: wp.longitude,
  radius: wp.radius ?? undefined,
});

/**
 * POST /api/tracks
 * Body: {
 *   gameId, name,
 *   waypoints?: [{ questId, sequenceOrder, latitude, longitude, radius? }]
 * }
 * Creates a track and (optionally) its waypoints in one call.
 */
export async function createTrack(req, res, next) {
  try {
    const { gameId, name, waypoints } = req.body;
    if (!gameId || !name) {
      return res.status(400).json({ error: "gameId and name are required" });
    }

    const invalid = validateWaypoints(waypoints);
    if (invalid) return res.status(400).json({ error: invalid });

    const track = await prisma.track.create({
      data: {
        gameId,
        name,
        waypoints: {
          create: (waypoints ?? []).map(waypointData),
        },
      },
      include: { waypoints: true },
    });

    res.status(201).json(track);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/tracks/:trackId/waypoints
 * Body: { waypoints: [{ questId, sequenceOrder, latitude, longitude, radius? }] }
 * Appends waypoints to an existing track (e.g. attach quests to a team's route
 * after the room/teams were already created).
 */
export async function appendWaypoints(req, res, next) {
  try {
    const { trackId } = req.params;
    const { waypoints } = req.body;

    if (!Array.isArray(waypoints) || waypoints.length === 0) {
      return res.status(400).json({ error: "waypoints must be a non-empty array" });
    }
    const invalid = validateWaypoints(waypoints);
    if (invalid) return res.status(400).json({ error: invalid });

    const track = await prisma.track.findUnique({ where: { id: trackId } });
    if (!track) return res.status(404).json({ error: "Track not found" });

    const created = await prisma.$transaction(
      waypoints.map((wp) =>
        prisma.trackWaypoint.create({ data: { trackId, ...waypointData(wp) } })
      )
    );

    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
}
