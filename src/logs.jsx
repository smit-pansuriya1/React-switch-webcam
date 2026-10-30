import { useCallback, useEffect, useRef, useState } from "react";

// Only webcam-change results/errors are logged: each goes to the console, the
// on-screen log panel and a short toast.

// one line per entry: [time] [who @ device] message
export const formatLog = (l) => `[${l.time}]${l.from ? ` [${l.from}]` : ""} ${l.msg}`;

export function useLogs() {
  const [logs, setLogs] = useState([]);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const log = useCallback((msg, { level = "info", from = "", time } = {}) => {
    const entry = { time: time || new Date().toLocaleTimeString([], { hour12: false }), level, msg, from };
    (level === "error" ? console.error : console.log)(formatLog(entry));
    setLogs((l) => [...l, entry]);
    setToast(entry);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
    return entry;
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);
  return { logs, log, toast };
}

export function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div
      className={`fixed inset-x-4 bottom-4 z-50 mx-auto max-w-xl rounded-md px-3 py-2 font-mono text-xs break-words text-white shadow-lg ${
        toast.level === "error" ? "bg-red-600" : "bg-slate-800"
      }`}
    >
      {formatLog(toast)}
    </div>
  );
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function CopyButton({ text, label = "Copy" }) {
  const [copied, setCopied] = useState("");
  const copy = async () => {
    setCopied((await copyText(text)) ? "Copied" : "Copy failed (select the text manually)");
    setTimeout(() => setCopied(""), 2000);
  };
  return (
    <span className="flex items-center gap-2">
      <button onClick={copy} className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs hover:bg-slate-100">
        {label}
      </button>
      {copied && <span className="text-xs text-slate-500">{copied}</span>}
    </span>
  );
}

export function LogPanel({ logs, header }) {
  const text = (header ? header + "\n\n" : "") + logs.map(formatLog).join("\n");
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Switch Logs (all participants)</h3>
        <CopyButton text={text} label="Copy logs" />
      </div>
      <div className="max-h-72 overflow-y-auto font-mono text-xs leading-relaxed">
        {logs.length === 0 && <p className="text-slate-400">No webcam changes yet</p>}
        {[...logs].reverse().map((l, i) => (
          <div key={logs.length - i} className={`break-words ${l.level === "error" ? "text-red-600" : ""}`}>
            {formatLog(l)}
          </div>
        ))}
      </div>
    </section>
  );
}

// device / participant info, in a selectable block for copy-paste
export function DeviceInfoPanel({ text }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Device Info</h3>
        <CopyButton text={text} />
      </div>
      <pre className="overflow-x-auto font-mono text-xs whitespace-pre-wrap break-words text-slate-600">{text}</pre>
    </section>
  );
}
