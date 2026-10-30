// Token comes from .env (see .env.example) — Vite only exposes vars prefixed with VITE_
// Get one at https://app.videosdk.live/api-keys
export const TOKEN = import.meta.env.VITE_VIDEOSDK_TOKEN;

// hardcoded so a Mac and a phone land in the same room without typing anything
export const MEETING_ID = import.meta.env.VITE_MEETING_ID || "s45k-jbni-zxud";
