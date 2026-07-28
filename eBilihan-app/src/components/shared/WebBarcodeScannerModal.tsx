import { useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import { X, ScanLine } from "lucide-react";
import { useScannerStore } from "@/store/scannerStore";
import { Button } from "@/components/ui/button";

/**
 * Full-screen camera barcode/QR scanner for browser tabs (ML Kit — used on native
 * builds — has no real web implementation; see useBarcodeScanner.ts). Uses ZXing
 * (getUserMedia + canvas decoding) rather than the newer native BarcodeDetector API
 * since that still isn't supported on iOS Safari.
 *
 * Rendered once in AppShell.tsx; opened imperatively via useScannerStore so call
 * sites (POSView, LoanVerificationFlow) just `await scanOnce()` same as native.
 *
 * Requires a secure context (HTTPS or localhost) — getUserMedia is blocked on plain
 * `http://<lan-ip>`, which is why this only really works once deployed (or on
 * `localhost` in a desktop browser).
 */
export function WebBarcodeScannerModal() {
  const isOpen = useScannerStore((s) => s.isOpen);
  const close = useScannerStore((s) => s.close);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setError(null);

    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (cancelled || !videoRef.current) return;

        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: "environment" } },
          videoRef.current,
          (result) => {
            if (result) close(result.getText());
          },
        );
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error && err.name === "NotAllowedError"
              ? "Camera permission was denied. Allow camera access and try again."
              : "Could not start the camera. Your browser may not support this, or the connection isn't secure (HTTPS required).",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [isOpen, close]);

  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-black">
      <div className="relative flex-1 overflow-hidden">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />

        {!error && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-48 w-48 rounded-2xl border-4 border-white/70" />
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6">
            <p className="text-center text-sm text-white">{error}</p>
          </div>
        )}

        <div className="absolute left-0 right-0 top-4 flex justify-center">
          <span className="flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-xs font-medium text-white">
            <ScanLine className="h-3.5 w-3.5" /> Point at a barcode or QR code
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
