import "dotenv/config";
import http from "http";
import express from "express";
import cors from "cors";
import { Server as SocketIOServer } from "socket.io";

import { registerSocketHandlers } from "./sockets/index.js";
import { ensureBucket } from "./minio.js";

import usersRouter from "./routes/users.js";
import gamesRouter from "./routes/games.js";
import questsRouter from "./routes/quests.js";
import tracksRouter from "./routes/tracks.js";
import roomsRouter from "./routes/rooms.js";
import teamsRouter from "./routes/teams.js";
import playRouter from "./routes/play.js";
import staffRouter from "./routes/staff.js";

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: "*" },
});

// Expose io to REST controllers (rooms/start, staff/validate emit events).
app.set("io", io);

app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (_req, res) => res.json({ ok: true }));

// API routes
app.use("/api/users", usersRouter);
app.use("/api/games", gamesRouter);
app.use("/api/quests", questsRouter);
app.use("/api/tracks", tracksRouter);
app.use("/api/rooms", roomsRouter);
app.use("/api/teams", teamsRouter);
app.use("/api/play", playRouter);
app.use("/api/staff", staffRouter);

// Central error handler (last resort)
app.use((err, _req, res, _next) => {
  console.error("[error]", err);
  res.status(err.status || 500).json({ error: err.message || "Internal error" });
});

registerSocketHandlers(io);

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await ensureBucket();
  } catch (err) {
    // Non-fatal: MinIO may not be reachable yet; uploads will fail until it is.
    console.warn("[minio] ensureBucket failed (continuing):", err.message);
  }

  server.listen(PORT, () => {
    console.log(`[server] listening on ${PORT}`);
  });
}

start();

export { app, io };
