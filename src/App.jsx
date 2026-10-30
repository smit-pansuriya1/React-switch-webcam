import { useEffect, useRef, useState } from "react";
import {
  MeetingProvider,
  useMeeting,
  useParticipant,
  usePubSub,
  useMediaDevice,
  createCameraVideoTrack,
  createMicrophoneAudioTrack,
} from "@videosdk.live/react-sdk";
import { TOKEN, MEETING_ID } from "./config";
import { pickCameras, sideOf, now, ms, camLabel, deviceInfo, errText } from "./cameraUtils";
import { useLogs, Toast, LogPanel, DeviceInfoPanel } from "./logs";

const MAX_TILES = 10;
const WEBCAM_STATE_TIMEOUT_MS = 10000;
// retry delays when the camera is still held by the outgoing track (Android NotReadableError)
const CREATE_RETRY_DELAYS_MS = [250, 500, 750];
// every participant broadcasts its webcam-change log lines here, so the switch timings
// from the phone are visible on the Mac as well (and vice versa)
const SWITCH_LOG_TOPIC = "SWITCH_LOG";
// each participant publishes its device info once after joining (persisted for late joiners)
const DEVICE_INFO_TOPIC = "DEVICE_INFO";

const btn = "rounded-md bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-50";
const btnLight = "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-50";
const field = "rounded-md border border-slate-300 bg-white px-2 py-1 text-sm";
const card = "rounded-lg border border-slate-200 bg-white p-4";

export default function App() {
  const [joinConfig, setJoinConfig] = useState(null);

  if (!joinConfig) return <Precall onJoin={setJoinConfig} />;

  return (
    <MeetingProvider
      token={TOKEN}
      config={{
        meetingId: MEETING_ID,
        name: joinConfig.name,
        // join with both off and enable them ourselves in onMeetingJoined with the precall
        // devices: if the SDK auto-enables them, our change requests overlap its enable and
        // SDK 1.1.1 rejects them with 3055 "already in progress" (and the camera opens twice)
        micEnabled: false,
        webcamEnabled: false,
      }}
      joinWithoutUserInteraction
    >
      <MeetingScreen joinConfig={joinConfig} onLeft={() => setJoinConfig(null)} />
    </MeetingProvider>
  );
}

// ================= PRECALL SCREEN =================
function Precall({ onJoin }) {
  const { getCameras, getMicrophones, getPlaybackDevices, requestPermission } = useMediaDevice();

  const [name, setName] = useState("Guest");
  const [micEnabled, setMicEnabled] = useState(true);
  const [webcamEnabled, setWebcamEnabled] = useState(true);
  const [mics, setMics] = useState([]);
  const [webcams, setWebcams] = useState([]);
  const [speakers, setSpeakers] = useState([]);
  const [micId, setMicId] = useState("");
  const [webcamId, setWebcamId] = useState("");
  const [speakerId, setSpeakerId] = useState("");
  const [status, setStatus] = useState("");
  // best front/back camera picked from the device list; null until detection finishes
  const [cameras, setCameras] = useState(null);
  // current precall step; non-empty = process still running -> Join (and Refresh) disabled.
  // Cleared only when the whole process has finished, whether it succeeded or failed.
  const [step, setStep] = useState("Starting...");
  const runningRef = useRef(false);

  const loadDevices = async () => {
    if (runningRef.current) return; // don't start a second run while one is in progress
    runningRef.current = true;
    setStatus("");
    setCameras(null);
    try {
      // 1. ask for mic + camera permission so device labels are available
      setStep("Requesting mic/camera permission...");
      try {
        await requestPermission();
      } catch (err) {
        setStatus("Mic/camera permission failed: " + errText(err));
      }

      // 2. list devices
      setStep("Loading devices...");
      let w = [];
      try {
        const m = await getMicrophones();
        w = await getCameras();
        const s = await getPlaybackDevices();
        setMics(m);
        setWebcams(w);
        setSpeakers(s);
        setMicId(m[0]?.deviceId || "");
        setSpeakerId(s[0]?.deviceId || "");
      } catch (err) {
        setStatus("Could not load devices: " + errText(err));
      }

      // 3. find the best front/back camera before allowing join
      setStep("Detecting front/back cameras...");
      const picked = pickCameras(w);
      setCameras(picked);
      setWebcamId(picked.front?.deviceId || picked.cams[0]?.deviceId || w[0]?.deviceId || "");
    } finally {
      runningRef.current = false;
      setStep("");
    }
  };

  useEffect(() => {
    loadDevices();
  }, []);

  const joinMeeting = () => {
    if (step || !cameras) return setStatus("Precall is still running — wait a moment");
    if (!TOKEN) return setStatus("No token — set VITE_VIDEOSDK_TOKEN in .env");
    onJoin({ name: name || "Guest", micEnabled, webcamEnabled, micId, webcamId, speakerId, cameras });
  };

  const deviceSelect = (value, setValue, devices) => (
    <select value={value} onChange={(e) => setValue(e.target.value)} disabled={!!step} className={`${field} w-full disabled:opacity-50`}>
      {devices.length ? (
        devices.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || d.deviceId}
          </option>
        ))
      ) : (
        <option value="">Default</option>
      )}
    </select>
  );

  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      <h1 className="text-lg font-semibold">Switch Webcam — Precall</h1>

      <div className={`${card} space-y-3`}>
        <label className="block text-sm">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} className={`${field} mt-1 w-full`} />
        </label>
        <p className="text-sm">
          Meeting Id: <b>{MEETING_ID}</b> <span className="text-slate-500">(hardcoded)</span>
        </p>
        <p className="text-xs text-slate-500">Device: {deviceInfo().short}</p>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={micEnabled} onChange={(e) => setMicEnabled(e.target.checked)} /> Mic
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={webcamEnabled} onChange={(e) => setWebcamEnabled(e.target.checked)} /> Webcam
          </label>
        </div>
        <button onClick={joinMeeting} disabled={!!step || !cameras} className={`${btn} w-full`}>
          {step ? <span className="animate-pulse">{step}</span> : "Join Meeting"}
        </button>
        {status && <p className="text-sm text-red-600">{status}</p>}
      </div>

      <div className={`${card} space-y-3 text-sm`}>
        <label className="block">Mic {deviceSelect(micId, setMicId, mics)}</label>
        <label className="block">Webcam {deviceSelect(webcamId, setWebcamId, webcams)}</label>
        <label className="block">Speaker {deviceSelect(speakerId, setSpeakerId, speakers)}</label>
        <button onClick={loadDevices} disabled={!!step} className={btnLight}>
          {step ? "Loading..." : "Refresh Devices"}
        </button>
        {cameras && (
          <p className="text-xs text-slate-500">
            Front: {camLabel(cameras.front)} | Back: {camLabel(cameras.back)} | Can flip: {String(cameras.canFlip)}
          </p>
        )}
      </div>
    </div>
  );
}

// ================= MEETING SCREEN =================
function MeetingScreen({ joinConfig, onLeft }) {
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState("");
  const { logs, log, toast } = useLogs();
  const { getCameras } = useMediaDevice();
  const device = useRef(deviceInfo()).current;
  // number of webcam changes attempted on THIS device (included in every shared log line)
  const switchCountRef = useRef(0);

  // camera data found on precall; refreshed in-meeting only when the wanted side is missing
  const [cameras, setCameras] = useState(joinConfig.cameras || pickCameras([]));
  const [currentCamId, setCurrentCamId] = useState(joinConfig.webcamId || "");
  const [switching, setSwitching] = useState(false);

  const {
    meetingId,
    participants,
    localParticipant,
    localMicOn,
    localWebcamOn,
    toggleMic,
    toggleWebcam,
    unmuteMic,
    disableWebcam,
    changeWebcam,
    leave,
  } = useMeeting({
    onMeetingJoined: async () => {
      setJoined(true);
      // turn mic + webcam on once, directly with the precall devices, one after the other
      // (v1 allows one enable/change per device at a time and its methods throw)
      if (joinConfig.micEnabled) {
        try {
          const micTrack = await createMicrophoneAudioTrack(joinConfig.micId ? { microphoneId: joinConfig.micId } : {});
          await unmuteMic(micTrack);
        } catch (err) {
          setError("Turning on mic failed: " + errText(err));
        }
      }
      if (joinConfig.webcamEnabled) {
        const cam = cameras.cams.find((c) => c.deviceId === joinConfig.webcamId) ||
          cameras.cams[0] || { deviceId: joinConfig.webcamId };
        // webcam is off here, so applyWebcam skips disable and just creates + enables the track
        if (cam.deviceId) await applyWebcam(cam, "precall selection");
      }
    },
    onMeetingLeft: onLeft,
    onError: (err) => setError("Meeting error " + errText(err)),
    onMeetingStateChanged: ({ state }) => {
      if (state === "DISCONNECTED" || state === "FAILED") setError("Connection lost (" + state + ")");
      if (state === "CONNECTED") setError("");
    },
  });

  // --- shared switch log: every result line is published so all participants see it ---
  const localTag = `${joinConfig.name} @ ${device.short}`;
  const { publish: publishSwitchLog } = usePubSub(SWITCH_LOG_TOPIC, {
    onMessageReceived: (m) => {
      if (m.senderId === localParticipant?.id) return; // already logged locally
      try {
        const d = JSON.parse(m.message);
        log(d.msg, { level: d.level, from: d.from, time: d.time });
      } catch {
        /* ignore malformed */
      }
    },
  });
  // --- device info exchange: publish ours once joined; `messages` holds everyone's (incl. persisted) ---
  const { publish: publishDeviceInfo, messages: deviceInfoMessages } = usePubSub(DEVICE_INFO_TOPIC);
  useEffect(() => {
    if (!joined || !localParticipant?.id) return;
    publishDeviceInfo(JSON.stringify({ name: joinConfig.name, id: localParticipant.id, device: device.full }), {
      persist: true,
    }).catch((err) => console.error("publish device info failed", err));
  }, [joined, localParticipant?.id]);

  const report = (msg, level = "info") => {
    const entry = log(msg, { level, from: localTag });
    const payload = { time: entry.time, level, from: localTag, msg, count: switchCountRef.current };
    publishSwitchLog(JSON.stringify(payload), { persist: false }).catch((err) =>
      console.error("publish switch log failed", err)
    );
  };

  // --- wait for localWebcamOn to reach a wanted value (confirms the SDK state actually flipped) ---
  const webcamOnRef = useRef(localWebcamOn);
  const webcamWaiters = useRef([]);
  useEffect(() => {
    webcamOnRef.current = localWebcamOn;
    webcamWaiters.current = webcamWaiters.current.filter((w) => {
      if (w.want !== localWebcamOn) return true;
      w.resolve();
      return false;
    });
  }, [localWebcamOn]);

  const waitForWebcam = (want, what) =>
    new Promise((resolve, reject) => {
      if (webcamOnRef.current === want) return resolve();
      const waiter = { want, resolve: null };
      const timer = setTimeout(() => {
        webcamWaiters.current = webcamWaiters.current.filter((w) => w !== waiter);
        reject(new Error(`${what}: timed out after ${WEBCAM_STATE_TIMEOUT_MS}ms waiting for webcam ${want ? "on" : "off"}`));
      }, WEBCAM_STATE_TIMEOUT_MS);
      waiter.resolve = () => {
        clearTimeout(timer);
        resolve();
      };
      webcamWaiters.current.push(waiter);
    });

  // --- disable -> wait release -> create track -> changeWebcam(track) -> verify, timed ---
  //
  // Android guard: disableWebcam flips SDK state quickly, but Chrome releases the camera
  // hardware a few hundred ms later, so opening the other camera right away fails with
  // NotReadableError. In SDK 1.1.1 createCameraVideoTrack THROWS on that (0.13 returned null),
  // so: (a) wait for the outgoing MediaStreamTrack to actually end (max 1s), (b) retry
  // creation with 250/500/750ms backoff, (c) verify the opened track's deviceId.
  const sleep = (t) => new Promise((r) => setTimeout(r, t));
  const outgoingVideoTrack = () => {
    for (const st of localParticipant?.streams?.values?.() || []) if (st.kind === "video") return st.track;
    return null;
  };
  const waitForTrackEnd = (track, maxMs = 1000) =>
    new Promise((resolve) => {
      if (!track || track.readyState === "ended") return resolve(false);
      const timer = setTimeout(() => resolve(false), maxMs);
      track.addEventListener(
        "ended",
        () => {
          clearTimeout(timer);
          resolve(true);
        },
        { once: true }
      );
    });

  const createTrackWithRetry = async (cameraId) => {
    let lastErr = null;
    for (let attempt = 1; attempt <= CREATE_RETRY_DELAYS_MS.length + 1; attempt++) {
      if (attempt > 1) await sleep(CREATE_RETRY_DELAYS_MS[attempt - 2]);
      try {
        const track = await createCameraVideoTrack({ cameraId });
        if (track) return { track, attempts: attempt, lastErr };
        lastErr = new Error("createCameraVideoTrack returned no track");
      } catch (err) {
        lastErr = err;
        // camera id no longer exists -> retrying won't help
        if (/no camera device found/i.test(err?.message || "")) return { track: null, attempts: attempt, lastErr };
      }
    }
    return { track: null, attempts: CREATE_RETRY_DELAYS_MS.length + 1, lastErr };
  };

  const applyWebcam = async (cam, reason) => {
    const tTotal = now();
    const label = camLabel(cam);
    switchCountRef.current += 1;
    const n = `#${switchCountRef.current}`;
    let tDisable = 0,
      tRelease = 0,
      tCreate = 0,
      tChange = 0,
      attempts = 1,
      retryNote = "";
    const timings = () =>
      `disable ${ms(tDisable)} | release ${ms(tRelease)} | create ${ms(tCreate)}${
        attempts > 1 ? ` (${attempts} attempts${retryNote})` : ""
      } | change ${ms(tChange)}`;
    try {
      // 1. disable current webcam (grab the outgoing track first, to watch it end)
      const oldTrack = outgoingVideoTrack();
      let t = now();
      if (webcamOnRef.current) {
        await disableWebcam();
        await waitForWebcam(false, "disableWebcam");
      }
      tDisable = now() - t;

      // 2. wait for the hardware to actually release the old camera
      t = now();
      await waitForTrackEnd(oldTrack);
      tRelease = now() - t;

      // 3. create a track for the target camera, retrying while the camera is still busy
      t = now();
      const created = await createTrackWithRetry(cam.deviceId);
      attempts = created.attempts;
      if (created.lastErr) retryNote = `, last error: ${errText(created.lastErr)}`;
      tCreate = now() - t;
      if (!created.track) throw new Error(`createCameraVideoTrack failed: ${errText(created.lastErr)}`);
      const track = created.track;

      // 4. changeWebcam with the created track (v1 resolves when done), confirm webcam is on
      t = now();
      await changeWebcam(track);
      await waitForWebcam(true, "changeWebcam");
      tChange = now() - t;

      // 5. confirm which camera actually opened
      const openedId = track.getVideoTracks?.()[0]?.getSettings?.().deviceId;
      if (openedId && openedId !== cam.deviceId) {
        const openedCam = cameras.cams.find((c) => c.deviceId === openedId);
        throw new Error(`opened a different camera: ${openedCam ? camLabel(openedCam) : openedId}`);
      }
      const verified = openedId ? " | verified deviceId" : " | deviceId not reported";

      setCurrentCamId(cam.deviceId);
      report(`${n} OK ${reason} -> ${label} | ${timings()} | total ${ms(now() - tTotal)}${verified}`);
      return true;
    } catch (err) {
      // side is NOT updated on failure, so the next tap targets the right camera again
      report(`${n} FAILED ${reason} -> ${label}: ${errText(err)} | ${timings()} | total ${ms(now() - tTotal)}`, "error");
      return false;
    }
  };

  // --- Switch Webcam (label logic) ---
  //   1. Work out which side (front/back) the current camera is, using the precall picks
  //      (pickCameras: facing hint or label "front"/"back"; ranked by Android "camera N"
  //      index, else lens penalty * 1000 + label length).
  //   2. Target = the opposite side. If precall data has no camera for that side, fetch
  //      cameras NOW (getCameras -> pickCameras), store the fresh result, then act.
  //   3. Still nothing (e.g. desktop with one facing) -> fall back to the next real camera.
  //   4. applyWebcam(target): disable -> wait release -> create (retry) -> change -> verify.
  const switchWebcam = async () => {
    if (switching) return;
    setSwitching(true);
    const tTotal = now();
    let fetched = false,
      tFetch = 0;
    try {
      let picked = cameras;
      const currentSide = sideOf(picked, currentCamId);
      const targetSide =
        currentSide === "back" ? "front" : currentSide === "front" ? "back" : picked.back ? "back" : "front";
      let target = picked[targetSide];
      if (target && target.deviceId === currentCamId) target = null;

      if (!target) {
        // not available in precall data -> fetch cameras first, then act
        fetched = true;
        const t = now();
        picked = pickCameras(await getCameras());
        setCameras(picked);
        tFetch = now() - t;
        target = picked[targetSide];
        if (target && target.deviceId === currentCamId) target = null;
      }
      if (!target) {
        // no front/back pair (e.g. desktop) -> cycle to the next camera
        const idx = picked.cams.findIndex((c) => c.deviceId === currentCamId);
        target = picked.cams[(idx + 1) % picked.cams.length];
        if (!target || target.deviceId === currentCamId) {
          throw new Error(`No other camera available (${picked.cams.length} real camera(s) found)`);
        }
      }

      const reason = `switch to ${target === picked[targetSide] ? targetSide : "next camera"}${
        fetched ? `, fetched cameras in ${ms(tFetch)}` : ""
      }`;
      await applyWebcam(target, reason);
    } catch (err) {
      report(`FAILED switch: ${errText(err)}${fetched ? ` | fetch ${ms(tFetch)}` : ""} | total ${ms(now() - tTotal)}`, "error");
    } finally {
      setSwitching(false);
    }
  };

  // v1: meeting methods are async and can throw (e.g. operation already in progress)
  const run = (fn) => () => Promise.resolve(fn()).catch((err) => setError(errText(err)));

  const currentCam = cameras.cams.find((c) => c.deviceId === currentCamId);
  const currentSide = sideOf(cameras, currentCamId);

  // one block per participant: ours first, then every other device that published its info
  const localBlock = [
    `Participant: ${joinConfig.name} (${localParticipant?.id || "-"})`,
    `Meeting: ${meetingId}`,
    `Device: ${device.full}`,
  ].join("\n");
  const remoteBlocks = [];
  const seen = new Set();
  for (const m of [...(deviceInfoMessages || [])].reverse()) {
    try {
      const d = JSON.parse(m.message);
      if (!d.id || d.id === localParticipant?.id || seen.has(d.id)) continue;
      seen.add(d.id);
      const here = participants.has(d.id) ? "" : " (left)";
      remoteBlocks.push([`Participant: ${d.name} (${d.id})${here}`, `Device: ${d.device}`].join("\n"));
    } catch {
      /* ignore malformed */
    }
  }
  const deviceText = [localBlock, ...remoteBlocks].join("\n\n");

  if (!joined)
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-4">
        <Toast toast={toast} />
        <p className="text-sm">Joining meeting... {error}</p>
        <LogPanel logs={logs} />
      </div>
    );

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 pb-24">
      <Toast toast={toast} />

      <header className={`${card} flex flex-wrap items-center justify-between gap-2`}>
        <div className="text-sm">
          <p>
            Meeting <b>{meetingId}</b> · {participants.size} participant(s)
          </p>
          {error && <p className="text-red-600">{error}</p>}
        </div>
        <button onClick={run(leave)} className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-500">
          Leave
        </button>
      </header>

      <section className={`${card} space-y-3`}>
        <div className="flex flex-wrap gap-2">
          <button onClick={run(toggleMic)} className={btnLight}>
            {localMicOn ? "Mute Mic" : "Unmute Mic"}
          </button>
          <button onClick={run(toggleWebcam)} className={btnLight}>
            {localWebcamOn ? "Webcam Off" : "Webcam On"}
          </button>
          <button onClick={switchWebcam} disabled={switching} className={btn}>
            {switching ? "Switching..." : "Switch Webcam"}
          </button>
        </div>
        <p className="text-sm">
          Webcam: <b>{currentCam ? camLabel(currentCam) : currentCamId || "default"}</b> ({currentSide || "unknown"}) ·
          Front: {camLabel(cameras.front)} · Back: {camLabel(cameras.back)}
        </p>
        <p className="text-xs text-slate-500">
          Opposite side from precall picks (facing hint or label "front"/"back", ranked by Android camera index, else lens
          penalty + label length) → fetch cameras only if missing → disableWebcam → wait old track ended →
          createCameraVideoTrack (retry 250/500/750ms) → changeWebcam(track) → verify opened deviceId.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[...participants.keys()].slice(0, MAX_TILES).map((participantId) => (
          <ParticipantTile key={participantId} participantId={participantId} speakerId={joinConfig.speakerId} />
        ))}
      </section>

      <DeviceInfoPanel text={deviceText} />
      <LogPanel logs={logs} header={deviceText} />
    </div>
  );
}

// ================= PARTICIPANT TILE =================
function ParticipantTile({ participantId, speakerId }) {
  const { displayName, isLocal, webcamOn, micOn, webcamStream, micStream } = useParticipant(participantId);
  const videoRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
    if (!videoRef.current) return;
    if (webcamOn && webcamStream) {
      videoRef.current.srcObject = new MediaStream([webcamStream.track]);
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.srcObject = null;
    }
  }, [webcamStream, webcamOn]);

  useEffect(() => {
    if (!audioRef.current || isLocal) return; // don't play your own mic back
    if (micOn && micStream) {
      audioRef.current.srcObject = new MediaStream([micStream.track]);
      // apply speaker selected on precall screen
      if (speakerId && audioRef.current.setSinkId) audioRef.current.setSinkId(speakerId).catch(() => {});
      audioRef.current.play().catch(() => {});
    } else {
      audioRef.current.srcObject = null;
    }
  }, [micStream, micOn, isLocal, speakerId]);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="relative aspect-video bg-slate-900">
        <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
        {!webcamOn && (
          <span className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">Camera off</span>
        )}
      </div>
      <p className="flex items-center justify-between px-3 py-1.5 text-sm">
        <span>
          {displayName}
          {isLocal ? " (You)" : ""}
        </span>
        <span className="text-xs text-slate-500">{micOn ? "mic on" : "muted"}</span>
      </p>
      <audio ref={audioRef} autoPlay />
    </div>
  );
}
