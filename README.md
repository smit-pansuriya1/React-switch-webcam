# VideoSDK React – Switch Webcam

A small React demo that switches between the **front and back camera** in a VideoSDK meeting. It uses label-based camera detection and logs how long each step takes.

- `@videosdk.live/react-sdk` **1.1.1**
- React 18 + Vite
- Light Tailwind CSS v4 styling

## Setup

```bash
git clone https://github.com/smit-pansuriya1/React-switch-webcam.git
cd React-switch-webcam
cp .env.example .env
npm install
```

Fill in `.env`:

| Variable | What it is |
| --- | --- |
| `VITE_VIDEOSDK_TOKEN` | Token from https://app.videosdk.live/api-keys |
| `VITE_MEETING_ID` | Room everyone joins, so a laptop and a phone land in the same meeting |

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server at http://localhost:5173, also reachable on your local network (`--host`) |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve `dist/` locally |

`.env` values are compiled into the bundle at build time, so you must rebuild after changing them.

### Testing on a phone

Phones only allow camera access over **HTTPS**. Use a tunnel such as ngrok:

```bash
npm run dev
ngrok http 5173
```

`vite.config.js` already allows `*.ngrok-free.dev`, `*.ngrok-free.app`, `*.ngrok.app` and `*.ngrok.io` hosts.

## How it works

### Precall
1. The app asks for mic and camera permission.
2. It loads the mic, camera and speaker lists.
3. `pickCameras()` finds the best **front** and **back** camera:
   - **Side:** taken from the facing hint (`front`/`user` means front, anything else means back), or from a label that contains "front"/"back".
   - **Rank:** the Android `camera N` index when it exists. Otherwise a lens penalty (dual wide 1, dual 2, triple 3, ultra wide 5, telephoto 6) × 1000, plus the label length.

The **Join** button stays disabled until all of these steps finish. The current step is shown on screen.

### Joining
The meeting starts with mic and webcam **off**. Afterwards the app turns on the selected mic and camera one at a time. This avoids the SDK 1.1.1 `3055 – operation already in progress` error.

### Switch Webcam
1. **Target camera:** the camera on the opposite side. If that side is missing, the app fetches cameras again. If it is still missing, it uses the next camera in the list.
2. **Change sequence:**
   1. `disableWebcam()`, then wait until the webcam is off.
   2. Wait for the old track to end (max 1 s), so Android releases the camera.
   3. `createCameraVideoTrack({ cameraId })`. It retries after 250 / 500 / 750 ms because SDK 1.1.1 throws while the camera is still busy.
   4. `changeWebcam(track)`, then wait until the webcam is on.
   5. Check that the opened track's `deviceId` matches the requested camera.

### Logs
Each switch logs one line:

```
#n OK|FAILED reason -> camera | disable | release | create (attempts) | change | total
```

The line goes to the browser console, the on-screen log panel and a toast.
- **`SWITCH_LOG` pubsub topic:** shares log lines with every participant, so a laptop can watch a phone's switches live.
- **`DEVICE_INFO` pubsub topic (persisted):** shares each participant's OS, browser, screen size and user agent.
- **Copy buttons:** both panels have one, for pasting into bug reports.

## Project structure

```
src/
  App.jsx          Precall, MeetingScreen (join, switch, logs), ParticipantTile
  cameraUtils.js   pickCameras, rank, sideOf, deviceInfo, timing helpers
  logs.jsx         useLogs, Toast, LogPanel, DeviceInfoPanel
  config.js        TOKEN and MEETING_ID from .env
  index.css        Tailwind import
```

## Note

The token is bundled into the client JavaScript. That's fine for a demo. In production, generate short-lived tokens on a server.

## Bandhan Bank POC

This branch builds the app to run under the `/bandhanbank-switchwebcam/` sub-path instead of the domain root.

| Command | What it does |
| --- | --- |
| `npm run build:bandhanbank` | Build into `build/bandhanbank-switchwebcam/` using the current `.env` values |
| `npm run preview:bandhanbank` | Serve that build at http://localhost:4173/bandhanbank-switchwebcam/ |

To deploy, copy the `build/bandhanbank-switchwebcam/` folder to the web server root and serve it over HTTPS. The app then opens at `https://<domain>/bandhanbank-switchwebcam/`. Rebuild after any `.env` change.
