import { useState, useEffect } from "react";

const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  // iPadOS 13+ reports itself as a Mac; the touch check separates it from a desktop.
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  window.navigator.standalone === true;

// Offers to install the app to the home screen.
// Chrome/Edge hand us a `beforeinstallprompt` event we can replay on a tap.
// Safari has no such API, so iOS gets walked through Share -> Add to Home Screen.
export default function InstallPrompt({ dark }) {
  const [deferred, setDeferred] = useState(null);
  const [installed, setInstalled] = useState(isStandalone);
  const [showHow, setShowHow] = useState(false);

  useEffect(() => {
    const onPrompt = e => {
      e.preventDefault();
      setDeferred(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
      setShowHow(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const ios = isIOS();
  // Nothing useful to offer: already installed, or a browser that can neither
  // show the prompt nor be walked through it.
  if (installed || (!deferred && !ios)) return null;

  const card = dark ? "#1a1a2e" : "#fff";
  const border = dark ? "#2d2d44" : "#e2e8f0";
  const text = dark ? "#e2e8f0" : "#0f172a";
  const sub = dark ? "#8b8ba7" : "#64748b";

  const onInstall = async () => {
    if (!deferred) {
      setShowHow(true);
      return;
    }
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") setInstalled(true);
    // The event can only be used once; Chrome fires a fresh one if declined.
    setDeferred(null);
  };

  return (
    <>
      <div style={{
        marginTop: 18, background: card, border: `1px solid ${border}`, borderRadius: 16,
        padding: 18, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12, flexShrink: 0,
          background: "linear-gradient(135deg,#6366f1,#a855f7,#ec4899)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontWeight: 800, fontSize: 15, letterSpacing: 0.5,
        }}>SAT</div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: text }}>Add to your home screen</div>
          <div style={{ fontSize: 13, color: sub, marginTop: 3 }}>
            Opens full screen and works offline — your progress stays on the device.
          </div>
        </div>
        <button onClick={onInstall} style={{
          background: "linear-gradient(90deg,#6366f1,#ec4899)", border: "none", borderRadius: 10,
          padding: "11px 22px", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer",
        }}>
          {deferred ? "Install" : "How to install"}
        </button>
      </div>

      {showHow && (
        <div onClick={() => setShowHow(false)} style={{
          position: "fixed", inset: 0, background: "#000a", display: "flex",
          alignItems: "center", justifyContent: "center", padding: 20, zIndex: 300,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: card, border: `1px solid ${border}`, borderRadius: 18,
            padding: 24, maxWidth: 380, width: "100%", color: text,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontWeight: 800, fontSize: 17 }}>Add to Home Screen</div>
              <button onClick={() => setShowHow(false)} style={{
                background: "none", border: "none", color: sub, cursor: "pointer", fontSize: 24, lineHeight: 1,
              }}>×</button>
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.9, color: sub }}>
              <div><b style={{ color: text }}>1.</b> Tap the <b style={{ color: text }}>Share</b> button in Safari&apos;s toolbar.</div>
              <div><b style={{ color: text }}>2.</b> Scroll down and choose <b style={{ color: text }}>Add to Home Screen</b>.</div>
              <div><b style={{ color: text }}>3.</b> Tap <b style={{ color: text }}>Add</b>.</div>
            </div>
            <div style={{ fontSize: 12, color: sub, marginTop: 14, paddingTop: 14, borderTop: `1px solid ${border}` }}>
              Safari only — this won&apos;t appear in Chrome on iPhone.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
