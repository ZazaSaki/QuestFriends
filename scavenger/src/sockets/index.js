import { haversineMeters } from "../utils/haversine.js";
import { getCurrentWaypoint } from "../utils/team.js";

// Socket.io room-name helpers (kept consistent across REST controllers too).
export const roomChannel = (roomId) => `room:${roomId}`;
export const teamChannel = (teamId) => `team:${teamId}`;
export const staffChannel = (roomId) => `staff:${roomId}`;

/**
 * Register all Socket.io connection handlers.
 */
export function registerSocketHandlers(io) {
  io.on("connection", (socket) => {
    console.log(`[socket] connected: ${socket.id}`);

    /**
     * Join the relevant rooms for this client.
     * { roomId, teamId?, isStaff? }
     *  - everyone joins the room-wide channel (game_started broadcasts)
     *  - staff additionally join the staff channel (live player tracking)
     *  - players join their team channel (at_location / validation_result)
     */
    socket.on("join_room", ({ roomId, teamId, isStaff }) => {
      if (roomId) socket.join(roomChannel(roomId));
      if (isStaff && roomId) socket.join(staffChannel(roomId));
      if (teamId) socket.join(teamChannel(teamId));
      socket.emit("joined", { roomId, teamId, isStaff: !!isStaff });
    });

    /**
     * Live location ping from a player.
     * { userId, teamId, lat, lng }
     *  1. Broadcast to the staff room so managers can track players live.
     *  2. Look up the team's current waypoint.
     *  3. Haversine distance vs the waypoint radius.
     *  4. If within radius, emit `at_location` back to the team.
     */
    socket.on("player_location_update", async ({ userId, teamId, lat, lng }) => {
      try {
        if (!teamId || typeof lat !== "number" || typeof lng !== "number") return;

        const result = await getCurrentWaypoint(teamId);
        if (!result) return;
        const { team, waypoint } = result;

        // 1. Broadcast raw location to staff for live tracking.
        io.to(staffChannel(team.roomId)).emit("player_location", {
          userId,
          teamId,
          lat,
          lng,
          at: Date.now(),
        });

        if (!waypoint) return; // team finished its track — nothing to geofence

        // 3. Distance to the current waypoint.
        const distance = haversineMeters(
          lat,
          lng,
          waypoint.latitude,
          waypoint.longitude
        );

        // 4. Inside the activation radius → notify the team.
        if (distance <= waypoint.radius) {
          io.to(teamChannel(teamId)).emit("at_location", {
            teamId,
            sequenceOrder: waypoint.sequenceOrder,
            distance,
            openChallengeType: waypoint.quest?.openChallengeType,
          });
        }
      } catch (err) {
        console.error("[socket] player_location_update error:", err);
      }
    });

    socket.on("disconnect", () => {
      console.log(`[socket] disconnected: ${socket.id}`);
    });
  });
}
