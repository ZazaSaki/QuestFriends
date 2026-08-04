# Scavenger — Testing Environment

Isolated Docker container that exercises the backend over HTTP + WebSockets. Two things in one:

1. **Automated suite** (`test-runner.js`) — runs on `docker compose up`, logs pass/fail.
2. **Manual QA dashboard** (`dashboard.html`) — served on host port **9121**.

## Run

From the repo root:

```bash
docker compose up --build
```

- The `tester` container waits for the backend `/health`, runs the suite (results in the logs), then serves the dashboard.
- Open **http://localhost:9121** for the manual dashboard.

Run just the suite on demand:

```bash
docker compose run --rm tester npm test
```

## Automated coverage (`test-runner.js`)

- **Matrix happy paths:** QR+Staff, QR+Auto(Quiz), Open+Staff, Open+Auto(Quiz).
- **Entry edges:** invalid QR → 403; bypass QR (no value) → 403; second unlock while active is blocked (idempotent, no new broadcast).
- **Approval edges:** staff reject → retry succeeds; submit twice rapidly (staff and auto-quiz) → points awarded once.
- **Concurrency:** two staff approve the same submission at once → exactly one wins, points added once.
- **Quiz:** dropped mid-quiz → no saved state, restarts from the beginning.

## Manual dashboard (`dashboard.html`)

Unstyled HTML + vanilla JS. Set the **Backend URL** to `http://localhost:9101` (the host-mapped backend — the browser can't reach the in-Docker address), paste `roomId` / `teamId` / `userId` / `staffId` from a scenario (or `npm run seed` in the backend), then **Connect & Join**.

- **Player:** Send GPS · Scan QR/Open · Submit Photo · Submit Quiz. A banner shows LOCKED / ACTIVE / APPROVED / REJECTED driven by `quest_unlocked`, `at_location`, `validation_result`.
- **Staff:** live pending feed (updates via the `submission_pending` WebSocket event) with Approve / Reject.

Submit as player → it appears in the staff feed instantly → Approve → the player banner flips to APPROVED in real time.

## How it talks to the backend

- In-container (test-runner): `BACKEND_HTTP` (default `http://10.5.0.10:3000`, the app's in-network address).
- In-browser (dashboard): the host-mapped `http://localhost:9101` (injected as the default via `PUBLIC_BACKEND_URL`).
