import http from "http";
import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { runAll } from "./test-runner.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const MIME = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
  webp: "image/webp", svg: "image/svg+xml",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
};
const contentType = (name) =>
  MIME[(name.split(".").pop() || "").toLowerCase()] || "application/octet-stream";
// URL the browser (running on the host) should use to reach the backend —
// the host-mapped port, NOT the in-Docker-network address.
const PUBLIC_BACKEND_URL =
  process.env.PUBLIC_BACKEND_URL || "http://localhost:9101";

async function main() {
  // 1. Run the automated suite once (logs pass/fail). Never let a failure stop
  //    the dashboard from coming up.
  try {
    await runAll();
  } catch (err) {
    console.error("[tester] suite errored:", err.message);
  }

  // 2. Serve the manual QA dashboard.
  const server = http.createServer(async (req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    // Static test assets: /assets/<file> -> tester/assets/<file>. Used both as
    // quest media URLs and as programmatic upload sources by the dashboard.
    if (req.url.startsWith("/assets/")) {
      const name = decodeURIComponent(req.url.slice("/assets/".length).split("?")[0]);
      if (!name || name.includes("..") || name.includes("/")) {
        res.writeHead(400);
        res.end("bad asset path");
        return;
      }
      try {
        const data = await readFile(join(__dirname, "assets", name));
        res.writeHead(200, {
          "Content-Type": contentType(name),
          "Cache-Control": "no-store",
        });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end("asset not found: " + name + " (drop it in tester/assets/)");
      }
      return;
    }
    if (req.url === "/" || req.url.startsWith("/index")) {
      try {
        let html = await readFile(join(__dirname, "dashboard.html"), "utf8");
        // Inject the default backend URL for convenience.
        html = html.replace("__DEFAULT_BACKEND__", PUBLIC_BACKEND_URL);
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(html);
      } catch (e) {
        res.writeHead(500);
        res.end("dashboard.html not found: " + e.message);
      }
      return;
    }
    res.writeHead(404);
    res.end("not found");
  });

  server.listen(PORT, () => {
    console.log(`[tester] QA dashboard on :${PORT} (host 9121)`);
    console.log(`[tester] dashboard talks to backend at ${PUBLIC_BACKEND_URL}`);
  });
}

main();
