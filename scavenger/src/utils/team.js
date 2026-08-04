import prisma from "../prisma.js";

/**
 * Load a team together with the TrackWaypoint it is currently working on
 * (the waypoint on the team's track whose sequenceOrder === team.currentSeqNum),
 * including that waypoint's quest.
 *
 * Returns { team, waypoint } where `waypoint` (and `waypoint.quest`) may be null
 * if the team has finished its track. Returns null if the team does not exist.
 *
 * Shared by: play/next-coordinate, play/unlock-quest, play/submit, and the
 * player_location_update socket geofence.
 */
export async function getCurrentWaypoint(teamId) {
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) return null;

  const waypoint = await prisma.trackWaypoint.findUnique({
    where: {
      trackId_sequenceOrder: {
        trackId: team.trackId,
        sequenceOrder: team.currentSeqNum,
      },
    },
    include: { quest: true },
  });

  return { team, waypoint };
}
