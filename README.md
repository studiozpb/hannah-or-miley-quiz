# Hannah or Miley Quiz

Static web quiz built from the supplied PDF for iPad use at an event line.

The layout is portrait-first for guest phones, scales up to tablets, and adapts for landscape when screen space allows.
The results screen now supports two guest take-home actions:

- Open the native share sheet with the result JPEG on supported devices, or download it as a JPEG otherwise
- Text the same JPEG via Twilio MMS when the server is configured
- Auto-reset back to the welcome screen after 90 seconds of inactivity on the result screen

Direct JPEG download works from the static files alone. MMS, analytics, and the admin dashboard require the Node server in this repo plus environment variables.

## Run locally

From `/Applications/Hannah or Miley`:

```bash
npm start
```

Then open `http://localhost:4173`.

## Files

- `index.html` loads the app shell.
- `styles.css` contains the fullscreen responsive styling and orientation handling.
- `script.js` contains the quiz content, scoring, result downloads, and client-side MMS form behavior.
- `server.js` serves the app and exposes the Twilio MMS endpoint.
- `.env.example` lists the server environment variables for Twilio.

## Future graphics

The UI already includes placeholder media panels on each question and on the result screen. When art is ready, set `imageSrc` values in the question and result objects inside `script.js` to point at files in `assets/`, and the placeholders will switch to real imagery automatically.

For downloadable/textable result cards, keep these filenames and replace the JPEG contents in place:

- `assets/results/miley-stewart-share.jpg`
- `assets/results/hannah-montana-share.jpg`
- `assets/results/best-of-both-worlds-share.jpg`

## Twilio setup

1. Copy `.env.example` to `.env`.
2. Optionally set `DATA_DIR` if analytics should be written outside the repo folder.
3. Fill in `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and either `TWILIO_MESSAGING_SERVICE_SID` or `TWILIO_FROM_NUMBER`.
4. Set `PUBLIC_BASE_URL` to the public HTTPS URL where this app is hosted.
5. Start the server with `npm start`.

Twilio MMS needs the image URL to be publicly reachable, so local `localhost` URLs will not work for real sends.

## Render deploy

This repo includes a `render.yaml` Blueprint for a single Render web service on the `starter` plan plus a 1 GB persistent disk for analytics.

Before launch in Render:

1. Push this project to GitHub, GitLab, or Bitbucket. Render Blueprints deploy from a Git repo.
2. Create a new Blueprint in Render and point it at that repo.
3. Set `PUBLIC_BASE_URL` to your live `https://...onrender.com` or custom domain.
4. Set `ADMIN_ACCESS_TOKEN` before exposing `/admin.html`.
5. Set your Twilio values in the Render dashboard. Use either `TWILIO_MESSAGING_SERVICE_SID` or `TWILIO_FROM_NUMBER`.

The Blueprint mounts persistent storage at `/var/data/hannah-or-miley` and sets `DATA_DIR` to that path so analytics survive redeploys and restarts.

## Notes

- The server does basic input validation, same-origin checks, and a simple per-device rate limit on MMS sends.
- `GET /api/healthz` returns a simple health check response for Render.
- Native sharing uses the browser Web Share API with files, so it works only on supported browsers/devices and in a secure context.
- When SMS is not configured for the current deployment, the text form is hidden and the result screen becomes download-only.
- The phone number parser accepts common US entry formats directly. International numbers should be entered in full `+` country-code format.
- Only send texts when the guest has clearly asked to receive the result.
