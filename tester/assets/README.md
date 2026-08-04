# Test assets

Drop your dummy media files here so the QA dashboard can render them as quest
media **and** upload them to MinIO. Expected filenames (referenced by
`dashboard.html`):

- `test-image.png`
- `test-audio.mp3`
- `test-video.mp4`

They are served by the tester container at `http://localhost:9121/assets/<file>`.

This folder is **bind-mounted** into the container (see `docker-compose.yml`),
so you can add/replace files without rebuilding — just drop them in and refresh
the dashboard. If a file is missing the media tag simply shows broken; the
upload/submit flow still works with the native file picker.
