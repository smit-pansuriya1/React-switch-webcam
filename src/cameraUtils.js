// Camera finding / ranking helpers + tiny timing utilities used by the
// "Switch Webcam (label logic)" flow (precall detection and in-meeting switching).
//
// Finding logic (per side "front" / "back"):
//   - if the device reports a facing hint (`facing` or `facingMode`): front when it
//     matches /front|user/, otherwise back;
//   - else the label must contain "front" / "back" (case-insensitive);
//   - matches are sorted by rank(): Android "camera N" / "camera2 N" index first,
//     otherwise a lens penalty (dual wide 1, dual 2, triple 3, ultra wide 5,
//     telephoto 6) * 1000 + label length, so the plain main lens comes first and the
//     shortest label breaks ties.

const PENALTY = [
  [/dual wide/i, 1],
  [/\bdual\b/i, 2],
  [/triple/i, 3],
  [/ultra wide|ultra-wide/i, 5],
  [/telephoto/i, 6],
];

export function rank(label) {
  const m = (label || "").match(/camera2?\s*(\d+)/i); // Android index, fixed for camera2
  if (m) return parseInt(m[1], 10);
  let p = 0;
  for (const [re, w] of PENALTY) if (re.test(label)) p = Math.max(p, w);
  return p * 1000 + (label || "").length; // plain lens first, shortest label as tiebreak
}

const facingHint = (c) => c.facing || c.facingMode || "";

// All cameras matching a side, best-first.
export function matchingCameras(cameraList, side) {
  return (cameraList || [])
    .filter((c) => (c.kind || "videoinput") === "videoinput")
    .filter((c) =>
      facingHint(c)
        ? side === "front"
          ? /front|user/i.test(facingHint(c))
          : !/front|user/i.test(facingHint(c))
        : (c.label || "").toLowerCase().includes(side)
    )
    .sort((a, b) => rank(a.label || "") - rank(b.label || ""));
}

// Returns { front, back, frontList, backList, canFlip, cams } where front/back are
// the best-ranked camera for each side (or null) and cams is every video input.
export function pickCameras(list) {
  const cams = (list || []).filter((c) => (c.kind || "videoinput") === "videoinput");
  const frontList = matchingCameras(cams, "front");
  const backList = matchingCameras(cams, "back");
  const front = frontList[0] || null;
  const back = backList[0] || null;
  return { front, back, frontList, backList, canFlip: !!(front && back), cams };
}

// Which side (front/back/null) a deviceId belongs to in a pickCameras() result.
export function sideOf(picked, deviceId) {
  if (!picked || !deviceId) return null;
  if (picked.frontList?.some((c) => c.deviceId === deviceId)) return "front";
  if (picked.backList?.some((c) => c.deviceId === deviceId)) return "back";
  return null;
}

export const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
export const ms = (t) => `${Math.round(t)}ms`;
export const camLabel = (cam) => (cam ? cam.label || cam.deviceId : "none");

// Short, copy-pasteable description of this device/browser for the observation logs.
export function deviceInfo() {
  const ua = navigator.userAgent || "";
  const uad = navigator.userAgentData;
  const mobile = uad?.mobile ?? /Mobi|Android|iPhone|iPad/i.test(ua);
  // iPadOS reports itself as a Mac; touch points give it away
  const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  let os = uad?.platform || "";
  if (!os) {
    if (/iPhone|iPad|iPod/.test(ua) || iPadOS) os = "iOS";
    else if (/Android/.test(ua)) os = "Android";
    else if (/Mac OS X/.test(ua)) os = "macOS";
    else if (/Windows/.test(ua)) os = "Windows";
    else if (/Linux/.test(ua)) os = "Linux";
    else os = navigator.platform || "unknown";
  }
  let browser = "unknown";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/CriOS\//.test(ua)) browser = "Chrome iOS";
  else if (/Chrome\//.test(ua)) browser = "Chrome";
  else if (/FxiOS\//.test(ua)) browser = "Firefox iOS";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua)) browser = "Safari";
  const short = `${mobile || iPadOS ? "Mobile" : "Desktop"} ${os} ${browser}`;
  return {
    short,
    full: `${short} | screen ${window.screen?.width}x${window.screen?.height} @${window.devicePixelRatio || 1}x | UA: ${ua}`,
  };
}

// SDK v1 errors carry a code; keep both in log lines
export const errText = (err) => `${err?.code ? err.code + " " : ""}${err?.message || err}`;
