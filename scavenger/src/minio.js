import * as Minio from "minio";

export const BUCKET = process.env.MINIO_BUCKET || "scavenger";

/**
 * MinIO client wiring.
 *
 * Rule (see plan): the INTERNAL endpoint is used ONLY for strictly in-network
 * Docker-to-Docker traffic (this app's own admin calls, e.g. ensuring the
 * bucket exists). EVERY URL that could be reached from outside the Docker
 * network — including the presigned upload URLs handed to a player's phone or a
 * manager — must be signed against the EXTERNAL host/port so the signature
 * matches the host the client actually hits.
 */

// --- Internal client: in-network admin ops only (bucket ensure/exists) ---
const internalEndpoint =
  process.env.MINIO_INTERNAL_ENDPOINT || process.env.MINIO_ENDPOINT || "127.0.0.1";
const internalPort = parseInt(
  process.env.MINIO_INTERNAL_PORT || process.env.MINIO_PORT || "9000",
  10
);

// A fixed region makes presigned-URL generation fully offline: without it the
// MinIO SDK does a region-discovery request to the endpoint, which fails for
// the external client whose host (e.g. localhost:9110) isn't reachable from
// inside the app container.
const REGION = process.env.MINIO_REGION || "us-east-1";

export const internalClient = new Minio.Client({
  endPoint: internalEndpoint,
  port: internalPort,
  useSSL: false, // internal Docker network traffic is plain HTTP
  region: REGION,
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY,
});

// --- External client: everything client-facing (presigned URLs) ---
// Parsed from MINIO_EXTERNAL_URL, e.g. "http://your-server-ip:9110".
function parseExternal(url) {
  if (!url) {
    // Fall back to the internal coordinates if no external URL is configured.
    return { endPoint: internalEndpoint, port: internalPort, useSSL: false };
  }
  const parsed = new URL(url);
  const useSSL = parsed.protocol === "https:";
  const port = parsed.port ? parseInt(parsed.port, 10) : useSSL ? 443 : 80;
  return { endPoint: parsed.hostname, port, useSSL };
}

const ext = parseExternal(process.env.MINIO_EXTERNAL_URL);

export const externalClient = new Minio.Client({
  endPoint: ext.endPoint,
  port: ext.port,
  useSSL: ext.useSSL,
  region: REGION,
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY,
});

/** Ensure the bucket exists. Uses the internal client (in-network admin op). */
export async function ensureBucket() {
  const exists = await internalClient.bucketExists(BUCKET).catch(() => false);
  if (!exists) {
    await internalClient.makeBucket(BUCKET);
    console.log(`[minio] created bucket "${BUCKET}"`);
  }
}
