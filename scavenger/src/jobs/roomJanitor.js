import prisma from "../prisma.js";
import { roomChannel } from "../sockets/index.js";

const num = (v, d) => (v !== undefined && v !== "" ? parseInt(v, 10) : d);

/**
 * Background room janitor. On an interval it:
 *
 *   1. EMPTY ROOMS — deletes rooms that never had a player join and are older
 *      than ROOM_GC_EMPTY_MINUTES (default 10). Hard delete (cascades teams).
 *
 *   2. ABANDONED ROOMS — for rooms older than ROOM_MAX_AGE_HOURS (default 3)
 *      that haven't been checked in the last ROOM_LIVENESS_RECHECK_MINUTES
 *      (default 60), it pings everyone in the room and waits for a reply
 *      (ping/pong, ROOM_LIVENESS_TIMEOUT_MS, default 5000):
 *        - a client replies  -> mark checked, re-check in ~1h.
 *        - nobody replies     -> end the room (status FINISHED) + notify.
 *
 * Disable entirely with ROOM_GC_ENABLED=false.
 */
export function startRoomJanitor(io) {
  if (process.env.ROOM_GC_ENABLED === "false") {
    console.log("[janitor] disabled (ROOM_GC_ENABLED=false)");
    return;
  }

  const cfg = {
    intervalMs: num(process.env.ROOM_GC_INTERVAL_MS, 60_000),
    emptyMin: num(process.env.ROOM_GC_EMPTY_MINUTES, 10),
    maxAgeHours: num(process.env.ROOM_MAX_AGE_HOURS, 3),
    recheckMin: num(process.env.ROOM_LIVENESS_RECHECK_MINUTES, 60),
    pingTimeoutMs: num(process.env.ROOM_LIVENESS_TIMEOUT_MS, 5_000),
  };

  const sweep = async () => {
    try {
      await cleanupEmptyRooms(io, cfg.emptyMin);
      await checkAbandonedRooms(io, cfg);
    } catch (err) {
      console.error("[janitor] sweep error:", err.message);
    }
  };

  setInterval(sweep, cfg.intervalMs);
  setTimeout(sweep, 5_000); // first pass shortly after boot
  console.log(
    `[janitor] started · every ${cfg.intervalMs}ms · empty>${cfg.emptyMin}m delete · age>${cfg.maxAgeHours}h ping, recheck ${cfg.recheckMin}m`
  );
}

/** Delete rooms with zero members that are older than `emptyMin` minutes. */
async function cleanupEmptyRooms(io, emptyMin) {
  const cutoff = new Date(Date.now() - emptyMin * 60_000);
  const rooms = await prisma.room.findMany({
    where: {
      status: { not: "FINISHED" },
      createdAt: { lt: cutoff },
      // every team has no members == nobody ever joined
      teams: { every: { members: { none: {} } } },
    },
    select: { id: true },
  });

  for (const room of rooms) {
    io.to(roomChannel(room.id)).emit("room_closed", {
      roomId: room.id,
      reason: "empty_timeout",
      at: Date.now(),
    });
    await prisma.room.delete({ where: { id: room.id } }); // cascades teams
    console.log(`[janitor] deleted empty room ${room.id}`);
  }
}

/** Ping long-lived rooms; end the ones nobody answers, reschedule the rest. */
async function checkAbandonedRooms(io, cfg) {
  const ageCutoff = new Date(Date.now() - cfg.maxAgeHours * 3_600_000);
  const recheckCutoff = new Date(Date.now() - cfg.recheckMin * 60_000);

  const rooms = await prisma.room.findMany({
    where: {
      status: { not: "FINISHED" },
      createdAt: { lt: ageCutoff },
      OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: recheckCutoff } }],
    },
    select: { id: true },
  });

  for (const room of rooms) {
    const alive = await pingRoom(io, room.id, cfg.pingTimeoutMs);
    if (alive) {
      await prisma.room.update({
        where: { id: room.id },
        data: { lastCheckedAt: new Date() },
      });
      console.log(`[janitor] room ${room.id} alive → recheck in ~${cfg.recheckMin}m`);
    } else {
      io.to(roomChannel(room.id)).emit("room_closed", {
        roomId: room.id,
        reason: "abandoned",
        status: "FINISHED",
        at: Date.now(),
      });
      await prisma.room.update({
        where: { id: room.id },
        data: { status: "FINISHED", lastCheckedAt: new Date() },
      });
      console.log(`[janitor] room ${room.id} abandoned (no response) → ended`);
    }
  }
}

/**
 * Emit `room_ping` to everyone in the room and resolve true if at least one
 * client acknowledges within `timeoutMs`. Clients reply via the ack callback:
 *   socket.on("room_ping", (data, ack) => ack({ alive: true }))
 */
function pingRoom(io, roomId, timeoutMs) {
  return new Promise((resolve) => {
    io.to(roomChannel(roomId))
      .timeout(timeoutMs)
      .emit("room_ping", { roomId }, (err, responses) => {
        resolve(!err && Array.isArray(responses) && responses.length > 0);
      });
  });
}
