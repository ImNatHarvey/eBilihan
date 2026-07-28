import { useEffect, useRef, useState } from "react";
import { X, ScanFace, CheckCircle2 } from "lucide-react";
import { useFaceCaptureStore } from "@/store/faceCaptureStore";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Ring/label color as the scan "assesses" the face — cycles cool-to-warm, then flashes green on success. */
const SCAN_RING_COLORS = ["border-sky-400", "border-cyan-300", "border-amber-400"] as const;

/**
 * Front-camera face liveness capture — DEMO STAND-IN, not real liveness/anti-spoof
 * detection. eVerify's real Face Liveness Web SDK (src/lib/everifyFaceLiveness.ts)
 * does that properly via a hosted iframe, but requires a working EVERIFY_PUBKEY and
 * a real eGovPH QR the demo account is actually linked to — per explicit request,
 * the Loan flow uses this instead: a real front-camera photo capture that always
 * "succeeds", so there's still a genuine camera moment in the demo without depending
 * on external liveness infra. See LoanVerificationFlow.tsx's DEMO_BORROWER_PROFILE.
 */
export function FaceLivenessCaptureModal() {
  const isOpen = useFaceCaptureStore((s) => s.isOpen);
  const close = useFaceCaptureStore((s) => s.close);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(3);
  const [phase, setPhase] = useState<"scanning" | "success">("scanning");

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setError(null);
    setCountdown(3);
    setPhase("scanning");

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
        if (cancelled || !videoRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error && err.name === "NotAllowedError"
              ? "Camera permission was denied. Allow camera access and try again."
              : "Could not start the front camera. Your browser may not support this, or the connection isn't secure (HTTPS required).",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || error || countdown <= 0) return;
    const id = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [isOpen, error, countdown]);

  useEffect(() => {
    if (!isOpen || error || countdown > 0) return;
    // Countdown hit zero — grab the frame now, but hold on a green "success" flash
    // for a beat before actually resolving, so the analysis reads as real feedback.
    setPhase("success");
    const video = videoRef.current;
    let frame = "";
    if (video && video.videoWidth > 0) {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")?.drawImage(video, 0, 0);
      frame = canvas.toDataURL("image/jpeg", 0.8);
    }
    const id = setTimeout(() => close(frame), 550);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, error, countdown]);

  if (!isOpen) return null;

  const ringColor = phase === "success" ? "border-green-400" : SCAN_RING_COLORS[3 - countdown] ?? SCAN_RING_COLORS[0];

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-black">
      <div className="relative flex-1 overflow-hidden">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video ref={videoRef} autoPlay className="h-full w-full object-cover [transform:scaleX(-1)]" muted playsInline />

        {!error && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div
              className={cn(
                "h-56 w-44 rounded-[50%] border-4 shadow-[0_0_24px_var(--tw-shadow-color)] transition-colors duration-500",
                phase === "success" ? "scale-105 shadow-green-400/60" : "animate-pulse shadow-sky-400/40",
                ringColor,
              )}
            />
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-full bg-black/50 px-4 py-1.5 text-2xl font-bold text-white transition-colors duration-500",
                phase === "success" && "text-green-400",
              )}
            >
              {phase === "success" ? <CheckCircle2 className="h-6 w-6" /> : countdown > 0 ? countdown : "..."}
            </span>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6">
            <p className="text-center text-sm text-white">{error}</p>
          </div>
        )}

        <div className="absolute left-0 right-0 top-4 flex justify-center">
          <span
            className={cn(
              "flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-xs font-medium text-white transition-colors duration-500",
              phase === "success" && "text-green-400",
            )}
          >
            {phase === "success" ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" /> Liveness confirmed
              </>
            ) : (
              <>
                <ScanFace className="h-3.5 w-3.5" /> Hold still — analyzing face...
              </>
            )}
          </span>
        </div>
      </div>

      <div className="shrink-0 bg-black p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button variant="outline" className="w-full border-white/30 bg-transparent text-white hover:bg-white/10" onClick={() => close(null)}>
          <X className="h-4 w-4" /> Cancel
        </Button>
      </div>
    </div>
  );
}
