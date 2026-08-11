import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const PORT = process.env.PORT || 3000;
// The URL the *browser* should use to reach the backend — same idea as
// MINIO_EXTERNAL_URL on the backend: this must be an address the client
// (not the Docker network) can actually resolve.
const PUBLIC_BACKEND_URL = process.env.PUBLIC_BACKEND_URL || "http://localhost:9101";

// Served before the static files so it's always fresh (not cached from disk).
app.get("/config.js", (req, res) => {
  res.type("application/javascript");
  res.send(`window.__DEFAULT_API_BASE__ = ${JSON.stringify(PUBLIC_BACKEND_URL)};`);
});

// This service is exclusively the Staff dashboard — opening the root URL
// loads it directly (no landing page / role picker), even though the file
// itself keeps its descriptive name (staff.html) rather than index.html.
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "staff.html"));
});

app.use(express.static(__dirname));

app.listen(PORT, () => {
  console.log(`Scavenger staff service listening on :${PORT}`);
  console.log(`Backend URL injected: ${PUBLIC_BACKEND_URL}`);
});
