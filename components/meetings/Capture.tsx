"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mic, MonitorSpeaker, Square, Upload, ClipboardPaste, RotateCw, Check, Loader2, AlertTriangle } from "lucide-react";
import type { Result } from "@/lib/result";

type Part = { index: number; startSec: number; durationSec: number; status: "uploading" | "done" | "failed"; text?: string; error?: string; blob?: Blob };
type Mode = "record" | "upload" | "paste";

const PART_SEC = 120;
const fmt = (s: number) => `${Math.floor(s / 3600) ? `${Math.floor(s / 3600)}:` : ""}${String(Math.floor((s % 3600) / 60)).padStart(Math.floor(s / 3600) ? 2 : 1, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function pickMime() {
  const options = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return options.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "";
}

// 16-bit mono WAV from float samples.
function wav(samples: Float32Array, rate: number) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const x = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

export default function Capture({
  meetingId,
  existing,
  finish,
  initialMode,
}: {
  meetingId: string;
  existing: { index: number; startSec: number; durationSec: number | null; status: string; text: string | null; error: string | null }[];
  finish: (prev: Result, fd: FormData) => Promise<Result>;
  initialMode: Mode;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [parts, setParts] = useState<Part[]>(() =>
    existing.map((s) => ({ index: s.index, startSec: s.startSec, durationSec: s.durationSec ?? 0, status: s.status === "DONE" ? "done" : s.status === "FAILED" ? "failed" : "uploading", text: s.text ?? undefined, error: s.error ?? undefined })),
  );
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState<Result>(null);
  const [pending, start] = useTransition();
  const [skipFailed, setSkipFailed] = useState(false);
  const stop = useRef<() => void>(() => {});
  const stopAll = useRef<() => void>(() => {});
  const nextIndex = useRef(existing.reduce((m, s) => Math.max(m, s.index + 1), 0));
  const offset = useRef(existing.reduce((m, s) => Math.max(m, s.startSec + (s.durationSec ?? 0)), 0));

  const uploading = parts.some((p) => p.status === "uploading");
  const failed = parts.filter((p) => p.status === "failed");
  const done = parts.filter((p) => p.status === "done");

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (recording || uploading) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [recording, uploading]);

  async function send(part: Part) {
    setParts((ps) => [...ps.filter((p) => p.index !== part.index), { ...part, status: "uploading" as const, error: undefined }].sort((a, b) => a.index - b.index));
    const fd = new FormData();
    const ext = part.blob!.type.includes("wav") ? "wav" : part.blob!.type.includes("mp4") ? "m4a" : "webm";
    fd.append("audio", part.blob!, `part-${part.index}.${ext}`);
    fd.append("index", String(part.index));
    fd.append("startSec", String(part.startSec));
    fd.append("durationSec", String(part.durationSec));
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(`/api/meetings/${meetingId}/segments`, { method: "POST", body: fd });
        const json = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
        if (!res.ok) throw new Error(json.error || `Upload failed (${res.status})`);
        setParts((ps) => ps.map((p) => (p.index === part.index ? { ...p, status: "done", text: json.text, blob: undefined } : p)));
        return;
      } catch (err) {
        if (attempt === 1) setParts((ps) => ps.map((p) => (p.index === part.index ? { ...p, status: "failed", error: err instanceof Error ? err.message : "Failed" } : p)));
        else await new Promise((r) => setTimeout(r, 2500));
      }
    }
  }

  async function record(withTab: boolean) {
    setError("");
    let mic: MediaStream | null = null;
    let tab: MediaStream | null = null;
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (withTab) {
        tab = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        if (!tab.getAudioTracks().length) {
          tab.getTracks().forEach((t) => t.stop());
          mic.getTracks().forEach((t) => t.stop());
          setError("No tab audio came through. When you choose the Meet tab, tick “Also share tab audio”.");
          return;
        }
      }
    } catch {
      mic?.getTracks().forEach((t) => t.stop());
      setError(withTab ? "Sharing was cancelled, or the browser blocked it." : "The browser didn't allow the microphone. Allow it in the address bar and try again.");
      return;
    }
    // Mix the mic and the tab into one track.
    const ac = new AudioContext();
    const dest = ac.createMediaStreamDestination();
    ac.createMediaStreamSource(mic).connect(dest);
    if (tab) ac.createMediaStreamSource(new MediaStream(tab.getAudioTracks())).connect(dest);
    const stream = dest.stream;
    const mime = pickMime();
    let lock: WakeLockSentinel | null = null;
    try {
      lock = (await navigator.wakeLock?.request("screen")) ?? null;
    } catch {}

    let active = true;
    const began = Date.now();
    const tick = setInterval(() => setElapsed(Math.round((Date.now() - began) / 1000)), 1000);

    // Each part is its own recording so it can be transcribed on its own.
    const runPart = () => {
      if (!active) return;
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
      const chunks: Blob[] = [];
      const partStart = Date.now();
      const index = nextIndex.current++;
      const startSec = offset.current + (partStart - began) / 1000;
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        const durationSec = Math.round((Date.now() - partStart) / 1000);
        const blob = new Blob(chunks, { type: rec.mimeType || mime || "audio/webm" });
        void send({ index, startSec: Math.round(startSec), durationSec, status: "uploading", blob });
        if (active) runPart();
      };
      rec.start();
      const t = setTimeout(() => rec.state === "recording" && rec.stop(), PART_SEC * 1000);
      stop.current = () => {
        clearTimeout(t);
        if (rec.state === "recording") rec.stop();
      };
    };

    const end = () => {
      if (!active) return;
      active = false;
      stop.current();
      clearInterval(tick);
      offset.current += Math.round((Date.now() - began) / 1000);
      setTimeout(() => {
        mic!.getTracks().forEach((t) => t.stop());
        tab?.getTracks().forEach((t) => t.stop());
        void ac.close();
      }, 300);
      void lock?.release().catch(() => {});
      setRecording(false);
    };
    tab?.getVideoTracks()[0]?.addEventListener("ended", end);
    tab?.getAudioTracks()[0]?.addEventListener("ended", end);
    setRecording(true);
    setElapsed(0);
    runPart();
    stopAll.current = end;
  }

  async function uploadFile(file: File) {
    setError("");
    setBusy("Reading the recording…");
    try {
      const ac = new AudioContext({ sampleRate: 16000 });
      const audio = await ac.decodeAudioData(await file.arrayBuffer());
      void ac.close();
      // Mix to mono.
      const mono = new Float32Array(audio.length);
      for (let ch = 0; ch < audio.numberOfChannels; ch++) {
        const d = audio.getChannelData(ch);
        for (let i = 0; i < d.length; i++) mono[i] += d[i] / audio.numberOfChannels;
      }
      const rate = audio.sampleRate;
      const per = PART_SEC * rate;
      const list: Part[] = [];
      for (let s = 0, i = 0; s < mono.length; s += per, i++) {
        const slice = mono.subarray(s, Math.min(mono.length, s + per));
        list.push({ index: nextIndex.current++, startSec: Math.round(offset.current + s / rate), durationSec: Math.round(slice.length / rate), status: "uploading", blob: wav(slice, rate) });
      }
      offset.current += Math.round(mono.length / rate);
      setParts((ps) => [...ps, ...list]);
      setBusy(`Transcribing ${list.length} part${list.length === 1 ? "" : "s"}…`);
      // Two at a time.
      let cursor = 0;
      await Promise.all(
        [0, 1].map(async () => {
          while (cursor < list.length) await send(list[cursor++]);
        }),
      );
    } catch {
      setError("That file couldn't be read. Try an MP3, M4A, WAV or WebM recording.");
    } finally {
      setBusy("");
    }
  }

  function writeNotes(transcript?: string) {
    const fd = new FormData();
    if (transcript) fd.append("transcript", transcript);
    if (skipFailed) fd.append("skipFailed", "on");
    start(async () => {
      const res = await finish(null, fd);
      setResult(res);
      if (res?.ok) router.refresh();
    });
  }

  const tabs: { id: Mode; label: string; icon: React.ReactNode }[] = [
    { id: "record", label: "Record", icon: <Mic size={14} aria-hidden /> },
    { id: "upload", label: "Upload a recording", icon: <Upload size={14} aria-hidden /> },
    { id: "paste", label: "Paste a transcript", icon: <ClipboardPaste size={14} aria-hidden /> },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={mode === t.id} disabled={recording} onClick={() => setMode(t.id)} className={mode === t.id ? "btn-primary btn-sm" : "btn-quiet btn-sm"}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {mode === "record" && (
        <div className="flex flex-col gap-3">
          {recording ? (
            <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-field p-4">
              <span className="flex items-center gap-2 text-sm font-extrabold text-bad">
                <span className="size-2.5 animate-pulse rounded-full bg-bad" /> Recording {fmt(elapsed)}
              </span>
              <button type="button" className="btn-danger btn-sm" onClick={() => stopAll.current()}>
                <Square size={13} aria-hidden /> Stop
              </button>
              <span className="text-xs text-muted">Each two minutes is transcribed as you go. Keep this tab open.</span>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-3">
                <button type="button" className="btn-primary" onClick={() => record(false)}>
                  <Mic size={15} aria-hidden /> {parts.length ? "Record more" : "Record this room"}
                </button>
                <button type="button" className="btn-quiet" onClick={() => record(true)}>
                  <MonitorSpeaker size={15} aria-hidden /> Record a Google Meet tab + my mic
                </button>
              </div>
              <p className="hint">
                For an online call, pick the Meet tab when asked and tick “Also share tab audio”. Works in Chrome and Edge on a computer. Let everyone know the call is being recorded.
              </p>
            </>
          )}
        </div>
      )}

      {mode === "upload" && (
        <div className="flex flex-col gap-2">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-line-2 p-6 text-center text-sm hover:bg-field">
            <Upload size={18} aria-hidden />
            <span className="font-bold">Choose a recording</span>
            <span className="text-xs text-muted">MP3, M4A, WAV or WebM. Up to about 90 minutes on a computer.</span>
            <input type="file" accept="audio/*,video/webm,video/mp4" className="sr-only" disabled={!!busy} onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])} />
          </label>
          {busy && (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Loader2 size={14} className="animate-spin" aria-hidden /> {busy}
            </p>
          )}
        </div>
      )}

      {mode === "paste" && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            writeNotes(String(new FormData(e.currentTarget).get("transcript") ?? ""));
          }}
        >
          <textarea name="transcript" rows={12} className="field font-mono text-xs" placeholder={"Paste the transcript from Meet, Otter, Fireflies or anywhere else.\nNames before each line help, e.g. “Tolu: the homepage is next…”"} />
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn-primary" disabled={pending}>
              {pending ? "Writing the notes…" : "Write the notes"}
            </button>
            {result?.error && <span className="text-sm text-bad">{result.error}</span>}
          </div>
        </form>
      )}

      {error && (
        <p className="flex items-start gap-2 rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden /> {error}
        </p>
      )}

      {parts.length > 0 && (
        <div className="flex flex-col gap-3">
          <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line">
            {parts.map((p) => (
              <li key={p.index} className="flex items-start gap-3 px-3 py-2.5 text-sm">
                <span className="mt-0.5 w-14 shrink-0 font-mono text-xs text-muted">{fmt(p.startSec)}</span>
                <span className="min-w-0 flex-1">
                  {p.status === "uploading" && (
                    <span className="flex items-center gap-2 text-muted">
                      <Loader2 size={13} className="animate-spin" aria-hidden /> Transcribing…
                    </span>
                  )}
                  {p.status === "done" && <span className="line-clamp-2 text-ink-2">{p.text || <i className="text-muted">No speech</i>}</span>}
                  {p.status === "failed" && <span className="text-bad">{p.error || "Couldn't transcribe this part."}</span>}
                </span>
                {p.status === "done" && <Check size={14} className="mt-0.5 text-good" aria-label="Done" />}
                {p.status === "failed" && p.blob && (
                  <button type="button" className="btn-quiet btn-sm" onClick={() => send(p)}>
                    <RotateCw size={12} aria-hidden /> Retry
                  </button>
                )}
              </li>
            ))}
          </ul>
          {!recording && (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className="btn-primary" disabled={pending || uploading || !done.length} onClick={() => writeNotes()}>
                {pending ? "Writing the notes…" : uploading ? "Waiting for transcription…" : "Write the notes"}
              </button>
              {failed.length > 0 && (
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={skipFailed} onChange={(e) => setSkipFailed(e.target.checked)} /> Write notes without the {failed.length} failed part{failed.length === 1 ? "" : "s"}
                </label>
              )}
              {result?.error && mode !== "paste" && <span className="text-sm text-bad">{result.error}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
