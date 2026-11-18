"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Room, RoomEvent, Track, ConnectionState, type Participant, type RemoteTrack } from "livekit-client";
import { Mic, MicOff, Video, VideoOff, MonitorUp, PhoneOff, Loader2, AlertTriangle, Captions, CaptionsOff } from "lucide-react";
import { initials } from "@/lib/format";
import type { Result } from "@/lib/result";

const PART_SEC = 120;

type Join = { url: string; token: string; callStartedAt: number; serverNow: number; me: { id: string; name: string } };

function pickMime() {
  const options = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return options.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "";
}

// Shows a participant's camera (or screen) and plays their audio.
function Tile({ p, source, big }: { p: Participant; source: Track.Source; big?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const cam = p.getTrackPublication(source)?.track;
  const mic = p.isLocal ? undefined : p.getTrackPublication(Track.Source.Microphone)?.track;
  const showVideo = !!cam && !p.getTrackPublication(source)?.isMuted;
  useEffect(() => {
    if (!cam || !video.current) return;
    cam.attach(video.current);
    const el = video.current;
    return () => void cam.detach(el);
  }, [cam]);
  useEffect(() => {
    if (!mic || !audio.current || source !== Track.Source.Camera) return;
    mic.attach(audio.current);
    const el = audio.current;
    return () => void mic.detach(el);
  }, [mic, source]);
  const name = p.name || p.identity;
  return (
    <div className={`relative flex aspect-video items-center justify-center overflow-hidden rounded-2xl bg-ink ${p.isSpeaking && source === Track.Source.Camera ? "ring-2 ring-accent" : ""} ${big ? "md:col-span-2" : ""}`}>
      {showVideo ? (
        <video ref={video} autoPlay playsInline muted={p.isLocal} className={`size-full ${source === Track.Source.ScreenShare ? "object-contain" : "object-cover"} ${p.isLocal && source === Track.Source.Camera ? "-scale-x-100" : ""}`} />
      ) : (
        <span className="flex size-16 items-center justify-center rounded-full bg-white/10 text-xl font-extrabold text-white">{initials(name)}</span>
      )}
      {mic && <audio ref={audio} autoPlay />}
      <span className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-lg bg-black/55 px-2 py-1 text-xs font-semibold text-white">
        {source === Track.Source.ScreenShare ? `${name}'s screen` : `${name}${p.isLocal ? " (you)" : ""}`}
        {source === Track.Source.Camera && !p.isMicrophoneEnabled && <MicOff size={12} aria-label="Muted" />}
      </span>
    </div>
  );
}

export default function CallRoom({ meetingId, title, endCall, canEnd }: { meetingId: string; title: string; endCall: () => Promise<Result>; canEnd: boolean }) {
  const router = useRouter();
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const room = useRef<Room | null>(null);
  const [live, setLive] = useState<Room | null>(null);
  const [phase, setPhase] = useState<"ready" | "joining" | "in" | "leaving" | "error">("ready");
  const [error, setError] = useState("");
  const [transcribe, setTranscribe] = useState(true);
  const [uploads, setUploads] = useState({ sent: 0, pending: 0, failed: 0 });
  const rec = useRef<{ stop: () => void; flush: () => Promise<void> } | null>(null);
  const timing = useRef({ startedAt: 0, skew: 0 });
  const nextIndex = useRef(0);
  const inflight = useRef(new Set<Promise<void>>());
  const joined = useRef(false);

  const send = useCallback(
    async (blob: Blob, index: number, startSec: number, durationSec: number) => {
      setUploads((u) => ({ ...u, pending: u.pending + 1 }));
      const fd = new FormData();
      fd.append("audio", blob, `call-${index}.${blob.type.includes("mp4") ? "m4a" : "webm"}`);
      fd.append("index", String(index));
      fd.append("startSec", String(Math.max(0, Math.round(startSec))));
      fd.append("durationSec", String(durationSec));
      fd.append("track", "self");
      let ok = false;
      for (let attempt = 0; attempt < 3 && !ok; attempt++) {
        try {
          const res = await fetch(`/api/meetings/${meetingId}/segments`, { method: "POST", body: fd, keepalive: blob.size < 60_000 });
          ok = res.ok;
        } catch {}
        if (!ok) await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      }
      setUploads((u) => ({ sent: u.sent + (ok ? 1 : 0), pending: u.pending - 1, failed: u.failed + (ok ? 0 : 1) }));
    },
    [meetingId],
  );

  // Records this person's own mic in two-minute parts. Everyone does the same on their
  // device, so each line of the transcript has the right name on it.
  const startRecording = useCallback(() => {
    const r = room.current;
    if (!r || rec.current) return;
    const mime = pickMime();
    let active = true;
    let current: MediaRecorder | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let done: (() => void) | null = null;
    const runPart = () => {
      const track = r.localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack;
      if (!active || !track) return;
      const mr = new MediaRecorder(new MediaStream([track]), mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
      const chunks: Blob[] = [];
      const began = Date.now();
      const index = nextIndex.current++;
      const startSec = (began + timing.current.skew - timing.current.startedAt) / 1000;
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      mr.onstop = () => {
        const p = send(new Blob(chunks, { type: mr.mimeType || mime || "audio/webm" }), index, startSec, Math.round((Date.now() - began) / 1000));
        inflight.current.add(p);
        void p.finally(() => inflight.current.delete(p));
        if (active) runPart();
        else done?.();
      };
      mr.start();
      current = mr;
      timer = setTimeout(() => mr.state === "recording" && mr.stop(), PART_SEC * 1000);
    };
    runPart();
    rec.current = {
      stop: () => {
        active = false;
        clearTimeout(timer);
        if (current?.state === "recording") current.stop();
      },
      flush: () =>
        new Promise<void>((resolve) => {
          active = false;
          clearTimeout(timer);
          if (current?.state === "recording") {
            done = () => resolve();
            current.stop();
          } else resolve();
        }).then(() => Promise.all([...inflight.current]).then(() => {})),
    };
  }, [send]);

  const stopRecording = useCallback(async () => {
    const r = rec.current;
    rec.current = null;
    await r?.flush();
  }, []);

  const leave = useCallback(async () => {
    setPhase("leaving");
    await stopRecording();
    await room.current?.disconnect();
    router.push(`/app/meetings/${meetingId}`);
    router.refresh();
  }, [meetingId, router, stopRecording]);

  async function join() {
    setPhase("joining");
    setError("");
    try {
      const res = await fetch(`/api/meetings/${meetingId}/join`, { method: "POST" });
      const j = (await res.json()) as Join & { error?: string };
      if (!res.ok) throw new Error(j.error || "Couldn't join the call.");
      timing.current = { startedAt: j.callStartedAt, skew: j.serverNow - Date.now() };
      const r = new Room({ adaptiveStream: true, dynacast: true, audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      room.current = r;
      setLive(r);
      for (const ev of [
        RoomEvent.ParticipantConnected,
        RoomEvent.ParticipantDisconnected,
        RoomEvent.TrackSubscribed,
        RoomEvent.TrackUnsubscribed,
        RoomEvent.TrackMuted,
        RoomEvent.TrackUnmuted,
        RoomEvent.LocalTrackPublished,
        RoomEvent.LocalTrackUnpublished,
        RoomEvent.ActiveSpeakersChanged,
        RoomEvent.ConnectionStateChanged,
      ])
        r.on(ev, rerender);
      r.on(RoomEvent.TrackSubscribed, (t: RemoteTrack) => t.kind === Track.Kind.Audio && rerender());
      r.on(RoomEvent.Disconnected, () => {
        // Ended for everyone, or the connection dropped for good: send what we have.
        // (A failed first connection is handled where join() catches it.)
        if (!joined.current) return;
        void stopRecording().then(() => {
          router.push(`/app/meetings/${meetingId}`);
          router.refresh();
        });
      });
      await r.connect(j.url, j.token);
      joined.current = true;
      await r.localParticipant.setMicrophoneEnabled(true);
      setPhase("in");
      if (transcribe) startRecording();
    } catch (err) {
      setPhase("error");
      const msg = err instanceof Error ? err.message : "";
      setError(
        /signal connection|failed to fetch|websocket|timeout/i.test(msg)
          ? "Couldn’t reach the call server. Check your connection and try again."
          : /permission|notallowed|denied/i.test(msg)
            ? "The browser didn’t allow the microphone. Allow it in the address bar and try again."
            : msg || "Couldn’t join the call. Check the microphone permission and your connection.",
      );
      await room.current?.disconnect();
      room.current = null;
      setLive(null);
    }
  }

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (room.current?.state === ConnectionState.Connected) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      rec.current?.stop();
      void room.current?.disconnect();
    };
  }, []);

  const r = live;
  const people: Participant[] = r ? [r.localParticipant, ...r.remoteParticipants.values()] : [];
  const screens = people.filter((p) => p.getTrackPublication(Track.Source.ScreenShare)?.track);
  const lp = r?.localParticipant;

  if (phase !== "in" && phase !== "leaving") {
    return (
      <div className="flex flex-col items-start gap-4 rounded-2xl border border-line bg-card p-6">
        <div>
          <p className="text-lg font-extrabold">{title}</p>
          <p className="mt-1 max-w-xl text-sm text-muted">
            The call is transcribed: while you&apos;re in it, your own microphone is recorded on this device and sent in two-minute parts, so the notes know who said what. You can turn this off for yourself in the call.
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={join} disabled={phase === "joining"}>
          {phase === "joining" ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Mic size={15} aria-hidden />} {phase === "joining" ? "Joining…" : "Join call"}
        </button>
        {error && (
          <p className="flex items-start gap-2 rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden /> {error}
          </p>
        )}
      </div>
    );
  }

  const ctrl = "flex size-12 items-center justify-center rounded-full border border-line bg-card text-ink hover:bg-bg-2 disabled:opacity-50";
  return (
    <div className="flex flex-col gap-4 pb-24">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="flex items-center gap-2 font-extrabold">
          <span className={`size-2.5 rounded-full ${r?.state === ConnectionState.Connected ? "bg-good" : "animate-pulse bg-warn"}`} />
          {r?.state === ConnectionState.Reconnecting ? "Reconnecting…" : `${people.length} in the call`}
        </span>
        <span className="text-xs text-muted">
          {transcribe ? "Transcribing your mic" : "Not transcribing your mic"}
          {uploads.sent + uploads.pending + uploads.failed > 0 && ` · ${uploads.sent} part${uploads.sent === 1 ? "" : "s"} sent${uploads.pending ? `, ${uploads.pending} sending` : ""}${uploads.failed ? `, ${uploads.failed} failed` : ""}`}
        </span>
      </div>

      <div className={`grid gap-3 ${people.length + screens.length > 1 ? "sm:grid-cols-2" : ""} ${people.length + screens.length > 4 ? "lg:grid-cols-3" : ""}`}>
        {screens.map((p) => (
          <Tile key={`${p.identity}-screen`} p={p} source={Track.Source.ScreenShare} big />
        ))}
        {people.map((p) => (
          <Tile key={p.identity} p={p} source={Track.Source.Camera} />
        ))}
      </div>

      <div className="pb-safe fixed inset-x-0 bottom-0 z-50 flex items-center justify-center gap-3 border-t border-line bg-card/95 py-3 backdrop-blur lg:left-[248px]">
        <button type="button" className={ctrl} aria-label={lp?.isMicrophoneEnabled ? "Mute" : "Unmute"} onClick={async () => { await lp?.setMicrophoneEnabled(!lp.isMicrophoneEnabled); rerender(); }}>
          {lp?.isMicrophoneEnabled ? <Mic size={18} /> : <MicOff size={18} className="text-bad" />}
        </button>
        <button type="button" className={ctrl} aria-label={lp?.isCameraEnabled ? "Turn camera off" : "Turn camera on"} onClick={async () => { try { await lp?.setCameraEnabled(!lp.isCameraEnabled); } catch { setError("The camera isn't available."); } rerender(); }}>
          {lp?.isCameraEnabled ? <Video size={18} /> : <VideoOff size={18} />}
        </button>
        <button type="button" className={`${ctrl} max-sm:hidden`} aria-label={lp?.isScreenShareEnabled ? "Stop sharing" : "Share screen"} onClick={async () => { try { await lp?.setScreenShareEnabled(!lp.isScreenShareEnabled); } catch {} rerender(); }}>
          <MonitorUp size={18} className={lp?.isScreenShareEnabled ? "text-accent" : ""} />
        </button>
        <button
          type="button"
          className={ctrl}
          aria-label={transcribe ? "Stop transcribing me" : "Transcribe me"}
          title={transcribe ? "Stop transcribing me" : "Transcribe me"}
          onClick={() => {
            if (transcribe) void stopRecording();
            else startRecording();
            setTranscribe(!transcribe);
          }}
        >
          {transcribe ? <Captions size={18} /> : <CaptionsOff size={18} className="text-muted" />}
        </button>
        <button type="button" className="flex h-12 items-center gap-2 rounded-full bg-bad px-5 text-sm font-bold text-white disabled:opacity-60" onClick={leave} disabled={phase === "leaving"}>
          <PhoneOff size={17} aria-hidden /> {phase === "leaving" ? "Sending…" : "Leave"}
        </button>
        {canEnd && (
          <button
            type="button"
            className="btn-quiet btn-sm max-sm:hidden"
            disabled={phase === "leaving"}
            onClick={async () => {
              if (!window.confirm("End the call for everyone? Everyone's last part is sent, then you can write the notes.")) return;
              setPhase("leaving");
              await stopRecording();
              await endCall();
              await room.current?.disconnect();
            }}
          >
            End for all
          </button>
        )}
      </div>
      {error && <p className="text-sm text-bad">{error}</p>}
    </div>
  );
}
