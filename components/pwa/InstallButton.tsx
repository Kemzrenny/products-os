"use client";

import { useEffect, useState } from "react";
import { Download, Share } from "lucide-react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

// "Install app": uses the browser's install prompt where there is one (Chrome, Edge,
// Android), and explains Add to Home Screen on iPhone, where there isn't.
export default function InstallButton({ className = "btn-quiet btn-sm" }: { className?: string }) {
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    // Reading the device once on mount; nothing to sync afterwards.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInstalled(!!standalone);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as InstallEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || (!deferred && !ios)) return null;

  if (ios) {
    return (
      <span className="relative inline-flex">
        <button type="button" className={className} onClick={() => setShowIosHelp((v) => !v)}>
          <Download size={14} aria-hidden /> Install app
        </button>
        {showIosHelp && (
          <span role="status" className="card absolute top-full right-0 z-50 mt-2 w-64 p-3 text-xs leading-relaxed text-ink-2">
            In Safari, tap <Share size={12} className="inline align-[-2px]" aria-label="Share" /> then <b>Add to Home Screen</b>.
          </span>
        )}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        await deferred!.prompt();
        await deferred!.userChoice;
        setDeferred(null);
      }}
    >
      <Download size={14} aria-hidden /> Install app
    </button>
  );
}
